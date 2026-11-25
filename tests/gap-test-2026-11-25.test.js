// Weekly gap test 2026-11-25. Confirmed on published 1.17.4 against
// colinhacks/zod d40c329, fastapi/full-stack-fastapi-template 77e550a,
// square/retrofit 6b82cb5, and sinatra/sinatra 2e3f791.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

vi.mock("../src/ai/provider.js", () => ({
  generateText: vi.fn().mockResolvedValue({ success: false }),
  isAIEnabled: vi.fn().mockReturnValue(false),
}));

import { scanRepo } from "../src/core/scan.js";
import { detectMonorepo } from "../src/analyzers/monorepo-detector.js";
import { analyzeDependencyGraph } from "../src/analyzers/dependency-graph.js";
import { analyzeSecurityPatterns } from "../src/analyzers/security-patterns.js";
import { buildAIContext } from "../src/analyzers/context-builder.js";
import { generateDeveloperOnboarding } from "../src/ai/generate-sections.js";
import { renderSecurityHotspots } from "../src/renderers/renderAnalysis.js";
import { renderArchitectureDiff } from "../src/renderers/renderDiff.js";
import { getGitDiff, resolveDefaultDiffBase } from "../src/core/diff.js";
import { detectSetupCommands } from "../src/utils/setup-commands.js";
import { detectProjectName } from "../src/utils/project-name.js";

let tempDir;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-1125-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

async function write(rel, content) {
  const file = path.join(tempDir, rel);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content);
  return rel;
}

function scanConfig(extra = {}) {
  return {
    __repoRoot: tempDir,
    configVersion: 1,
    project: { name: "fixture" },
    publishers: ["markdown"],
    module_roots: ["frontend", "backend", "packages", "hooks", "src"],
    scan: {
      include: ["**/*.{js,mjs,ts,tsx,py,java}"],
      ignore: ["**/node_modules/**"],
      ...extra,
    },
    outputs: { pages: [{ key: "system_overview", title: "System Overview" }] },
  };
}

describe("workspace paths and nested manifests", () => {
  it("keeps an exact workspace path and reads FastAPI and React from nested manifests", async () => {
    await write("package.json", JSON.stringify({
      name: "fastapi-full-stack-template",
      private: true,
      workspaces: ["frontend", "packages/*"],
      scripts: { test: "bun run --filter frontend test" },
    }));
    await write("bun.lock", "");
    await write("uv.lock", "");
    await write("pyproject.toml", "[tool.uv.workspace]\nmembers = [\"backend\"]\n");
    await write("backend/pyproject.toml", [
      "[project]",
      "dependencies = [\"fastapi[standard]>=0.1\"]",
      "",
      "[dependency-groups]",
      "dev = [\"pytest>=7\"]",
      "",
    ].join("\n"));
    await write("backend/app/main.py", "def main():\n    return 1\n");
    await write("frontend/package.json", JSON.stringify({
      name: "frontend",
      dependencies: { react: "^19.0.0", "react-dom": "^19.0.0" },
      devDependencies: { vite: "^6.0.0", "@playwright/test": "1.40.0" },
    }));
    await write("frontend/src/main.tsx", "export const app = 1;\n");
    await write("frontend/src/decoy/package.json", JSON.stringify({ name: "not-a-workspace" }));
    await write("packages/react-email/package.json", JSON.stringify({ name: "emails" }));
    await write("packages/react-email/index.ts", "export const email = 1;\n");
    await write("hooks/post_gen_project.py", "def hook():\n    return None\n");

    const mono = await detectMonorepo(tempDir);
    expect(mono.tool).toBe("bun workspaces");
    expect(mono.packages.map((pkg) => pkg.path).sort()).toEqual(["frontend", "packages/react-email"]);
    expect(mono.packages.map((pkg) => pkg.name).sort()).toEqual(["emails", "frontend"]);

    const scan = await scanRepo(scanConfig());
    expect(scan.metadata.frameworks).toEqual(expect.arrayContaining(["FastAPI", "React"]));
    expect(scan.metadata.buildTools).toEqual(expect.arrayContaining(["Vite"]));
    expect(scan.metadata.testFrameworks).toEqual(expect.arrayContaining(["pytest", "Playwright"]));
    expect(scan.metadata.setup.install).toEqual(expect.arrayContaining(["bun install", "uv sync"]));
    expect(scan.metadata.setup.test).toEqual(expect.arrayContaining(["bun test", "pytest"]));
    expect(scan.metadata.setup.install.join(" ")).not.toMatch(/\bnpm install\b/);

    const context = buildAIContext(scan, scanConfig());
    const hooks = context.topModules.find((mod) => mod.key === "hooks");
    expect(hooks?.type).not.toBe("hooks");
    const onboarding = await generateDeveloperOnboarding(context, {}, scanConfig());
    expect(onboarding).toContain("Hook scripts");
    expect(onboarding).not.toContain("React Hooks");
    expect(onboarding).toContain("FastAPI");
    expect(onboarding).toContain("React");
    expect(onboarding).not.toContain("Standard toolchain");
    expect(onboarding).not.toContain("general-purpose tools");
  });

  it("follows packageManager instead of a leftover lockfile", async () => {
    await write("package.json", JSON.stringify({
      private: true,
      packageManager: "nub@0.8.3",
      workspaces: ["packages/*"],
      scripts: { test: "nub exec --node vitest run" },
    }));
    await write("pnpm-lock.yaml", "lockfileVersion: '9.0'\n");
    await write("packages/zod/package.json", JSON.stringify({ name: "zod" }));

    expect((await detectMonorepo(tempDir)).tool).toBe("nub workspaces");
    expect(detectSetupCommands(tempDir)).toMatchObject({
      install: ["nub install"],
      test: ["nub test"],
    });
  });

  it("does not put a benchmark package in the high-priority onboarding rows", async () => {
    await write("package.json", JSON.stringify({ name: "zod", workspaces: ["packages/*"] }));
    await write("packages/zod/src/index.ts", "export const z = 1;\n");
    await write("packages/bench/object.ts", "export const bench = 1;\n");
    const scan = await scanRepo({
      ...scanConfig(),
      module_roots: ["packages"],
    });
    const context = buildAIContext(scan, scanConfig());
    const onboarding = await generateDeveloperOnboarding(context, {}, scanConfig());
    expect(onboarding).not.toMatch(/\| ⭐ High \| `packages\/bench`/);
  });
});

describe("documentation websites and project names", () => {
  it("does not treat an Astro docs site as product JavaScript or high-severity XSS", async () => {
    await write("src/main/java/retrofit2/Call.java", "package retrofit2;\npublic interface Call {}\n");
    await write("website/astro.config.mjs", "export default {};\n");
    await write("website/public/script.js", "span.innerHTML = \"<a>\" + name + \"</a>\";\n");
    await write("settings.gradle", "rootProject.name = 'retrofit-root'\n");

    expect(detectProjectName(tempDir)).toBe("retrofit");

    const scan = await scanRepo(scanConfig());
    expect([...scan.metadata.languages]).toContain("Java");
    expect([...scan.metadata.languages]).not.toContain("JavaScript");
    expect(scan.modules.some((mod) => mod.docsSite)).toBe(true);
    expect(scan.modules[0].docsSite).not.toBe(true);

    const security = await analyzeSecurityPatterns(scan._files, tempDir);
    expect(security.bySeverity.high).toBe(0);
    expect(security.filesScanned).toBe(0);
    expect(security.docsSitesSkipped).toEqual(["website"]);
    const page = renderSecurityHotspots(security);
    expect(page).toMatch(/documentation site/);
    expect(page).not.toMatch(/High/);
    expect(page).not.toMatch(/No security anti-patterns were detected/);

    const graph = await analyzeDependencyGraph(scan._files, tempDir);
    expect(graph.nodes.some((node) => String(node.file || "").includes("script.js"))).toBe(false);
  });
});

describe("default branch diff and Ruby onboarding", () => {
  it("diffs origin/HEAD when the default branch is not main", () => {
    execFileSync("git", ["init", "-b", "master"], { cwd: tempDir, stdio: "ignore" });
    execFileSync("git", ["config", "user.email", "repolens@example.com"], { cwd: tempDir, stdio: "ignore" });
    execFileSync("git", ["config", "user.name", "RepoLens"], { cwd: tempDir, stdio: "ignore" });
    execFileSync("git", ["commit", "--allow-empty", "-m", "init"], { cwd: tempDir, stdio: "ignore" });
    execFileSync("git", ["update-ref", "refs/remotes/origin/master", "HEAD"], { cwd: tempDir, stdio: "ignore" });
    execFileSync("git", ["symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/master"], { cwd: tempDir, stdio: "ignore" });

    expect(resolveDefaultDiffBase(tempDir)).toBe("origin/master");
    const diff = getGitDiff(resolveDefaultDiffBase(tempDir), tempDir);
    expect(diff.unavailable).toBeUndefined();
    expect(diff.modified).toEqual([]);
  });

  it("does not describe a failed diff as no architecture changes", () => {
    const page = renderArchitectureDiff({
      added: [],
      removed: [],
      modified: [],
      unavailable: true,
      reason: "git diff could not be read; continuing with an empty diff.",
    });
    expect(page).toMatch(/could not read a git diff/);
    expect(page).not.toMatch(/No architecture-relevant changes/);
  });

  it("onboards a Ruby repo with Bundler and Rake, not npm", async () => {
    await write("Gemfile", "gem 'minitest', '~> 5.0'\n");
    await write("Rakefile", "require 'minitest/test_task'\ntask default: :test\nMinitest::TestTask.create\n");
    const setup = detectSetupCommands(tempDir);
    expect(setup.install).toEqual(["bundle install"]);
    expect(setup.test).toEqual(["bundle exec rake test"]);
    expect(setup.buildTools).toContain("Rake");
    expect(setup.extraTestFrameworks).toContain("Minitest");
    expect(setup.install.join(" ")).not.toMatch(/npm/);
  });
});
