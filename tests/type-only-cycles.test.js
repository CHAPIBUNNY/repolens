// Regressions from the 2026-11-12 gap test on lukeautry/tsoa (ce4daec): RepoLens 1.16.3
// reported 10 import cycles, 9 of which exist only because TypeScript files import
// interfaces or classes used only as types without `import type`. The compiler drops
// those imports, so they are not runtime edges. The real runtime cycle
// (typeResolver/members <-> models) must still be reported.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { analyzeDependencyGraph } from "../src/analyzers/dependency-graph.js";
import { usageByName, declaredKinds, tokenize } from "../src/analyzers/ts-elision.js";
import { extractJsImports } from "../src/analyzers/import-parsers.js";
import { cycleHealthPenalty, cycleInsight } from "../src/analyzers/cycle-priority.js";
import { renderDependencyGraph } from "../src/renderers/renderAnalysis.js";
import { generateArchitectureOverview } from "../src/ai/generate-sections.js";
import { scoreRepository } from "../src/badge.js";
import { callTool } from "../src/mcp/tools.js";

let tempDir;

async function write(rel, content) {
  const full = path.join(tempDir, rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content);
  return rel;
}

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-typecycles-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

const edgeIds = (result) => result.edges.map((edge) => `${edge.from}->${edge.to}`).sort();

function valueUses(source, name, options) {
  return usageByName(source, options).uses.get(name)?.value || 0;
}

// The tsoa shapes, reduced: a generator that constructs helpers which take the
// generator as a constructor-parameter type, a CLI module whose config interfaces
// are imported back, and a real mutual-recursion pair.
async function writeTsoaShape() {
  const files = [
    await write("src/metadataGeneration/metadataGenerator.ts", [
      "import { ControllerGenerator } from './controllerGenerator';",
      "import { resolveNamedModel } from './typeResolver/models';",
      "export class MetadataGenerator {",
      "  public run() { return new ControllerGenerator(this).generate() + String(resolveNamedModel); }",
      "}",
      "",
    ].join("\n")),
    await write("src/metadataGeneration/controllerGenerator.ts", [
      "import { MetadataGenerator } from './metadataGenerator';",
      "import { MethodGenerator } from './methodGenerator';",
      "export class ControllerGenerator {",
      "  constructor(private readonly current: MetadataGenerator, private readonly tags: string[] = []) {}",
      "  public generate(): number { return new MethodGenerator(this.current).generate(); }",
      "}",
      "",
    ].join("\n")),
    await write("src/metadataGeneration/methodGenerator.ts", [
      "import { MetadataGenerator } from './metadataGenerator';",
      "export class MethodGenerator {",
      "  constructor(private readonly current: MetadataGenerator) {}",
      "  public generate(): number { return this.current ? 1 : 0; }",
      "}",
      "",
    ].join("\n")),
    await write("src/metadataGeneration/typeResolver/members.ts", [
      "import { resolveNamedModel } from './models';",
      "export function modelProperties(node: unknown): unknown[] { return [resolveNamedModel(node)]; }",
      "export function ownIndexSignature(node: unknown) { return resolveNamedModel(node); }",
      "",
    ].join("\n")),
    await write("src/metadataGeneration/typeResolver/models.ts", [
      "import { modelProperties, ownIndexSignature, type Owner } from './members';",
      "export function resolveNamedModel(node: unknown): unknown { return modelProperties(node).length + Number(ownIndexSignature(node)); }",
      "",
    ].join("\n")),
    await write("src/cli.ts", [
      "import { generateRoutes } from './module/generate-routes';",
      "export interface ExtendedRoutesConfig { entryFile: string }",
      "export type RouteGeneratorModule<Config> = { new (config: Config): unknown };",
      "export async function main() { return generateRoutes({ entryFile: 'x' }); }",
      "",
    ].join("\n")),
    await write("src/module/generate-routes.ts", [
      "import { ExtendedRoutesConfig, RouteGeneratorModule } from '../cli';",
      "import { MetadataGenerator } from '../metadataGeneration/metadataGenerator';",
      "export async function generateRoutes<Config extends ExtendedRoutesConfig>(config: Config, gen?: RouteGeneratorModule<Config>) {",
      "  return new MetadataGenerator().run() + (gen ? 1 : 0) + config.entryFile.length;",
      "}",
      "",
    ].join("\n")),
  ];
  return files;
}

describe("TypeScript import elision in the dependency graph (tsoa gap)", () => {
  it("does not report cycles that close only through type-position imports", async () => {
    const files = await writeTsoaShape();
    const result = await analyzeDependencyGraph(files, tempDir);

    // The one real runtime cycle stays, exactly as before.
    expect(result.cycles.length).toBe(1);
    expect([...new Set(result.cycles[0])].sort()).toEqual([
      "src/metadataGeneration/typeResolver/members",
      "src/metadataGeneration/typeResolver/models",
    ]);
    expect(result.stats.cycles).toBe(1);
    expect(result.stats.highCycles).toBe(0);

    // Runtime edges that really load a module are all still there.
    expect(edgeIds(result)).toEqual([
      "src/cli->src/module/generate-routes",
      "src/metadataGeneration/controllerGenerator->src/metadataGeneration/methodGenerator",
      "src/metadataGeneration/metadataGenerator->src/metadataGeneration/controllerGenerator",
      "src/metadataGeneration/metadataGenerator->src/metadataGeneration/typeResolver/models",
      "src/metadataGeneration/typeResolver/members->src/metadataGeneration/typeResolver/models",
      "src/metadataGeneration/typeResolver/models->src/metadataGeneration/typeResolver/members",
      "src/module/generate-routes->src/metadataGeneration/metadataGenerator",
    ]);

    // The removed imports are listed as inferred type-only edges.
    const inferred = result.typeOnlyEdges.filter((edge) => edge.reason === "inferred").map((edge) => `${edge.from}->${edge.to}`).sort();
    expect(inferred).toEqual([
      "src/metadataGeneration/controllerGenerator->src/metadataGeneration/metadataGenerator",
      "src/metadataGeneration/methodGenerator->src/metadataGeneration/metadataGenerator",
      "src/module/generate-routes->src/cli",
    ]);
    expect(result.stats.typeOnlyEdges).toBe(3);
    expect(result.stats.inferredTypeOnlyEdges).toBe(3);

    // Cycles through them are reported separately, labelled, and low priority.
    expect(result.typeOnlyReports.length).toBeGreaterThanOrEqual(2);
    expect(result.stats.typeOnlyCycles).toBe(result.typeOnlyReports.length);
    for (const report of result.typeOnlyReports) {
      expect(report.priority).toBe("low");
      expect(report.kind).toBe("type-only");
      expect(report.typeOnlyLinks.length).toBeGreaterThan(0);
      expect(report.typeOnlyLinks.every((link) => link.reason === "inferred")).toBe(true);
    }
    expect(result.summary).toContain("1 circular dependency cycle(s)");
    expect(result.summary).toMatch(/\d+ type-only cycle\(s\), not runtime/);
  });

  it("renders type-only cycles apart from runtime cycles, with the type-only links", async () => {
    const files = await writeTsoaShape();
    const result = await analyzeDependencyGraph(files, tempDir);
    const doc = renderDependencyGraph(result);
    expect(doc).toContain("| Circular dependencies | 1 |");
    expect(doc).toMatch(/\| Type-only cycles \(not runtime, not counted\) \| \d+ \|/);
    expect(doc).toContain("## Type-only cycles");
    expect(doc).toContain("used only in type positions (*inferred*)");
    expect(doc).toContain("`src/metadataGeneration/controllerGenerator` → `src/metadataGeneration/metadataGenerator` (inferred)");
    expect(doc).toContain("`src/module/generate-routes` → `src/cli` (inferred)");
    const runtimeSection = doc.slice(doc.indexOf("## Circular Dependencies"), doc.indexOf("## Type-only cycles"));
    expect(runtimeSection).toContain("typeResolver/members");
    expect(runtimeSection).not.toContain("controllerGenerator");
    expect(runtimeSection).not.toContain("src/cli");
    expect(doc).not.toContain("Priority: High refactor");
  });

  it("charges the health score only for the runtime cycle", async () => {
    const files = await writeTsoaShape();
    const result = await analyzeDependencyGraph(files, tempDir);
    // One medium cycle (members <-> models, one import each way) costs 5 points.
    expect(result.stats.mediumCycles + result.stats.lowCycles + result.stats.highCycles).toBe(1);
    expect(cycleHealthPenalty(result.stats)).toBe(result.stats.mediumCycles * 5);
    const overview = await generateArchitectureOverview({
      project: { name: "fixture", modulesDetected: 2, filesScanned: files.length, pagesDetected: 0, apiRoutesDetected: 0 },
      patterns: [],
      domains: [{ name: "Core", description: "core" }],
      topModules: [],
      techStack: { frameworks: [], languages: ["TypeScript"], buildTools: [], testFrameworks: ["Vitest"] },
    }, { depGraph: result, flows: [] }, {});
    expect(overview).not.toContain("Priority: High refactor");
    expect(overview).toMatch(/Circular Deps \| 1 \|/);
  });

  it("does not call a lone medium cycle mutual recursion in the summary insight", () => {
    const medium = cycleInsight({ cycles: 1, highCycles: 0, mediumCycles: 1, lowCycles: 0 });
    expect(medium).toContain("Small cycle; review. Priority: Medium.");
    expect(medium).not.toContain("mutual recursion");
    const low = cycleInsight({ cycles: 2, highCycles: 0, mediumCycles: 0, lowCycles: 2 });
    expect(low).toContain("mutual recursion, probably intentional; verify. Priority: Low.");
  });

  it("scores the badge on the runtime graph", async () => {
    await writeTsoaShape();
    const scored = await scoreRepository(tempDir);
    expect(scored.depGraph.stats.cycles).toBe(1);
    expect(scored.depGraph.stats.typeOnlyCycles).toBeGreaterThanOrEqual(2);
  });

  it("returns the same graph through the MCP tool", async () => {
    await writeTsoaShape();
    await write(".repolens.yml", [
      "configVersion: 1",
      "project:",
      "  name: Fixture",
      "publishers:",
      "  - markdown",
      "scan:",
      "  include:",
      "    - \"src/**/*.ts\"",
      "  ignore:",
      "    - \"**/node_modules/**\"",
      "module_roots:",
      "  - src",
      "outputs:",
      "  pages:",
      "    - key: system_overview",
      "      title: System Overview",
      "documentation:",
      "  sections:",
      "    - system_overview",
      "  include_artifacts: false",
      "",
    ].join("\n"));
    const previous = process.env.REPOLENS_WORKSPACE;
    process.env.REPOLENS_WORKSPACE = tempDir;
    try {
      const graph = await callTool("get_dependency_graph", {});
      expect(graph.isError, graph.content?.[0]?.text).toBeUndefined();
      const text = graph.content[0].text;
      expect(text).toContain("| Circular dependencies | 1 |");
      expect(text).toContain("## Type-only cycles");
      expect(text).toContain("(inferred)");
    } finally {
      if (previous === undefined) delete process.env.REPOLENS_WORKSPACE;
      else process.env.REPOLENS_WORKSPACE = previous;
    }
  });

  it("labels `import type`, `export type` and inline `{ type X }` cycles as syntax", async () => {
    await write("a.ts", "import type { B } from './b';\nexport const a = 1;\nexport type A = B;\n");
    await write("b.ts", "import { c } from './c';\nexport type B = number;\nexport const b = c;\n");
    await write("c.ts", "export type { A } from './a';\nimport { type D } from './d';\nexport const c = 2;\nexport type C = D;\n");
    await write("d.ts", "import { b } from './b';\nexport type D = typeof b;\nexport const d = b;\n");
    const result = await analyzeDependencyGraph(["a.ts", "b.ts", "c.ts", "d.ts"], tempDir);
    expect(result.cycles).toEqual([]);
    expect(edgeIds(result)).toEqual(["b->c", "d->b"]);
    const syntax = result.typeOnlyEdges.filter((edge) => edge.reason === "syntax").map((edge) => `${edge.from}->${edge.to}`).sort();
    expect(syntax).toEqual(["a->b", "c->a", "c->d"]);
    expect(result.typeOnlyReports.length).toBeGreaterThan(0);
    expect(result.typeOnlyReports.every((report) => report.typeOnlyLinks.every((link) => link.reason === "syntax"))).toBe(true);
    expect(renderDependencyGraph(result)).toContain("(syntax)");
  });

  it("keeps a mixed `{ type X, value }` import when the value is used, and drops it when it is not", async () => {
    await write("b.ts", "export const value = 1;\nexport class Klass {}\nexport type Only = string;\n");
    await write("used.ts", "import { type Only, value } from './b';\nexport const n: Only = String(value);\n");
    await write("unused.ts", "import { type Only, Klass } from './b';\nexport function f(k: Klass): Only { return String(k); }\n");
    const result = await analyzeDependencyGraph(["b.ts", "used.ts", "unused.ts"], tempDir);
    expect(edgeIds(result)).toEqual(["used->b"]);
    expect(result.typeOnlyEdges).toEqual([{ from: "unused", to: "b", reason: "inferred" }]);
  });

  it("treats an import of interfaces and type aliases as type-only", async () => {
    await write("types.ts", "export interface Options { a: string }\nexport type Mode = 'a' | 'b';\n");
    await write("consumer.ts", "import { Options, Mode } from './types';\nconst mode = 'a';\nexport const pick = (o: Options) => o.a + mode;\nexport { Mode };\n");
    const result = await analyzeDependencyGraph(["types.ts", "consumer.ts"], tempDir);
    expect(result.edges).toEqual([]);
    expect(result.typeOnlyEdges).toEqual([{ from: "consumer", to: "types", reason: "inferred" }]);
    // A types module connected only by type imports is not dead code.
    expect(result.stats.orphanFiles).toBe(0);
  });

  it("treats a re-export of interfaces as type-only, and keeps value and star re-exports", async () => {
    await write("types.ts", "export interface Options { a: string }\nexport const VERSION = 1;\n");
    await write("types-index.ts", "export { Options } from './types';\n");
    await write("values-index.ts", "export { VERSION } from './types';\n");
    await write("star-index.ts", "export * from './types';\n");
    const result = await analyzeDependencyGraph(["types.ts", "types-index.ts", "values-index.ts", "star-index.ts"], tempDir);
    expect(edgeIds(result)).toEqual(["star-index->types", "values-index->types"]);
    expect(result.typeOnlyEdges).toEqual([{ from: "types-index", to: "types", reason: "inferred" }]);
  });

  it("keeps a name declared as both interface and value (declaration merging)", async () => {
    await write("merged.ts", "export interface Foo { a: string }\nexport const Foo = { create: () => ({ a: '' }) };\n");
    await write("user.ts", "import { Foo } from './merged';\nexport function f(x: Foo) { return x; }\n");
    await write("user2.ts", "import { Foo } from './merged';\nexport const made = Foo.create();\n");
    const result = await analyzeDependencyGraph(["merged.ts", "user.ts", "user2.ts"], tempDir);
    // user.ts uses Foo only as a type, so the compiler drops it; user2.ts calls it.
    expect(edgeIds(result)).toEqual(["user2->merged"]);
    expect(result.typeOnlyEdges.map((edge) => edge.from)).toEqual(["user"]);
  });

  it("keeps every import under verbatimModuleSyntax, preserveValueImports, or importsNotUsedAsValues", async () => {
    for (const options of [
      { verbatimModuleSyntax: true },
      { preserveValueImports: true, isolatedModules: true },
      { importsNotUsedAsValues: "preserve" },
    ]) {
      await fs.rm(tempDir, { recursive: true, force: true });
      await fs.mkdir(tempDir, { recursive: true });
      // Options come through `extends`, with comments and trailing commas (JSONC).
      await write("tsconfig.base.json", `{\n  // shared\n  "compilerOptions": ${JSON.stringify(options)},\n}\n`);
      await write("pkg/tsconfig.json", `{ "extends": "../tsconfig.base.json", "compilerOptions": { "strict": true, } }\n`);
      const files = [
        await write("pkg/a.ts", "import { B } from './b';\nexport class A { run(b: B) { return b; } }\n"),
        await write("pkg/b.ts", "import { A } from './a';\nexport class B { constructor() { new A(); } }\n"),
      ];
      const result = await analyzeDependencyGraph(files, tempDir);
      expect(result.cycles.length, JSON.stringify(options)).toBe(1);
      expect(result.typeOnlyEdges).toEqual([]);
    }
  });

  it("keeps imports in decorated files under emitDecoratorMetadata", async () => {
    await write("tsconfig.json", JSON.stringify({ compilerOptions: { experimentalDecorators: true, emitDecoratorMetadata: true } }));
    await write("service.ts", "import { Repo } from './repo';\nimport { Options } from './options';\nfunction Injectable(): ClassDecorator { return () => {}; }\n@Injectable()\nexport class Service { constructor(private repo: Repo, private options: Options) {} }\n");
    await write("repo.ts", "export class Repo {}\n");
    await write("options.ts", "export interface Options { a: string }\n");
    await write("plain.ts", "import { Repo } from './repo';\nexport function use(r: Repo) { return r; }\n");
    const result = await analyzeDependencyGraph(["service.ts", "repo.ts", "options.ts", "plain.ts"], tempDir);
    expect(edgeIds(result)).toEqual(["service->options", "service->repo"]);
    expect(result.typeOnlyEdges).toEqual([{ from: "plain", to: "repo", reason: "inferred" }]);
  });

  it("does not infer from usage in .tsx files or in JavaScript, but still reads interface declarations", async () => {
    await write("model.ts", "export class Model {}\nexport interface Props { a: string }\n");
    await write("view.tsx", "import { Model, Props } from './model';\nexport function View(p: Props) { const m: Model | null = null; return <div>list as they're posted {String(m)}</div>; }\n");
    await write("types-only.tsx", "import { Props } from './model';\nexport function T(p: Props) { return <span>{p.a}</span>; }\n");
    await write("plain.js", "import { Model } from './model';\n/** @param {Model} m */\nexport function f(m) { return m; }\n");
    const result = await analyzeDependencyGraph(["model.ts", "view.tsx", "types-only.tsx", "plain.js"], tempDir);
    expect(edgeIds(result)).toEqual(["plain->model", "view->model"]);
    expect(result.typeOnlyEdges).toEqual([{ from: "types-only", to: "model", reason: "inferred" }]);
  });

  it("treats imports in a declaration file as type-only", async () => {
    await write("globals.d.ts", "import { Config } from './config';\ndeclare global { var config: Config }\n");
    await write("config.ts", "export class Config { static make() { return new Config(); } }\n");
    const result = await analyzeDependencyGraph(["globals.d.ts", "config.ts"], tempDir);
    expect(result.edges).toEqual([]);
    expect(result.typeOnlyEdges).toEqual([{ from: "globals.d", to: "config", reason: "inferred" }]);
  });

  it("keeps side-effect, dynamic, and require imports as runtime edges", async () => {
    await write("a.ts", "import './b';\nexport const lazy = () => import('./c');\nconst d = require('./d');\nexport { d };\n");
    await write("b.ts", "import { A } from './a';\nexport type X = A;\n");
    await write("c.ts", "export const c = 1;\n");
    await write("d.ts", "export const d = 1;\n");
    const result = await analyzeDependencyGraph(["a.ts", "b.ts", "c.ts", "d.ts"], tempDir);
    expect(edgeIds(result)).toEqual(["a->b", "a->c", "a->d"]);
  });

  it("leaves JavaScript cycles and external packages unchanged", async () => {
    await write("left.js", "import { b } from './right.js';\nimport express from 'express';\nexport function a() { return b() + express; }\n");
    await write("right.js", "import { a } from './left.js';\nexport function b() { return a(); }\n");
    await write("types.ts", "import { Request } from 'express';\nexport function handler(req: Request) { return req; }\n");
    const result = await analyzeDependencyGraph(["left.js", "right.js", "types.ts"], tempDir);
    expect(result.cycles.length).toBe(1);
    expect(result.typeOnlyEdges).toEqual([]);
    expect(result.externalDeps).toEqual(["express"]);
  });
});

describe("usageByName: value and type positions", () => {
  const valueCases = [
    ["new X()", "X"],
    ["X.create()", "X"],
    ["X()", "X"],
    ["class Y extends X {}", "X"],
    ["class Y extends X<Z> implements I {}", "X"],
    ["const ok = a instanceof X;", "X"],
    ["@Inject(X) class Y {}", "X"],
    ["const t = typeof X;", "X"],
    ["const o = { X };", "X"],
    ["const o = { ...X };", "X"],
    ["const o = { key: X };", "X"],
    ["function f(a = X) {}", "X"],
    ["function f(a: number = X) {}", "X"],
    ["export { X };", "X"],
    ["export default X;", "X"],
    ["const s = `${X}`;", "X"],
    ["const v = cond ? X : Y;", "X"],
    ["const v = cond ? Y : X;", "X"],
    ["const v = f(cond ? (Y) : X);", "X"],
    ["switch (k) { case X: break; }", "X"],
    ["switch (k) { case (X): return 1; }", "X"],
    ["const arr = [X];", "X"],
    ["foo(X);", "X"],
    ["const f = (a: number): number => X(a);", "X"],
    ["const f = (a): ((q: string) => string) => X;", "X"],
    ["class C { prop = X; }", "X"],
    ["class C { prop: number = X.n; }", "X"],
    ["if (a < b && c > X) {}", "X"],
    ["for (let i = 0; i < n; i++) { X[i] = 1; }", "X"],
    ["const y = x as unknown as T;\nX();", "X"],
    ["let a: string\nX()", "X"],
    ["const of = 1; readonly(X);", "X"],
    ["import Y = X.Y;", "X"],
    ["label: X();", "X"],
    ["const v = <T,>(x: T) => X(x);", "X"],
  ];
  for (const [source, name] of valueCases) {
    it(`value: ${source.replace(/\n/g, " ")}`, () => {
      expect(valueUses(source, name)).toBeGreaterThan(0);
    });
  }

  const typeCases = [
    ["function f(a: X) {}", "X"],
    ["function f(a?: X) {}", "X"],
    ["function f(): X { return null as any; }", "X"],
    ["const f = (a: X): X => a;", "X"],
    ["const f = async (a: Promise<X>) => a;", "X"],
    ["let a: X;", "X"],
    ["let a: string, b: X;", "X"],
    ["const a: X = make();", "X"],
    ["const a: { b: X } = make();", "X"],
    ["const a: Array<X> = [];", "X"],
    ["const m = new Map<string, X>();", "X"],
    ["const s = useState<X>(null);", "X"],
    ["const v = value as X;", "X"],
    ["const v = <X>value;", "X"],
    ["const v = value satisfies X;", "X"],
    ["class C implements X {}", "X"],
    ["class C implements A, X<B> {}", "X"],
    ["class C extends Base<X> {}", "X"],
    ["class C { prop: X; other?: X; definite!: X; }", "X"],
    ["class C { constructor(private readonly x: X) {} }", "X"],
    ["class C { [key: string]: X; }", "X"],
    ["class C { method<T extends X>(a: T): T { return a; } }", "X"],
    ["type T = X;", "X"],
    ["type T<U = X> = U | X[];", "X"],
    ["type T = U extends X ? A : B;", "X"],
    ["type T = { [K in keyof X]: X[K] };", "X"],
    ["type T = (a: X) => void;", "X"],
    ["type T = typeof X;", "X"],
    ["interface I extends X { a: X }", "X"],
    ["function isX(a: unknown): a is X { return true; }", "X"],
    ["function assertX(a: unknown): asserts a is X {}", "X"],
    ["function f<T extends X>(a: T) {}", "X"],
    ["function f<T extends X = X>(a: T) {}", "X"],
    ["declare const x: X;", "X"],
    ["declare module 'm' { const y: X; }", "X"],
    ["export type { X };", "X"],
    ["const f = (a: X.Inner) => a;", "X"],
    ["try {} catch (e: X) {}", "X"],
    ["for (const a of list as X[]) {}", "X"],
    ["const f = function (this: X) {};", "X"],
    ["let a: X\nlet b = 1", "X"],
    ["const a = { f(b: X): X { return b; } };", "X"],
    ["const f = (a: number): X => make(a);", "X"],
    ["type Tpl = `a-${X}`;", "X"],
  ];
  for (const [source, name] of typeCases) {
    it(`type only: ${source.replace(/\n/g, " ")}`, () => {
      const use = usageByName(source).uses.get(name);
      expect(use?.value || 0).toBe(0);
      expect(use?.type || 0).toBeGreaterThan(0);
    });
  }

  it("ignores identifiers in strings, comments, and property names", () => {
    const source = "const s = 'X';\n// X()\n/* new X() */\nobj.X();\nconst o = { X: 1 };\n";
    expect(valueUses(source, "X")).toBe(0);
  });

  it("flags decorators", () => {
    expect(usageByName("@Component({}) class A {}").decorators).toBe(true);
    expect(usageByName("const email = 'a@b';").decorators).toBe(false);
  });

  it("counts JSX tags and the classic JSX factory as values in .tsx", () => {
    expect(valueUses("export const a = <Foo bar={1} />;", "Foo", { jsx: true })).toBeGreaterThan(0);
    expect(valueUses("export const a = <div />;", "React", { jsx: true })).toBeGreaterThan(0);
    expect(valueUses("export const a = <p>don't {X}</p>;", "X", { jsx: true })).toBeGreaterThan(0);
  });

  it("tokenizes template expressions and regex literals", () => {
    const tokens = tokenize("const r = /a{2}`/g; const t = `x${ y }z`;");
    expect(tokens.some((tok) => tok.t === "regex")).toBe(true);
    expect(tokens.some((tok) => tok.t === "id" && tok.v === "y")).toBe(true);
  });
});

describe("declaredKinds and import bindings", () => {
  it("lists interfaces and type aliases, minus names that are also values", () => {
    const kinds = declaredKinds("export interface A {}\nexport type B = string;\ninterface C {}\nexport const C = 1;\nexport class D {}\nexport { x as E };\n");
    expect([...kinds.types].sort()).toEqual(["A", "B"]);
    expect(kinds.values.has("C")).toBe(true);
    expect(kinds.values.has("E")).toBe(true);
  });

  it("returns imported and local names for each specifier", () => {
    const [named, ns, reexport, all, side] = extractJsImports([
      "import Def, { a as b, type T, c } from './x';",
      "import * as NS from './y';",
      "export { d as e } from './z';",
      "export * from './w';",
      "import './v';",
    ].join("\n"));
    expect(named.bindings).toEqual([
      { imported: "default", local: "Def" },
      { imported: "a", local: "b" },
      { imported: "c", local: "c" },
    ]);
    expect(named.kind).toBe("import");
    expect(ns.bindings).toEqual([{ imported: "*", local: "NS" }]);
    expect(reexport).toMatchObject({ kind: "reexport", bindings: [{ imported: "d", local: null }] });
    expect(all.kind).toBe("reexport-all");
    expect(side.kind).toBe("side-effect");
  });
});

// Independent review (1.16.4): cases where a runtime edge must never be removed.
describe("review: runtime edges that must stay", () => {
  const graph = async (files) => {
    for (const [rel, content] of Object.entries(files)) await write(rel, content);
    const list = Object.keys(files).filter((rel) => /\.[cm]?tsx?$/.test(rel));
    return analyzeDependencyGraph(list, tempDir);
  };
  const classShape = {
    "src/a.ts": "import { Gen } from './b';\nexport function f(g: Gen) { return g; }\n",
    "src/b.ts": "export class Gen {}\n",
  };

  it("keeps a re-export of a class when the target only declares a same-named interface in a nested scope", async () => {
    const result = await graph({
      "src/index.ts": "export { Foo } from './barrel';\n",
      "src/barrel.ts": "export { Foo } from './impl';\nnamespace N { export interface Foo { a: 1 } }\nfunction f() { type Foo = string; return 1 as unknown as Foo; }\n",
      "src/impl.ts": "export class Foo {}\n",
    });
    expect(edgeIds(result)).toEqual(["src->src/barrel", "src/barrel->src/impl"]);
    expect(result.typeOnlyEdges).toEqual([]);
  });

  it("declaredKinds counts only top-level types, and re-exported or import-equals names as values", () => {
    const kinds = declaredKinds([
      "export { A } from './a';",
      "export { B as C } from './b';",
      "export * as D from './d';",
      "import E = require('./e');",
      "namespace N { export interface F {} }",
      "declare module 'm' { interface G {} }",
      "function h() { type H = string; }",
      "export interface A {}",
      "export type Top = number;",
    ].join("\n"));
    expect([...kinds.types]).toEqual(["Top"]);
    for (const name of ["A", "C", "D", "E"]) expect(kinds.values.has(name)).toBe(true);
  });

  it("keeps imports when a package tsconfig in `extends` sets verbatimModuleSyntax (installed, bare name)", async () => {
    const result = await graph({
      ...classShape,
      "tsconfig.json": '{ "extends": "@acme/tsconfig" }',
      "node_modules/@acme/tsconfig/tsconfig.json": '{ "compilerOptions": { "verbatimModuleSyntax": true } }',
    });
    expect(edgeIds(result)).toEqual(["src/a->src/b"]);
  });

  it("follows a package.json `tsconfig` field and node_modules in parent folders", async () => {
    const result = await graph({
      ...classShape,
      "src/tsconfig.json": '{ "extends": "@acme/base" }',
      "node_modules/@acme/base/package.json": '{ "tsconfig": "./strict.json" }',
      "node_modules/@acme/base/strict.json": '{ "compilerOptions": { "preserveValueImports": true } }',
    });
    expect(edgeIds(result)).toEqual(["src/a->src/b"]);
  });

  it("does not infer from usage when part of the extends chain is not in the checkout", async () => {
    const result = await graph({
      ...classShape,
      "src/types.ts": "export interface Opts { a: number }\n",
      "src/c.ts": "import { Opts } from './types';\nexport const c = (o: Opts) => o.a;\n",
      "tsconfig.json": '{ "extends": ["@tsconfig/strictest", "./.nuxt/tsconfig.json"] }',
    });
    // A class used only as a type stays a runtime edge (the base may set verbatimModuleSyntax)...
    expect(edgeIds(result)).toContain("src/a->src/b");
    // ...but an interface import is still type-only: it cannot compile without `type` under verbatim.
    expect(edgeIds(result)).not.toContain("src/c->src/types");
  });

  it("keeps imports under erasableSyntaxOnly (Node type stripping keeps every value import)", async () => {
    const result = await graph({ ...classShape, "tsconfig.json": '{ "compilerOptions": { "erasableSyntaxOnly": true } }' });
    expect(edgeIds(result)).toEqual(["src/a->src/b"]);
  });

  it("keeps imports in a file the tokenizer misreads (regex after `)` read as division)", async () => {
    const source = "import { Foo } from './foo';\nif (x) /a'/.test(s); Foo();\n";
    expect(usageByName(source).malformed).toBe(true);
    expect(usageByName("const r = /a'b/g; const s = 'x';").malformed).toBe(false);
    const result = await graph({ "src/a.ts": source, "src/foo.ts": "export function Foo() {}\n" });
    expect(edgeIds(result)).toEqual(["src/a->src/foo"]);
  });

  it("namespace imports, import-equals, enums, and class value uses", async () => {
    const result = await graph({
      "src/ns-type.ts": "import * as m from './m';\nexport let v: m.Shape;\n",
      "src/ns-value.ts": "import * as m from './m';\nexport const v = m.make();\n",
      "src/req.ts": "import m = require('./m');\nexport let v: m.Shape;\n",
      "src/enum-value.ts": "import { Color } from './m';\nexport const c: Color = Color.Red;\n",
      "src/enum-type.ts": "import { Color } from './m';\nexport let c: Color;\n",
      "src/class-both.ts": "import { Gen } from './m';\nexport const g: Gen = new Gen();\n",
      "src/extends.ts": "import { Gen } from './m';\nexport class Sub extends Gen {}\n",
      "src/typeof.ts": "import { Gen } from './m';\nexport let t: typeof Gen;\n",
      "src/m.ts": "export interface Shape {}\nexport function make() {}\nexport enum Color { Red }\nexport class Gen {}\n",
    });
    const ids = edgeIds(result);
    for (const from of ["ns-value", "req", "enum-value", "class-both", "extends"]) expect(ids).toContain(`src/${from}->src/m`);
    // TypeScript removes these (checked against transpileModule).
    for (const from of ["ns-type", "enum-type", "typeof"]) expect(ids).not.toContain(`src/${from}->src/m`);
  });
});
