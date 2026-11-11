// Regressions from the 2026-11-11 real-repository gap test (RepoLens 1.16.2):
// trpc/trpc (pnpm workspaces, GraphQL false positive, test-heavy module),
// App-vNext/Polly (C# scored from one docs script), google/gson (Java blamed on config),
// charmbracelet/glow and pallets/itsdangerous (generic API Surface boilerplate).
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { analyzeDependencyGraph } from "../src/analyzers/dependency-graph.js";
import { analyzeComplexity, computeCodeHealth } from "../src/analyzers/complexity-analyzer.js";
import { analyzeGraphQL, graphqlLibrariesImported } from "../src/analyzers/graphql-analyzer.js";
import { computeLanguageCoverage } from "../src/analyzers/language-coverage.js";
import { renderDependencyGraph, renderCodeHealth } from "../src/renderers/renderAnalysis.js";
import { describeModuleWithTests } from "../src/renderers/render.js";
import { emptyDocumentReason } from "../src/docs/generate-doc-set.js";
import { runBadgeCli } from "../src/badge.js";
import { scanRepo } from "../src/core/scan.js";
import { printHelp } from "../src/help.js";

let tempDir;

async function write(rel, content) {
  const full = path.join(tempDir, rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content);
  return rel;
}

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-gap-1111-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

async function writeWorkspace() {
  await write("package.json", JSON.stringify({ name: "mono-root", private: true }));
  await write("pnpm-workspace.yaml", "packages:\n  - 'packages/*'\n");
  await write("packages/server/package.json", JSON.stringify({
    name: "@acme/server",
    main: "./dist/index.cjs",
    exports: {
      ".": { import: { types: "./dist/index.d.mts", default: "./dist/index.mjs" }, require: "./dist/index.cjs" },
      "./adapters/express": { import: "./dist/adapters/express.mjs" },
    },
  }));
  const files = [
    await write("packages/server/src/index.ts", "export function initServer() { return 1; }\n"),
    await write("packages/server/src/adapters/express.ts", "import { initServer } from '../index';\nexport const adapter = () => initServer();\n"),
    await write("packages/server/src/observable/index.ts", "export const observable = () => 1;\n"),
  ];
  await write("packages/client/package.json", JSON.stringify({ name: "@acme/client", main: "dist/index.js" }));
  for (const name of ["links", "proxy", "fetch", "ws", "batch", "retry"]) {
    files.push(await write(
      `packages/client/src/${name}.ts`,
      "import { initServer } from '@acme/server';\nimport { observable } from '@acme/server/observable';\nimport express from 'express';\nexport const x = () => initServer() + observable() + express;\n",
    ));
  }
  files.push(await write("packages/client/src/adapter.ts", "import { adapter } from '@acme/server/adapters/express';\nexport const y = adapter;\n"));
  files.push(await write("packages/client/src/missing.ts", "import { z } from '@acme/server/not-a-real-entry';\nexport const w = z;\n"));
  files.push(await write("packages/server/src/self.ts", "import { initServer } from '@acme/server';\nexport const s = initServer;\n"));
  return files;
}

describe("1. pnpm workspace packages are internal (trpc/trpc)", () => {
  it("resolves @scope/pkg and subpaths to source files, not external packages", async () => {
    const files = await writeWorkspace();
    const graph = await analyzeDependencyGraph(files, tempDir);
    const edges = graph.edges.map((e) => `${e.from} -> ${e.to}`);
    expect(edges).toContain("packages/client/src/links -> packages/server/src");
    expect(edges).toContain("packages/client/src/links -> packages/server/src/observable");
    // exports "./adapters/express" -> dist/adapters/express.mjs maps back to src/
    expect(edges).toContain("packages/client/src/adapter -> packages/server/src/adapters/express");
    expect(graph.externalDeps).toContain("express");
    expect(graph.externalDeps).not.toContain("@acme/server");
    expect(graph.externalRuntime).not.toContain("@acme/server");
  });

  it("never lists an unresolvable workspace subpath as external, and still skips self-imports", async () => {
    const files = await writeWorkspace();
    const graph = await analyzeDependencyGraph(files, tempDir);
    expect(graph.externalDeps.some((d) => d.startsWith("@acme/"))).toBe(false);
    const missing = graph.nodes.find((n) => n.key === "packages/client/src/missing");
    expect(missing.imports).toEqual([]);
    const self = graph.nodes.find((n) => n.key === "packages/server/src/self");
    expect(self.imports).toEqual([]);
  });

  it("makes a heavily imported workspace entry a hub", async () => {
    const files = await writeWorkspace();
    const graph = await analyzeDependencyGraph(files, tempDir);
    const hubKeys = graph.stats.hubs.map((h) => h.key);
    expect(hubKeys).toContain("packages/server/src");
    expect(renderDependencyGraph(graph)).toContain("## Hub Modules");
  });
});

async function writeCSharpRepo() {
  const files = [];
  for (let i = 0; i < 40; i++) files.push(await write(`src/Polly.Core/File${i}.cs`, `namespace Polly; public class C${i} {}\n`));
  files.push(await write("docs/template/public/main.js", "export default { start() {} };\n"));
  await write("Polly.sln", "");
  return files;
}

describe("2. a C# repository is not scored from one docs script (App-vNext/Polly)", () => {
  it("marks coverage unsupported and builds no graph", async () => {
    const files = await writeCSharpRepo();
    const coverage = computeLanguageCoverage(files);
    expect(coverage.status).toBe("unsupported");
    expect(coverage.unanalyzedLanguages[0]).toEqual({ label: "C#", files: 40 });
    const graph = await analyzeDependencyGraph(files, tempDir);
    expect(graph.nodes).toEqual([]);
    expect(graph.stats).toBeNull();
    const md = renderDependencyGraph(graph);
    expect(md).toContain("C# (40 product files) is not supported for import analysis yet");
    expect(md).not.toContain("no circular dependencies");
    expect(md).not.toContain("Ensure your `scan.include`");
  });

  it("does not report health 100/100 and the badge refuses to score", async () => {
    const files = await writeCSharpRepo();
    const complexity = await analyzeComplexity(files, tempDir);
    expect(complexity.files).toEqual([]);
    const graph = await analyzeDependencyGraph(files, tempDir);
    const health = computeCodeHealth(complexity, graph, null, null);
    expect(health.stats.totalFiles).toBe(0);
    expect(health.summary).toMatch(/^Not scored: C# \(40 product files\)/);
    const md = renderCodeHealth(health);
    expect(md).not.toContain("100/100");
    expect(md).toContain("not supported for code health yet");

    const errors = [];
    const original = console.error;
    console.error = (...args) => errors.push(args.join(" "));
    try {
      expect(await runBadgeCli({ target: tempDir, format: "json" })).toBe(2);
    } finally {
      console.error = original;
    }
    expect(errors.join("\n")).toMatch(/C# \(40 product files\) is not supported for code health yet/);
  });

  it("lists the primary language first", async () => {
    await writeCSharpRepo();
    const scan = await scanRepo({
      __repoRoot: tempDir,
      module_roots: ["src", "docs"],
      scan: { include: ["**/*.{cs,js}"], ignore: [] },
      project: { name: "polly" },
    });
    expect([...scan.metadata.languages][0]).toBe("C#");
  });
});

describe("3. Java is explained as a language limit, not a config problem (google/gson)", () => {
  it("names Java and does not blame scan.include", async () => {
    const files = [];
    for (let i = 0; i < 12; i++) files.push(await write(`gson/src/main/java/com/google/gson/T${i}.java`, `package com.google.gson; class T${i} {}\n`));
    const graph = await analyzeDependencyGraph(files, tempDir);
    const md = renderDependencyGraph(graph);
    expect(md).toContain("Java/Kotlin (12 product files) is not supported for import analysis yet");
    expect(md).toContain("not a problem with your `scan.include` patterns");
    const health = computeCodeHealth(await analyzeComplexity(files, tempDir), graph, null, null);
    expect(renderCodeHealth(health)).toContain("Java/Kotlin (12 product files) is not supported for code health yet");
  });

  it("demo help says the graph and health cover JavaScript/TypeScript, Python, and Go only", () => {
    const out = [];
    const original = console.log;
    console.log = (...args) => out.push(args.join(" "));
    try { printHelp("demo"); } finally { console.log = original; }
    const help = out.join("\n");
    expect(help).toMatch(/dependency graph and code health cover JavaScript\/TypeScript,\s+Python, and Go only/);
    expect(help).toMatch(/not supported yet/);
  });

  it("keeps the config message when nothing was scanned at all", () => {
    const md = renderDependencyGraph({ nodes: [], coverage: computeLanguageCoverage([]) });
    expect(md).toContain("No source files were found");
  });
});

describe("coverage edge cases", () => {
  it("reports partial coverage for a mixed repository", async () => {
    const files = [];
    for (let i = 0; i < 20; i++) files.push(await write(`web/src/f${i}.ts`, `export const f${i} = () => ${i};\n`));
    for (let i = 0; i < 30; i++) files.push(await write(`api/src/main/java/A${i}.java`, `class A${i} {}\n`));
    const coverage = computeLanguageCoverage(files);
    expect(coverage.status).toBe("partial");
    const graph = await analyzeDependencyGraph(files, tempDir);
    expect(graph.nodes.length).toBe(20);
    expect(renderDependencyGraph(graph)).toContain("**Partial coverage:**");
    const health = computeCodeHealth(await analyzeComplexity(files, tempDir), graph, null, null);
    expect(health.summary).toContain("Java/Kotlin not scored");
  });

  it("does not treat Vue components as a reason to drop TypeScript analysis", () => {
    const files = ["src/store.ts", "src/router.ts"];
    for (let i = 0; i < 50; i++) files.push(`src/components/C${i}.vue`);
    expect(computeLanguageCoverage(files).status).toBe("partial");
  });

  it("keeps a pure JavaScript repository at full coverage", () => {
    expect(computeLanguageCoverage(["src/a.js", "src/b.ts", "index.d.ts"]).status).toBe("full");
  });
});

describe("4. GraphQL needs real GraphQL evidence (trpc/trpc)", () => {
  it("ignores Apollo/urql in comments and React Query hook maps", async () => {
    await write("packages/next/src/ssrPrepass.ts", "// Works like Apollo's getDataFromTree and urql's ssrExchange\nimport { useQuery } from '@tanstack/react-query';\nexport const a = useQuery;\n");
    await write("packages/upgrade/src/transforms/hooksToOptions.ts", "const hookToOptions = {\n  useQuery: { lib: '@tanstack/react-query', fn: 'queryOptions' },\n  useMutation: { lib: '@tanstack/react-query', fn: 'mutationOptions' },\n};\nexport default hookToOptions;\n");
    const result = await analyzeGraphQL(["packages/next/src/ssrPrepass.ts", "packages/upgrade/src/transforms/hooksToOptions.ts"], tempDir);
    expect(result.detected).toBe(false);
    expect(result.libraries).toEqual([]);
    expect(result.resolverFiles).toEqual([]);
    expect(emptyDocumentReason({ key: "graphql_schema" }, { config: {}, scanResult: {}, graphqlResult: result })).toMatch(/GraphQL/);
  });

  it("detects a library that is actually imported", async () => {
    await write("src/client.ts", "import { ApolloClient, InMemoryCache } from '@apollo/client';\nexport const c = new ApolloClient({ cache: new InMemoryCache() });\n");
    const result = await analyzeGraphQL(["src/client.ts"], tempDir);
    expect(result.detected).toBe(true);
    expect(result.libraries).toEqual(["Apollo Client"]);
    expect(graphqlLibrariesImported("// import { x } from 'urql'\nconst s = 'urql';")).toEqual([]);
  });

  it("ignores SDL that only appears in a comment", async () => {
    await write("src/a.ts", "/* type Query { users: [User] } */\nexport const a = 1;\n");
    const result = await analyzeGraphQL(["src/a.ts"], tempDir);
    expect(result.detected).toBe(false);
  });
});

describe("5. a test-heavy module is not an Application module (trpc packages/openapi)", () => {
  it("says how much of the module is tests", () => {
    expect(describeModuleWithTests({ key: "packages/openapi", fileCount: 212, testFileCount: 204 }, "Application module"))
      .toBe("Mostly tests and fixtures (204 of 212 files)");
    expect(describeModuleWithTests({ key: "packages/server", fileCount: 105, testFileCount: 60 }, "Application module · Shared infrastructure (imported by 7 modules)"))
      .toBe("Mostly tests and fixtures (60 of 105 files) · Shared infrastructure (imported by 7 modules)");
    expect(describeModuleWithTests({ key: "src", fileCount: 10, testFileCount: 2 }, "Application module")).toBe("Application module");
  });

  it("counts test files per module during the scan", async () => {
    await write("packages/openapi/src/index.ts", "export const a = 1;\n");
    for (let i = 0; i < 5; i++) await write(`packages/openapi/test/routers/r${i}.ts`, "export const r = 1;\n");
    const scan = await scanRepo({
      __repoRoot: tempDir,
      module_roots: ["packages"],
      scan: { include: ["**/*.ts"], ignore: [] },
      project: { name: "x" },
    });
    const mod = scan.modules.find((m) => m.key === "packages/openapi");
    expect(mod.fileCount).toBe(6);
    expect(mod.testFileCount).toBe(5);
  });
});

describe("6. API Surface is skipped when there is nothing to show (glow, itsdangerous)", () => {
  const plan = { key: "api_surface" };
  it("skips a repository with no routes, external APIs, or documented exports", () => {
    expect(emptyDocumentReason(plan, { config: {}, scanResult: { api: [], externalApis: [] }, graphqlResult: {}, jsdocResult: { detected: false, exports: [] } }))
      .toMatch(/no API routes/);
  });
  it("keeps it when anything was found or the config lists it", () => {
    expect(emptyDocumentReason(plan, { config: {}, scanResult: { api: [{}] }, graphqlResult: {} })).toBeNull();
    expect(emptyDocumentReason(plan, { config: {}, scanResult: { externalApis: [{}] }, graphqlResult: {} })).toBeNull();
    expect(emptyDocumentReason(plan, { config: {}, scanResult: {}, graphqlResult: {}, jsdocResult: { detected: true, exports: [{}] } })).toBeNull();
    expect(emptyDocumentReason(plan, { config: { documentation: { sections: ["api_surface"] } }, scanResult: {}, graphqlResult: {} })).toBeNull();
  });
});

describe("flow steps name a workspace entry by its package", () => {
  it("shows server/src rather than a bare src", async () => {
    const { inferDataFlows } = await import("../src/analyzers/flow-inference.js");
    const files = await writeWorkspace();
    const graph = await analyzeDependencyGraph(files, tempDir);
    const scan = { modules: [{ key: "packages/client", fileCount: 8 }, { key: "packages/server", fileCount: 4 }], api: [], pages: [], filesCount: files.length, metadata: { frameworks: [], languages: new Set(["TypeScript"]), buildTools: [], testFrameworks: [] } };
    const flows = inferDataFlows(scan, { project: { name: "acme" } }, graph);
    const steps = flows.flatMap((f) => f.steps || []).join("\n");
    expect(steps).toMatch(/server\/src/);
    expect(steps).not.toMatch(/`src` \(/);
  });
});
