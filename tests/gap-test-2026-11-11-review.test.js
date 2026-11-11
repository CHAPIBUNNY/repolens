// Review follow-ups for the 2026-11-11 gap fixes: declared workspaces only, coverage
// that does not hide real supported code, a comment stripper that keeps strings, and
// badge coverage counted from one consistent walk.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { analyzeDependencyGraph } from "../src/analyzers/dependency-graph.js";
import { analyzeComplexity, computeCodeHealth } from "../src/analyzers/complexity-analyzer.js";
import { analyzeGraphQL } from "../src/analyzers/graphql-analyzer.js";
import { computeLanguageCoverage, badgeCoverageOk } from "../src/analyzers/language-coverage.js";
import { listWorkspacePackages } from "../src/analyzers/workspace-packages.js";
import { renderDependencyGraph } from "../src/renderers/renderAnalysis.js";
import { stripJsComments } from "../src/utils/js-lexer.js";
import { scoreRepository, runBadgeCli } from "../src/badge.js";
import { scanRepo } from "../src/core/scan.js";
import { generateDocumentSet } from "../src/docs/generate-doc-set.js";

let tempDir;
async function write(rel, content) {
  const full = path.join(tempDir, rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content);
  return rel;
}
beforeEach(async () => { tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-review-")); });
afterEach(async () => { await fs.rm(tempDir, { recursive: true, force: true }); });

async function quiet(fn) {
  const errors = [];
  const original = console.error;
  console.error = (...args) => errors.push(args.join(" "));
  try { return { value: await fn(), errors: errors.join("\n") }; } finally { console.error = original; }
}

describe("workspace members come from declarations only", () => {
  it("does not turn a test stub package.json named express into an internal package", async () => {
    await write("package.json", JSON.stringify({ name: "app", dependencies: { express: "^5.0.0" } }));
    const files = [
      await write("src/server.js", "import express from 'express';\nexport const app = express();\n"),
      await write("test/stubs/express/index.js", "export default function express() { return {}; }\n"),
    ];
    await write("test/stubs/express/package.json", JSON.stringify({ name: "express", main: "index.js" }));
    const graph = await analyzeDependencyGraph(files, tempDir);
    expect(graph.externalDeps).toContain("express");
    expect(graph.externalRuntime).toContain("express");
    expect(graph.edges).toEqual([]);
  });

  it("keeps the stub external even when the repository declares other workspaces", async () => {
    await write("package.json", JSON.stringify({ name: "mono", private: true, workspaces: ["packages/*"] }));
    await write("packages/a/package.json", JSON.stringify({ name: "@acme/a" }));
    const files = [
      await write("packages/a/src/index.js", "import express from 'express';\nexport const a = express;\n"),
      await write("packages/b/src/index.js", "import { a } from '@acme/a';\nexport const b = a;\n"),
      await write("packages/a/test/stubs/express/index.js", "export default 1;\n"),
    ];
    await write("packages/a/test/stubs/express/package.json", JSON.stringify({ name: "express" }));
    const graph = await analyzeDependencyGraph(files, tempDir);
    expect(graph.externalDeps).toEqual(["express"]);
    expect(graph.edges.map((e) => `${e.from} -> ${e.to}`)).toEqual(["packages/b/src -> packages/a/src"]);
  });

  it("honours negated patterns, the object form, and lerna", async () => {
    await write("package.json", JSON.stringify({ name: "mono", workspaces: { packages: ["packages/*", "!packages/legacy"] } }));
    await write("packages/core/package.json", JSON.stringify({ name: "@acme/core" }));
    await write("packages/legacy/package.json", JSON.stringify({ name: "@acme/legacy" }));
    await write("lerna.json", JSON.stringify({ packages: ["tools/*"] }));
    await write("tools/cli/package.json", JSON.stringify({ name: "@acme/cli" }));
    const { packages, sources } = await listWorkspacePackages(tempDir);
    expect(packages.map((p) => p.name).sort()).toEqual(["@acme/cli", "@acme/core"]);
    expect(sources).toEqual(["package.json workspaces", "lerna.json"]);
  });

  it("treats an npm: alias dependency as the registry package", async () => {
    await write("pnpm-workspace.yaml", "packages:\n  - 'packages/*'\n");
    await write("packages/ui/package.json", JSON.stringify({ name: "ui" }));
    await write("packages/app/package.json", JSON.stringify({ name: "app", dependencies: { ui: "npm:ui-kit@2" } }));
    const files = [
      await write("packages/ui/src/index.js", "export const ui = 1;\n"),
      await write("packages/app/src/index.js", "import { ui } from 'ui';\nexport const app = ui;\n"),
    ];
    const graph = await analyzeDependencyGraph(files, tempDir);
    expect(graph.externalDeps).toContain("ui");
    expect(graph.edges).toEqual([]);
  });

  it("never follows exports or subpaths outside the member package", async () => {
    await write("pnpm-workspace.yaml", "packages:\n  - 'packages/*'\n");
    await write("packages/a/package.json", JSON.stringify({ name: "@acme/a", exports: { "./evil": "../b/src/secret.js", "./abs": "/etc/passwd" } }));
    const files = [
      await write("packages/a/src/index.js", "export const a = 1;\n"),
      await write("packages/b/src/secret.js", "export const s = 1;\n"),
      await write("packages/c/src/index.js", "import { s } from '@acme/a/evil';\nimport { t } from '@acme/a/../b/src/secret';\nimport x from '@acme/a/abs';\nexport const c = [s, t, x];\n"),
    ];
    const graph = await analyzeDependencyGraph(files, tempDir);
    expect(graph.edges).toEqual([]);
    expect(graph.externalDeps).toEqual([]);
  });
});

describe("coverage does not hide real supported code", () => {
  it("ignores vendored C under deps/ and third_party/", async () => {
    const files = [];
    for (let i = 0; i < 50; i++) files.push(await write(`lib/m${i}.js`, i ? `import { m0 } from './m0.js';\nexport const m${i} = m0;\n` : "export const m0 = 1;\n"));
    for (let i = 0; i < 300; i++) files.push(`deps/libuv/src/u${i}.c`);
    for (let i = 0; i < 300; i++) files.push(`third_party/zlib/z${i}.c`);
    const coverage = computeLanguageCoverage(files);
    expect(coverage.status).toBe("full");
    expect(coverage.vendoredFiles).toBe(600);
    const graph = await analyzeDependencyGraph(files, tempDir);
    expect(graph.stats.totalFiles).toBe(50);
    expect(renderDependencyGraph(graph)).not.toContain("Partial coverage");
  });

  it("analyzes 5 Python files next to 80 Rust files and says so everywhere", async () => {
    const files = [];
    for (let i = 0; i < 5; i++) files.push(await write(`python/pkg/m${i}.py`, i ? "from . import m0\n" : "X = 1\n"));
    await write("python/pkg/__init__.py", "");
    for (let i = 0; i < 80; i++) files.push(await write(`src/r${i}.rs`, "pub fn f() {}\n"));
    const coverage = computeLanguageCoverage(files);
    expect(coverage.status).toBe("partial");
    expect(coverage.analyzedBase).toBe(5);
    expect(coverage.totalBase).toBe(85);
    const graph = await analyzeDependencyGraph(files, tempDir);
    expect(graph.nodes.length).toBe(5);
    expect(graph.summary).toContain("no circular dependencies among analyzed files");
    const md = renderDependencyGraph(graph);
    expect(md).toContain("**Partial coverage:** import analysis covers 5 of 85 product source files (6%)");
    expect(md).toContain("Rust (80 product files) is not analyzed");
    const health = computeCodeHealth(await analyzeComplexity(files, tempDir), graph, null, null);
    expect(health.stats.totalFiles).toBe(5);
    expect(health.summary).toContain("Rust not scored");
  });

  it("states partial coverage in the executive summary and architecture overview", async () => {
    for (let i = 0; i < 12; i++) await write(`python/pkg/m${i}.py`, i ? "from . import m0\nfrom . import m1\n" : "X = 1\n");
    await write("python/pkg/__init__.py", "");
    for (let i = 0; i < 40; i++) await write(`src/r${i}.rs`, "pub fn f() {}\n");
    const config = {
      __repoRoot: tempDir,
      project: { name: "hybrid" },
      module_roots: ["python", "src"],
      scan: { include: ["**/*.{py,rs}"], ignore: [] },
      documentation: { sections: ["executive_summary", "system_overview", "architecture_overview", "dependency_graph", "code_health"], include_artifacts: false },
      branding: false,
    };
    const scan = await scanRepo(config);
    const { documents } = await generateDocumentSet(scan, config);
    for (const doc of documents) {
      expect(doc.content).toContain("Partial coverage");
      expect(doc.content).not.toMatch(/Clean module boundaries\*\* — No circular dependencies detected[,.]/);
      expect(doc.content).not.toContain("Acyclic dependency graph");
    }
  });

  it("only suppresses analysis when no supported product code exists", () => {
    expect(computeLanguageCoverage(["docs/site/main.js", "src/A.cs"]).status).toBe("unsupported");
    expect(computeLanguageCoverage(["tests/helper.py", "src/lib.rs"]).status).toBe("unsupported");
    expect(computeLanguageCoverage(["third_party/x/a.js", "src/A.java"]).status).toBe("unsupported");
    expect(computeLanguageCoverage(["src/wwwroot/site.js", "src/A.cs", "src/B.cs"]).status).toBe("partial");
  });

  it("puts the badge boundary at 10% of product source files", () => {
    const at = ["a.py", ...Array.from({ length: 9 }, (_, i) => `r${i}.rs`)];
    const below = ["a.py", ...Array.from({ length: 10 }, (_, i) => `r${i}.rs`)];
    expect(computeLanguageCoverage(at).share).toBeCloseTo(0.1);
    expect(badgeCoverageOk(computeLanguageCoverage(at))).toBe(true);
    expect(badgeCoverageOk(computeLanguageCoverage(below))).toBe(false);
    expect(badgeCoverageOk(computeLanguageCoverage(["a.js"]))).toBe(true);
  });
});

describe("comment stripping keeps strings, templates, and regexes", () => {
  it("does not treat '/*' or '//' inside strings as comments", () => {
    const src = "const glob = 'src/*.graphql';\nconst url = \"https://example.com\";\nconst typeDefs = gql`type Query { users: [User] }`; // real comment\nconst end = '*/';\n";
    const out = stripJsComments(src);
    expect(out).toContain("'src/*.graphql'");
    expect(out).toContain('"https://example.com"');
    expect(out).toContain("gql`type Query { users: [User] }`");
    expect(out).not.toContain("real comment");
    expect(out.split("\n").length).toBe(src.split("\n").length);
  });

  it("handles template expressions, nested templates, and regex literals", () => {
    const src = "const a = `x ${ b /* c */ + `y ${'//z'}` } w // not a comment`;\nconst r = /\\/\\*not-comment/g; /* gone */\nreturn /[/*]/.test(s);\n";
    const out = stripJsComments(src);
    expect(out).toContain("`x ${ b ");
    expect(out).not.toContain("/* c */");
    expect(out).toContain("'//z'");
    expect(out).toContain("w // not a comment`");
    expect(out).toContain("/\\/\\*not-comment/g");
    expect(out).not.toContain("gone");
    expect(out).toContain("/[/*]/.test(s)");
  });

  it("finds SDL in a file that also contains a glob string", async () => {
    await write("src/schema.ts", "import gql from 'graphql-tag';\nconst files = 'src/*.graphql';\nexport const typeDefs = gql`\n  type Query { users: [User] }\n  type User { id: ID! }\n`;\n/** Loader for the files above. */\nexport function load() {}\nconst sep = ' // '; export const extra = gql`type Mutation { ping: Int }`;\n// const old = gql`type Query { legacy: Int }`;\n");
    const result = await analyzeGraphQL(["src/schema.ts"], tempDir);
    expect(result.queries.map((q) => q.name)).toEqual(["users"]);
    expect(result.types.map((t) => t.name)).toEqual(["User"]);
    expect(result.mutations.map((m) => m.name)).toEqual(["ping"]);
  });

  it("detects Hasura from its project file or package imports, not the word", async () => {
    await write("src/a.ts", "// we used to run hasura here\nexport const a = 1;\n");
    expect((await analyzeGraphQL(["src/a.ts"], tempDir)).libraries).toEqual([]);
    await write("hasura/config.yaml", "version: 3\nendpoint: http://localhost:8080\nmetadata_directory: metadata\n");
    expect((await analyzeGraphQL(["src/a.ts"], tempDir)).libraries).toEqual(["Hasura"]);
  });
});

describe("badge coverage comes from one consistent walk", () => {
  it("counts scored files past the analysis cap when judging coverage", async () => {
    for (let i = 0; i < 20; i++) await write(`src/js/m${i}.js`, "export const m = 1;\n");
    for (let i = 0; i < 150; i++) await write(`src/cs/C${i}.cs`, "class C {}\n");
    const scored = await scoreRepository(tempDir, { maxFiles: 5 });
    expect(scored.files.length).toBe(5);
    expect(scored.capped).toBe(true);
    const coverage = scored.health.coverage;
    expect(coverage.analyzedBase).toBe(20);
    expect(coverage.totalBase).toBe(170);
    expect(badgeCoverageOk(coverage)).toBe(true);
  });

  it("refuses a badge when supported code is under 10% of product source", async () => {
    await write("src/site.js", "export const s = 1;\n");
    for (let i = 0; i < 30; i++) await write(`src/C${i}.cs`, "class C {}\n");
    const { value, errors } = await quiet(() => runBadgeCli({ target: tempDir, format: "json" }));
    expect(value).toBe(2);
    expect(errors).toMatch(/only 1 of 31 product source files \(3%\)/);
  });
});
