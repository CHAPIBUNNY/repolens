import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { analyzeDependencyGraph, countBindingCalls } from "../src/analyzers/dependency-graph.js";
import { renderDependencyGraph } from "../src/renderers/renderAnalysis.js";
import { generateArchitectureOverview } from "../src/ai/generate-sections.js";

let tempDir;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-cycles-"));
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

const overviewContext = {
  project: { name: "fixture", modulesDetected: 2, filesScanned: 4, pagesDetected: 0, apiRoutesDetected: 0 },
  patterns: [],
  domains: [{ name: "Core", description: "core" }],
  topModules: [],
  techStack: { frameworks: [], languages: ["TypeScript"], buildTools: [], testFrameworks: ["Vitest"] },
};

describe("cycle priority heuristic", () => {
  it("counts calls of imported bindings", () => {
    const source = `import { foo } from "./x";\nfoo();\nfoo.bar();\nfoo?.();\n`;
    expect(countBindingCalls(source, ["foo"])).toBe(3);
  });

  it("labels a two-folder call-heavy pair as mutual recursion, not high", async () => {
    await write("getters/one.ts", `
      import { resolveA, resolveB } from "../resolvers/one.js";
      export function getA(value) { return resolveA(resolveB(value)); }
    `);
    await write("getters/two.ts", `
      import { resolveC } from "../resolvers/two.js";
      export function getC(value) { return resolveC(value); }
    `);
    await write("resolvers/one.ts", `
      import { getA } from "../getters/one.js";
      import { getC } from "../getters/two.js";
      export function resolveA(value) { return getA(value); }
      export function resolveB(value) { return getC(value); }
    `);
    await write("resolvers/two.ts", `
      import { getC } from "../getters/two.js";
      export function resolveC(value) { return getC(value); }
    `);

    const files = ["getters/one.ts", "getters/two.ts", "resolvers/one.ts", "resolvers/two.ts"];
    const result = await analyzeDependencyGraph(files, tempDir);
    expect(result.cycles.length).toBeGreaterThan(0);
    expect(result.cycleReports.every((item) => item.priority === "low")).toBe(true);
    expect(result.cycleReports.every((item) => item.kind === "mutual-recursion")).toBe(true);
    expect(result.stats.highCycles).toBe(0);
    expect(result.stats.lowCycles).toBe(result.cycles.length);

    const doc = renderDependencyGraph(result);
    expect(doc).toContain("mutual recursion, probably intentional; verify");
    expect(doc).toContain("Priority: Low");
    expect(doc).not.toContain("Priority: High refactor");

    const overview = await generateArchitectureOverview(overviewContext, { depGraph: result, flows: [] }, {});
    expect(overview).toContain("mutual recursion, probably intentional; verify");
    expect(overview).toContain("Priority: Low");
    expect(overview).not.toContain("Priority: High refactor");
  });

  it("keeps a large multi-module cycle at high priority", async () => {
    await write("mod-a/a.ts", `import { b } from "../mod-b/b.js";\nexport function a() { return b(); }\n`);
    await write("mod-b/b.ts", `import { c } from "../mod-c/c.js";\nexport function b() { return c(); }\n`);
    await write("mod-c/c.ts", `import { a } from "../mod-a/a.js";\nexport function c() { return a(); }\n`);
    const result = await analyzeDependencyGraph(["mod-a/a.ts", "mod-b/b.ts", "mod-c/c.ts"], tempDir);
    expect(result.cycles.length).toBeGreaterThan(0);
    expect(result.cycleReports.some((item) => item.priority === "high")).toBe(true);
    expect(result.stats.highCycles).toBeGreaterThan(0);
    const doc = renderDependencyGraph(result);
    expect(doc).toContain("Priority: High refactor");
  });

  it("does not call a single mutual import high or intentional recursion", async () => {
    await write("left/a.ts", `import { b } from "../right/b.js";\nexport function a() { return b(); }\n`);
    await write("right/b.ts", `import { a } from "../left/a.js";\nexport function b() { return a(); }\n`);
    const result = await analyzeDependencyGraph(["left/a.ts", "right/b.ts"], tempDir);
    expect(result.cycles.length).toBe(1);
    expect(result.cycleReports[0].priority).toBe("medium");
    expect(result.cycleReports[0].kind).toBe("small");
    expect(renderDependencyGraph(result)).toContain("Priority: Medium");
    expect(renderDependencyGraph(result)).not.toContain("Priority: High refactor");
  });

  it("reports a type-only cycle as low and not as a runtime cycle", async () => {
    await write("types/options.ts", `import type { Hooks } from "./hooks.js";\nexport type Options = { hooks?: Hooks };\n`);
    await write("types/hooks.ts", `import type { Options } from "./options.js";\nexport type Hooks = { stop: Options };\n`);
    const result = await analyzeDependencyGraph(["types/options.ts", "types/hooks.ts"], tempDir);
    expect(result.edges).toEqual([]);
    expect(result.cycles).toEqual([]);
    expect(result.stats.cycles).toBe(0);
    expect(result.stats.highCycles).toBe(0);
    expect(result.typeOnlyReports.length).toBeGreaterThan(0);
    expect(result.typeOnlyReports.every((item) => item.priority === "low")).toBe(true);
    expect(result.typeOnlyReports[0].label).toContain("type-only imports");
    const doc = renderDependencyGraph(result);
    expect(doc).toContain("Type-only cycles");
    expect(doc).toContain("Priority: Low — type-only imports; verify");
    expect(doc).not.toContain("Priority: High refactor");
  });
});
