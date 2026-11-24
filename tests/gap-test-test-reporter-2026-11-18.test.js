// Gap test 2026-11-18 on dorny/test-reporter: the root module is named after the project
// (not the checkout folder), a GitHub Action is described as one, and fixture projects
// built by npm *-fixture scripts do not drive the tech stack or business domains.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { detectScriptFixtureDirs, fixtureDirOf } from "../src/utils/fixture-dirs.js";
import { parseActionManifest, detectGitHubAction } from "../src/utils/github-action-detect.js";
import { scanRepo } from "../src/core/scan.js";
import { generateDocumentSet } from "../src/docs/generate-doc-set.js";

let tempDir;
async function write(rel, content) {
  const full = path.join(tempDir, rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content);
  return rel;
}
beforeEach(async () => {
  // The checkout folder name differs from the package name, like a clone into `trscan`.
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-tr-"));
  tempDir = path.join(parent, "trscan");
  await fs.mkdir(tempDir);
});
afterEach(async () => { await fs.rm(path.dirname(tempDir), { recursive: true, force: true }); });

const ACTION_YML = `name: 'Test Reporter'
description: 'Shows test results'
inputs:
  name:
    description: 'Check name'
runs:
  using: 'node24'
  main: 'dist/index.js'
`;

async function testReporterLike({ action = ACTION_YML, pkg = {} } = {}) {
  await write("package.json", JSON.stringify({
    name: "test-reporter",
    private: true,
    main: "lib/main.js",
    scripts: {
      build: "tsc",
      "dotnet-fixture": "dotnet test reports/dotnet/DotnetTests.XUnitTests --logger \"trx;LogFileName=../../__tests__/fixtures/dotnet-trx.trx\"",
      "golang-json-fixture": "go test -v -json -timeout 5s ./reports/go | tee __tests__/fixtures/golang-json.json",
      "jest-fixture": "cd reports/jest && npm test",
      "stale-fixture": "dotnet test reports/dotnet-nunit-legacy/Missing.csproj",
    },
    devDependencies: { jest: "^29.0.0", typescript: "^5.0.0" },
    ...pkg,
  }));
  if (action) await write("action.yml", action);
  await write("jest.config.cjs", "module.exports = {};\n");
  await write("src/main.ts", "import { parse } from './parsers/jest'\nexport function run() { return parse('') }\n");
  await write("src/parsers/jest.ts", "export function parse(s: string) { return s }\n");
  await write("src/report/summary.ts", "export const summary = 1\n");
  await write("__tests__/jest.test.ts", "import { parse } from '../src/parsers/jest'\ntest('x', () => expect(parse('')).toBe(''))\n");
  await write("__tests__/report/summary.test.ts", "import { summary } from '../../src/report/summary'\ntest('x', () => expect(summary).toBe(1))\n");
  await write("reports/dotnet/DotnetTests.Unit/Calculator.cs", "namespace DotnetTests.Unit { public class Calculator { public int Sum(int a, int b) => a + b; } }\n");
  await write("reports/dotnet/DotnetTests.Unit/DotnetTests.Unit.csproj", "<Project Sdk=\"Microsoft.NET.Sdk\"></Project>\n");
  await write("reports/dotnet/DotnetTests.XUnitTests/CalculatorTests.cs", "namespace DotnetTests.XUnitTests { public class CalculatorTests { } }\n");
  await write("reports/go/calculator.go", "package calc\nfunc Sum(a, b int) int { return a + b }\n");
  await write("reports/jest/calculator.js", "module.exports = (a, b) => a + b\n");
  await write("reports/jest/calculator.test.js", "const sum = require('./calculator')\ntest('x', () => expect(sum(1, 2)).toBe(3))\n");
}

function config() {
  return {
    __repoRoot: tempDir,
    project: { name: "trscan" },
    scan: { include: ["**/*.{ts,js,cjs,cs,go}"], ignore: ["**/node_modules/**"] },
    documentation: { sections: ["executive_summary", "system_overview", "business_domains", "architecture_overview", "module_catalog"], include_artifacts: false },
    branding: false,
  };
}

async function docs() {
  const scan = await scanRepo(config());
  const { documents } = await generateDocumentSet(scan, config());
  const byKey = Object.fromEntries(documents.map((d) => [d.key, d.content]));
  return { scan, byKey, all: documents.map((d) => d.content).join("\n") };
}

describe("fixture directories from npm *-fixture scripts", () => {
  it("finds the project dirs the fixture scripts build and ignores stale or product paths", async () => {
    await testReporterLike({ pkg: { scripts: {
      "dotnet-fixture": "dotnet test reports/dotnet/DotnetTests.XUnitTests",
      "go-fixture": "go test ./reports/go | tee __tests__/fixtures/go.json",
      "jest-fixture": "cd reports/jest && npm test",
      "stale-fixture": "dotnet test reports/dotnet-nunit-legacy/Missing.csproj",
      "src-fixture": "node src/main.ts && node scripts/x.js",
      build: "tsc reports/other",
    } } });
    await write("__tests__/fixtures/go.json", "{}");
    const dirs = detectScriptFixtureDirs(tempDir).map((d) => d.dir).sort();
    expect(dirs).toEqual(["__tests__/fixtures", "reports/dotnet", "reports/go", "reports/jest"]);
    expect(dirs.some((d) => d === "reports" || d.startsWith("src") || d.startsWith("scripts"))).toBe(false);
    const all = detectScriptFixtureDirs(tempDir);
    expect(fixtureDirOf("reports/dotnet/DotnetTests.Unit/Calculator.cs", all)?.script).toBe("dotnet-fixture");
    expect(fixtureDirOf("reports/dotnetx/a.cs", all)).toBeNull();
    expect(fixtureDirOf("src/main.ts", all)).toBeNull();
  });

  it("returns nothing without a package.json or fixture scripts", async () => {
    expect(detectScriptFixtureDirs(tempDir)).toEqual([]);
    await write("package.json", "{ not json");
    expect(detectScriptFixtureDirs(tempDir)).toEqual([]);
  });

  it("keeps fixture languages and build files out of the tech stack", async () => {
    await testReporterLike();
    const { scan, byKey } = await docs();
    expect(scan.metadata.languages).not.toContain("C#");
    expect(scan.metadata.languages).not.toContain("Go");
    expect(scan.metadata.buildTools || []).not.toContain("MSBuild (.NET)");
    const builtWith = byKey.executive_summary.split("\n").find((l) => l.includes("**Built With**"));
    expect(builtWith).toContain("TypeScript");
    expect(builtWith).not.toMatch(/C#|Go\b|MSBuild/);
  });

  it("files fixture modules under Testing, not Analytics & Reporting", async () => {
    await testReporterLike();
    const { scan, byKey } = await docs();
    // C# and JavaScript fixture projects share the `reports` folder module.
    // The Go fixture is its own package directory (`reports/go`).
    expect(scan.modules.find((m) => m.key === "reports")?.fixture).toBe("dotnet-fixture, jest-fixture");
    expect(scan.modules.find((m) => m.key === "reports/go")?.fixture).toBe("golang-json-fixture");
    expect(byKey.business_domains).not.toMatch(/path `reports[^`]*` matches `report`/);
    expect(byKey.module_catalog).toMatch(/\| `reports` \| \d+ \| Test fixture project \(built by the `dotnet-fixture` and `jest-fixture` npm scripts\)/);
    expect(byKey.module_catalog).toMatch(/\| `reports\/go` \| \d+ \| Test fixture project \(built by the `golang-json-fixture` npm script\)/);
    // A test module whose subfolder says "report" is still a test module.
    expect(byKey.business_domains).not.toContain("path `__tests__/report` matches `report`");
  });
});

describe("fixture module boundaries", () => {
  it("marks a module only when all of its files are fixture files", async () => {
    await testReporterLike();
    await write("reports/summary.ts", "export const real = 1\n");
    const scan = await scanRepo(config());
    expect(scan.modules.find((m) => m.key === "reports")?.fixture).toBeUndefined();
  });

  it("names one script in the singular", async () => {
    const { describeFixtureScripts } = await import("../src/utils/fixture-dirs.js");
    expect(describeFixtureScripts("jest-fixture")).toBe("the `jest-fixture` npm script");
    expect(describeFixtureScripts("a-fixture, b-fixture")).toBe("the `a-fixture` and `b-fixture` npm scripts");
  });
});

describe("GitHub Action detection", () => {
  it("parses node, composite, and docker actions and rejects other files", () => {
    expect(parseActionManifest(ACTION_YML)).toEqual({ name: "Test Reporter", using: "node24", main: "dist/index.js" });
    expect(parseActionManifest("name: x\nruns:\n  using: \"composite\"\n  steps:\n    - run: echo\n").using).toBe("composite");
    expect(parseActionManifest("name: x\nruns:\n  using: docker\n  image: Dockerfile\n").using).toBe("docker");
    expect(parseActionManifest("name: x\nruns:\n  using: python3\n")).toBeNull();
    expect(parseActionManifest("on: push\njobs:\n  build:\n    runs-on: ubuntu-latest\n")).toBeNull();
  });

  it("finds action.yml or action.yaml at the root only", async () => {
    expect(detectGitHubAction(tempDir)).toBeNull();
    await write("sub/action.yml", ACTION_YML);
    expect(detectGitHubAction(tempDir)).toBeNull();
    await write("action.yaml", ACTION_YML);
    expect(detectGitHubAction(tempDir)).toMatchObject({ file: "action.yaml", using: "node24", main: "dist/index.js" });
  });

  it("describes a private package with action.yml as a GitHub Action", async () => {
    await testReporterLike();
    const { scan, byKey, all } = await docs();
    expect(scan.metadata.projectKind).toBe("action");
    expect(byKey.system_overview).toContain("| **Interface Type** | GitHub Action (node24, runs `dist/index.js`) |");
    expect(all).not.toContain("Library (imported API)");
    expect(byKey.executive_summary).toContain("GitHub Action");
  });

  it("keeps a published package with a composite action described by its package", async () => {
    await testReporterLike({
      action: "name: x\nruns:\n  using: composite\n  steps:\n    - run: npx tool\n",
      pkg: { private: false, bin: { tool: "bin/tool.js" } },
    });
    await write("bin/tool.js", "#!/usr/bin/env node\nconsole.log(1)\n");
    const { scan } = await docs();
    expect(scan.metadata.githubAction?.using).toBe("composite");
    expect(scan.metadata.projectKind).not.toBe("action");
  });
});

describe("root module name", () => {
  it("uses the package name, not the checkout folder, and types it neutrally", async () => {
    await testReporterLike();
    const { scan, byKey } = await docs();
    const keys = scan.modules.map((m) => m.key);
    expect(keys).toContain("test-reporter");
    expect(keys).not.toContain("trscan");
    expect(byKey.module_catalog).toMatch(/\| `test-reporter` \| \d+ \| Repository root files/);
    expect(byKey.business_domains).not.toContain("path `test-reporter` matches");
  });

  it("falls back to root when the project name collides with a top-level directory", async () => {
    await write("package.json", JSON.stringify({ name: "src", private: true }));
    await write("index.js", "module.exports = 1\n");
    await write("src/a.js", "module.exports = 2\n");
    const scan = await scanRepo({ ...config(), scan: { include: ["**/*.js"], ignore: [] } });
    const keys = scan.modules.map((m) => m.key);
    expect(keys).toContain("root");
    expect(keys.filter((k) => k === "src")).toHaveLength(1);
  });

  it("uses the last part of a scoped package name", async () => {
    await write("package.json", JSON.stringify({ name: "@acme/widget-kit" }));
    await write("index.js", "module.exports = 1\n");
    const scan = await scanRepo({ ...config(), scan: { include: ["**/*.js"], ignore: [] } });
    expect(scan.modules.map((m) => m.key)).toContain("widget-kit");
  });
});
