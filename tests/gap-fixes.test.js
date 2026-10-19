import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseCliArgs } from "../src/cli-args.js";
import { branchMatches } from "../src/utils/branch.js";
import { classifyDiffLine, getGitDiff } from "../src/core/diff.js";
import { loadYaml } from "../src/utils/yaml.js";
import { resolveOutputDir, safeFileName } from "../src/utils/safe-path.js";
import { retryDelayMs } from "../src/utils/retry.js";
import { LATEST_VERSION_URL } from "../src/utils/update-check.js";
import { writeDocumentSet } from "../src/docs/write-doc-set.js";
import { scanRepo } from "../src/core/scan.js";
import { runInit } from "../src/init.js";
import { detectSecrets } from "../src/utils/secrets.js";
import { validateConfig } from "../src/utils/validate.js";

describe("CLI argument parsing", () => {
  it("accepts a command with flags before or after it", () => {
    const parsed = parseCliArgs(["--verbose", "publish", "--config", "cfg.yml"]);
    expect(parsed.errors).toEqual([]);
    expect(parsed.command).toBe("publish");
    expect(parsed.flags["--verbose"]).toBe(true);
    expect(parsed.flags["--config"]).toBe("cfg.yml");
    expect(parsed.version).toBe(false);
  });

  it("rejects unknown flags and missing flag values", () => {
    expect(parseCliArgs(["publish", "--not-a-flag"]).errors[0]).toMatch(/Unknown option/);
    expect(parseCliArgs(["publish", "--config"]).errors[0]).toMatch(/requires a value/);
    expect(parseCliArgs(["publish", "--target", "--force"]).errors[0]).toMatch(/requires a value/);
  });

  it("treats --version and --help as terminal requests", () => {
    expect(parseCliArgs(["publish", "--version"]).version).toBe(true);
    expect(parseCliArgs(["--help", "init"]).help).toBe(true);
  });
});

describe("branch globs", () => {
  it("matches wildcards and ignores regex metacharacters", () => {
    expect(branchMatches("release/*", "release/1.0")).toBe(true);
    expect(branchMatches("release/*", "feature/auth")).toBe(false);
    expect(branchMatches("release/*)", "release/1")).toBe(false);
    expect(branchMatches("release/(.*)", "release/1")).toBe(false);
  });
});

describe("git diff safety", () => {
  it("does not pass an unsafe ref to git", () => {
    expect(getGitDiff("origin/main; touch /tmp/repolens-pwned")).toEqual({
      added: [],
      removed: [],
      modified: [],
    });
    expect(getGitDiff("-p")).toEqual({ added: [], removed: [], modified: [] });
  });

  it("diffs the requested repository and stays quiet when it is not a git repo", async () => {
    const repo = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-diff-"));
    const missing = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-notgit-"));
    try {
      execFileSync("git", ["init"], { cwd: repo, stdio: "ignore" });
      execFileSync("git", ["config", "user.email", "repolens@example.com"], { cwd: repo, stdio: "ignore" });
      execFileSync("git", ["config", "user.name", "RepoLens"], { cwd: repo, stdio: "ignore" });
      await fs.writeFile(path.join(repo, "tracked.js"), "export const n = 1;\n");
      execFileSync("git", ["add", "tracked.js"], { cwd: repo, stdio: "ignore" });
      execFileSync("git", ["commit", "-m", "init"], { cwd: repo, stdio: "ignore" });
      await fs.writeFile(path.join(repo, "tracked.js"), "export const n = 2;\n");

      expect(getGitDiff("HEAD", repo).modified).toEqual(["tracked.js"]);
      expect(getGitDiff("HEAD", missing)).toEqual({ added: [], removed: [], modified: [] });

      execFileSync("git", ["add", "tracked.js"], { cwd: repo, stdio: "ignore" });
      execFileSync("git", ["commit", "-m", "second"], { cwd: repo, stdio: "ignore" });
      const base = execFileSync("git", ["rev-parse", "HEAD~1"], { cwd: repo, encoding: "utf8" }).trim();
      await fs.writeFile(path.join(repo, "added.js"), "export const added = 1;\n");
      execFileSync("git", ["add", "added.js"], { cwd: repo, stdio: "ignore" });
      execFileSync("git", ["commit", "-m", "added"], { cwd: repo, stdio: "ignore" });
      expect(getGitDiff(base, repo, "HEAD").added).toContain("added.js");
      expect(getGitDiff(base, repo, "HEAD; id")).toEqual({ added: [], removed: [], modified: [] });
    } finally {
      await fs.rm(repo, { recursive: true, force: true });
      await fs.rm(missing, { recursive: true, force: true });
    }
  });

  it("records the destination of a rename", () => {
    expect(classifyDiffLine("R100\told.js\tnew.js")).toEqual({ bucket: "modified", file: "new.js" });
    expect(classifyDiffLine("A\tadded.js")).toEqual({ bucket: "added", file: "added.js" });
    expect(classifyDiffLine("D\tremoved.js")).toEqual({ bucket: "removed", file: "removed.js" });
  });
});

describe("YAML loading", () => {
  it("parses JSON-style booleans and leaves the old yes/no spellings as strings", () => {
    expect(loadYaml("enabled: true\n")).toEqual({ enabled: true });
    expect(loadYaml("enabled: yes\n")).toEqual({ enabled: "yes" });
  });

  it("rejects alias bombs", () => {
    const lines = ["a: &a x"];
    for (let i = 0; i < 2001; i += 1) lines.push(`b${i}: *a`);
    expect(() => loadYaml(lines.join("\n"))).toThrow(/aliases/);
  });
});

describe("output paths", () => {
  it("rejects output directories that leave the repository", () => {
    const root = "/tmp/repo";
    expect(resolveOutputDir(root, ".repolens")).toBe(path.resolve(root, ".repolens"));
    expect(() => resolveOutputDir(root, "../outside")).toThrow(/escapes/);
    expect(() => resolveOutputDir(root, "/etc")).toThrow(/relative path/);
  });

  it("drops directory segments from document names", () => {
    expect(safeFileName("../../etc/passwd")).toBe("passwd");
    expect(safeFileName("00-executive-summary.md")).toBe("00-executive-summary.md");
  });

  it("writes documents inside the output directory twice with the same bytes", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-docs-"));
    const docSet = {
      documents: [
        { filename: "../../etc/passwd", content: "safe\n" },
        { filename: "00-executive-summary.md", content: "# Hi\n" },
      ],
      artifacts: { context: {}, modules: {}, flows: {} },
      config: { documentation: { include_artifacts: false, output_dir: ".repolens" } },
    };
    try {
      await writeDocumentSet(docSet, root);
      await writeDocumentSet(docSet, root);
      const inside = path.join(root, ".repolens", "passwd");
      const summary = path.join(root, ".repolens", "00-executive-summary.md");
      expect(await fs.readFile(inside, "utf8")).toBe("safe\n");
      expect(await fs.readFile(summary, "utf8")).toBe("# Hi\n");
      expect(path.resolve(root, ".repolens", "passwd").startsWith(path.resolve(root))).toBe(true);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});

describe("scan edge cases", () => {
  let root;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-scan-"));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("warns and returns an empty result for an empty repository", async () => {
    const result = await scanRepo({
      __repoRoot: root,
      scan: { include: ["**/*.js"], ignore: [] },
      module_roots: ["src"],
    });
    expect(result.filesCount).toBe(0);
    expect(result.modules).toEqual([]);
  });

  it("does not parse binary files as source", async () => {
    const body = Buffer.concat([
      Buffer.from("app.get('/secret'"),
      Buffer.from([0]),
      Buffer.from(", () => {})"),
    ]);
    await fs.writeFile(path.join(root, "blob.js"), body);
    const result = await scanRepo({
      __repoRoot: root,
      scan: { include: ["**/*.js"], ignore: [] },
      module_roots: ["src"],
    });
    expect(result.filesCount).toBe(1);
    expect(result.api).toEqual([]);
  });
});

describe("network helpers", () => {
  it("ignores an unparseable Retry-After header", () => {
    const delay = retryDelayMs("not-a-date", 0, 500, 4000);
    expect(delay).toBe(500);
    expect(Number.isFinite(delay)).toBe(true);
  });

  it("honours a zero Retry-After", () => {
    expect(retryDelayMs("0", 0, 5000, 8000)).toBe(0);
  });

  it("queries the scoped package for updates", () => {
    expect(LATEST_VERSION_URL).toBe("https://registry.npmjs.org/@chappibunny%2Frepolens/latest");
  });
});

describe("secret patterns", () => {
  it("detects fine-grained GitHub tokens", () => {
    const findings = detectSecrets("github_pat_11AAAAAAA0123456789_abcdefghijklmnopqrstuvwxyz");
    expect(findings.some((finding) => finding.type === "GitHub Fine-Grained Token")).toBe(true);
  });
});

describe("scan pattern validation", () => {
  it("rejects absolute include patterns", () => {
    const result = validateConfig({
      configVersion: 1,
      publishers: ["markdown"],
      scan: { include: ["/etc/passwd"] },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes("Absolute pattern"))).toBe(true);
  });
});

describe("non-interactive init", () => {
  it("scaffolds files when the wizard cannot run", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-init-"));
    try {
      await runInit(root, { interactive: true });
      const config = await fs.readFile(path.join(root, ".repolens.yml"), "utf8");
      expect(config).toContain("configVersion: 1");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
