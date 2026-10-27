import { describe, it, expect, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  badgeMarkdown,
  badgeSvg,
  healthColor,
  runBadgeCli,
  shieldsEndpoint,
} from "../src/badge.js";
import {
  COMMENT_FOOTER,
  ARCHITECTURE_COMMENT_MARKER,
} from "../src/delivery/comment-constants.js";
import {
  compareArchitecture,
  isForkPullRequest,
  newHotspots,
  renderArchitectureComment,
  runPullRequestComment,
  upsertArchitectureComment,
} from "../src/delivery/architecture-comment.js";
import { actionSteps, resolveActionInputs } from "../scripts/github-action.js";
import { selfTest } from "../gallery/render.mjs";
import { renderLlmsFull, renderLlmsTxt, renderSiteLlmsTxt } from "../src/docs/llms-text.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function git(cwd, args) {
  execFileSync("git", ["-c", "safe.directory=*", ...args], {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function sampleRepo() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-growth-"));
  git(dir, ["init", "-b", "main"]);
  git(dir, ["config", "user.email", "test@example.com"]);
  git(dir, ["config", "user.name", "RepoLens Test"]);
  git(dir, ["config", "commit.gpgsign", "false"]);
  await fs.mkdir(path.join(dir, "src", "lib"), { recursive: true });
  await fs.writeFile(
    path.join(dir, "src", "lib", "calc.js"),
    "export function add(a, b) {\n  return a + b;\n}\n",
  );
  git(dir, ["add", "."]);
  git(dir, ["commit", "-m", "base"]);
  const base = execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" }).trim();

  await fs.writeFile(
    path.join(dir, "src", "lib", "parse.js"),
    [
      "const leftPad = require('left-pad');",
      "const { add } = require('./calc.js');",
      "function parse(input) {",
      "  if (input && input.a && input.b || input.c && input.d) {",
      "    if (input.e || input.f && input.g || input.h) {",
      "      if (input.i && input.j || input.k && input.l || input.m) {",
      "        if (input.n || input.o && input.p || input.q && input.r) {",
      "          if (input.s && input.t || input.u && input.v || input.w) {",
      "            if (input.x || input.y && input.z || input.aa && input.bb) {",
      "              eval(input.code);",
      "              return leftPad(add(input.a, input.b), 4);",
      "            }",
      "          }",
      "        }",
      "      }",
      "    }",
      "  }",
      "  return null;",
      "}",
      "module.exports = { parse };",
      "",
    ].join("\n"),
  );
  await fs.mkdir(path.join(dir, "src", "pages", "api"), { recursive: true });
  await fs.writeFile(
    path.join(dir, "src", "pages", "api", "users.js"),
    "export function GET() { return { ok: true }; }\n",
  );
  git(dir, ["add", "."]);
  git(dir, ["commit", "-m", "head"]);
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" }).trim();
  return { dir, base, head };
}

describe("code health badge", () => {
  it("maps scores to shields colors and square svg", () => {
    expect(healthColor(80)).toBe("brightgreen");
    expect(healthColor(79)).toBe("green");
    expect(healthColor(60)).toBe("green");
    expect(healthColor(59)).toBe("yellow");
    expect(healthColor(40)).toBe("yellow");
    expect(healthColor(39)).toBe("orange");
    expect(healthColor(20)).toBe("orange");
    expect(healthColor(19)).toBe("red");
    expect(healthColor(null)).toBe("lightgrey");
    const endpoint = shieldsEndpoint({ score: 84 });
    expect(endpoint).toEqual({
      schemaVersion: 1,
      label: "code health",
      message: "84",
      color: "brightgreen",
    });
    const svg = badgeSvg(endpoint);
    expect(svg).toContain("fill=\"#1565C0\"");
    expect(svg).not.toMatch(/rx=/);
    expect(svg).not.toMatch(/border-radius/);
    const markdown = badgeMarkdown({
      endpointUrl: "https://example.github.io/repo/repolens-badge.json",
      linkUrl: "https://example.github.io/repo/score/",
      name: "Demo",
    });
    expect(markdown).toContain("style=flat-square");
    expect(markdown).toContain("https://example.github.io/repo/score/");
    expect(markdown).toContain("img.shields.io/endpoint?url=");
  });

  it("writes json for a tiny repository and refuses an empty one", async () => {
    const { dir } = await sampleRepo();
    const out = path.join(dir, "repolens-badge.json");
    const code = await runBadgeCli({
      target: dir,
      format: "all",
      out,
      url: "https://example.github.io/app/repolens-badge.json",
      link: "https://example.github.io/app/",
    });
    expect(code).toBe(0);
    const endpoint = JSON.parse(await fs.readFile(out, "utf8"));
    expect(endpoint.schemaVersion).toBe(1);
    expect(endpoint.label).toBe("code health");
    expect(Number(endpoint.message)).toBeGreaterThanOrEqual(0);
    const svg = await fs.readFile(path.join(dir, "repolens-badge.svg"), "utf8");
    expect(svg).toContain("<svg");
    expect(svg).not.toMatch(/rx=/);

    const empty = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-empty-"));
    await fs.writeFile(path.join(empty, "README.md"), "# hi\n");
    expect(await runBadgeCli({ target: empty, format: "json" })).toBe(2);
    await fs.rm(dir, { recursive: true, force: true });
    await fs.rm(empty, { recursive: true, force: true });
  }, 20000);
});

describe("architecture pull request comment", () => {
  it("reports files, modules, dependencies, health delta, and new hotspots", async () => {
    const { dir, base, head } = await sampleRepo();
    const report = await compareArchitecture(dir, base, head);
    const body = renderArchitectureComment(report);
    expect(body.startsWith(ARCHITECTURE_COMMENT_MARKER)).toBe(true);
    expect(body).toContain(COMMENT_FOOTER);
    expect(body).toContain("Generated by [RepoLens](https://github.com/CHAPIBUNNY/repolens)");
    expect(body).toContain("[Gallery](https://chapibunny.github.io/repolens/)");
    expect(body).toContain("src/lib/parse.js");
    expect(body).toContain("src/pages/api/users.js");
    expect(body).toContain("`left-pad`");
    expect(body).toContain("### Modules");
    expect(body).toContain("src/lib");
    expect(body).toContain("### Code health");
    const fresh = newHotspots(report.baseScore.health, report.headScore.health);
    expect(fresh.some((item) => item.file.endsWith("parse.js"))).toBe(true);
    expect(body).toContain("parse.js");
    expect(report.headScore.health.stats.avgScore).toBeLessThan(report.baseScore.health.stats.avgScore);
    await fs.rm(dir, { recursive: true, force: true });
  }, 20000);

  it("does nothing on a push event", async () => {
    const code = await runPullRequestComment({
      event: null,
      env: { GITHUB_EVENT_NAME: "push" },
      request: async () => {
        throw new Error("push must not call the API");
      },
    });
    expect(code).toBe(0);
  });

  it("updates one sticky comment instead of posting a second", async () => {
    const comments = [];
    let nextId = 10;
    const request = async (method, url, body) => {
      if (method === "GET") return comments.map((item) => ({ ...item }));
      if (method === "POST") {
        const created = { id: nextId, body: body.body };
        nextId += 1;
        comments.push(created);
        return created;
      }
      if (method === "PATCH") {
        const id = Number(url.split("/").pop());
        const existing = comments.find((item) => item.id === id);
        existing.body = body.body;
        return existing;
      }
      throw new Error(`unexpected ${method}`);
    };
    const first = await upsertArchitectureComment({
      owner: "acme",
      repo: "app",
      issueNumber: 7,
      body: `${ARCHITECTURE_COMMENT_MARKER}\nfirst`,
      request,
    });
    const second = await upsertArchitectureComment({
      owner: "acme",
      repo: "app",
      issueNumber: 7,
      body: `${ARCHITECTURE_COMMENT_MARKER}\nsecond`,
      request,
    });
    expect(first.action).toBe("created");
    expect(second.action).toBe("updated");
    expect(second.id).toBe(first.id);
    expect(comments).toHaveLength(1);
    expect(comments[0].body).toContain("second");
  });

  it("skips fork comments and writes the job summary", async () => {
    const { dir, base, head } = await sampleRepo();
    const summary = path.join(dir, "summary.md");
    let called = false;
    const code = await runPullRequestComment({
      repo: dir,
      base,
      head,
      event: {
        pull_request: {
          number: 4,
          head: { sha: head, repo: { fork: true, full_name: "fork/app" } },
          base: { sha: base, repo: { full_name: "acme/app" } },
        },
      },
      env: { GITHUB_TOKEN: "ghp_should_not_be_sent", GITHUB_REPOSITORY: "acme/app" },
      summaryFile: summary,
      request: async () => {
        called = true;
        throw new Error("forks must not call the API");
      },
    });
    expect(code).toBe(0);
    expect(called).toBe(false);
    const text = await fs.readFile(summary, "utf8");
    expect(text).toContain("Fork pull request");
    expect(text).toContain(ARCHITECTURE_COMMENT_MARKER);
    expect(text).toContain(COMMENT_FOOTER);
    expect(isForkPullRequest({
      pull_request: { head: { repo: null }, base: { repo: { full_name: "acme/app" } } },
    })).toBe(true);
    await fs.rm(dir, { recursive: true, force: true });
  }, 20000);
});

describe("github action comment and badge modes", () => {
  const keys = ["REPOLENS_COMMAND", "REPOLENS_BADGE_OUT", "REPOLENS_BADGE_URL", "REPOLENS_BADGE_LINK", "REPOLENS_PR_COMMENT"];
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  afterEach(() => {
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it("runs comment and badge from the action source and posts one comment", () => {
    delete process.env.REPOLENS_BADGE_OUT;
    delete process.env.REPOLENS_BADGE_URL;
    delete process.env.REPOLENS_BADGE_LINK;
    process.env.REPOLENS_COMMAND = "comment";
    const comment = resolveActionInputs();
    expect(comment.local).toBe(true);
    expect(comment.args).toBeNull();
    expect(actionSteps(comment)).toEqual([
      { kind: "local", script: "pr-comment-run.js", env: { REPOLENS_PR_COMMENT: "true" } },
    ]);

    process.env.REPOLENS_COMMAND = "publish";
    process.env.REPOLENS_PR_COMMENT = "true";
    const publish = resolveActionInputs();
    const steps = actionSteps(publish);
    expect(steps[0].kind).toBe("npx");
    expect(steps[0].env.REPOLENS_PR_COMMENT).toBe("false");
    expect(steps[0].args[0]).toBe("--force");
    expect(steps[0].args[3]).toBe("publish");
    expect(steps[1].script).toBe("pr-comment-run.js");

    process.env.REPOLENS_COMMAND = "badge";
    process.env.REPOLENS_BADGE_URL = "https://example.github.io/app/repolens-badge.json";
    const badge = resolveActionInputs();
    expect(actionSteps(badge)[0].script).toBe("badge-run.js");
    expect(actionSteps(badge)[0].env.REPOLENS_BADGE_URL).toContain("https://");

    process.env.REPOLENS_COMMAND = "badge";
    process.env.REPOLENS_BADGE_URL = "javascript:alert(1)";
    expect(() => resolveActionInputs()).toThrow(/badge-url/);
  });
});

describe("gallery seo and llms.txt", () => {
  it("renders explained pages, score pages, and the renderer self-test", () => {
    expect(() => selfTest()).not.toThrow();
  });

  it("keeps repo-root llms files aligned with the generator", async () => {
    const llms = await fs.readFile(path.join(root, "llms.txt"), "utf8");
    const full = await fs.readFile(path.join(root, "llms-full.txt"), "utf8");
    expect(llms).toBe(renderLlmsTxt());
    expect(full).toBe(renderLlmsFull());
    expect(llms).toContain("npx @chappibunny/repolens");
    expect(llms).toContain("mcp");
    expect(llms).toContain("command: comment");
    expect(full).toContain("pull-requests: write");
    expect(full).toContain("SoftwareSourceCode");
    const site = renderSiteLlmsTxt({
      origin: "https://chapibunny.github.io",
      basePath: "/repolens",
      pages: [{
        slug: "express",
        name: "Express",
        blurb: "Web framework.",
        stats: { health: { score: 90 } },
      }],
    });
    expect(site).toContain("https://chapibunny.github.io/repolens/express/explained/");
    expect(site).toContain("Express architecture explained");
  });
});
