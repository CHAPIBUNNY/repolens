import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { computeComplexity, extractFunctions, analyzeComplexity, computeCodeHealth } from "../src/analyzers/complexity-analyzer.js";
import { renderCodeHealth } from "../src/renderers/renderAnalysis.js";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

let tmpDir;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-cx-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function writeFile(name, content) {
  const filePath = path.join(tmpDir, name);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
  return name;
}

// ─── computeComplexity ───────────────────────────────────────────

describe("computeComplexity", () => {
  it("returns 1 for trivial code", () => {
    expect(computeComplexity("const x = 1;")).toBe(1);
  });

  it("counts if statements", () => {
    const code = `
      if (a) { x(); }
      if (b) { y(); }
    `;
    // baseline 1 + 2 if = 3
    expect(computeComplexity(code)).toBe(3);
  });

  it("counts else-if without double-counting", () => {
    const code = `
      if (a) { x(); }
      else if (b) { y(); }
      else if (c) { z(); }
    `;
    // baseline 1 + 1 if + 2 else-if (counted) – 2 else-if (subtracted) + 2 else-if if-match = 3
    // Actually: 1 (base) + 3 if-matches from pattern + 2 else-if-matches – 2 else-if correction = 3
    // Wait: `if (a)` matches /\bif\s*\(/g once, `else if (b)` matches both patterns
    // if pattern finds: if(a), if(b), if(c) = 3
    // else if pattern finds: else if(b), else if(c) = 2
    // total: 1 + 3 + 2 – 2 = 4... but else if pattern also adds
    // Let me re-read: the code adds all pattern matches, then subtracts else-if count
    // if pattern: matches "if (a)", "if (b)" inside "else if (b)", "if (c)" inside "else if (c)" = 3
    // else if pattern: matches "else if (b)", "else if (c)" = 2
    // So: 1 + 3 (if) + 2 (else if) - 2 (correction) = 4
    // But we want 3 (one per branch). The pattern intentionally counts:
    // each `if` and `else if` is one branch, so 3 branches: complexity = 1 + 3 - 1 = 3
    // Actually the double-count correction: if(a)=1, else if(b)=1 via if AND 1 via else-if (subtract 1), else if(c) same
    // So: 1 + 3(if) + 2(else-if) - 2(correction) = 4
    // This is correct! if/else-if/else-if = 3 decision points + 1 baseline = 4
    expect(computeComplexity(code)).toBe(4);
  });

  it("counts for loops", () => {
    expect(computeComplexity("for (let i = 0; i < 10; i++) {}")).toBe(2);
  });

  it("counts while loops", () => {
    expect(computeComplexity("while (true) { break; }")).toBe(2);
  });

  it("counts switch cases", () => {
    const code = `
      switch (x) {
        case 1: break;
        case 2: break;
        case 3: break;
      }
    `;
    // baseline 1 + 3 case = 4
    expect(computeComplexity(code)).toBe(4);
  });

  it("counts ternary operators", () => {
    const code = "const x = a ? b : c;";
    expect(computeComplexity(code)).toBe(2);
  });

  it("does not count optional chaining as ternary", () => {
    const code = "const x = obj?.prop?.value;";
    expect(computeComplexity(code)).toBe(1);
  });

  it("counts logical operators", () => {
    const code = "if (a && b || c) { x(); }";
    // 1 + 1(if) + 1(&&) + 1(||) = 4
    expect(computeComplexity(code)).toBe(4);
  });

  it("counts nullish coalescing", () => {
    const code = "const x = a ?? b;";
    expect(computeComplexity(code)).toBe(2);
  });

  it("counts catch blocks", () => {
    const code = `
      try { x(); }
      catch (e) { y(); }
    `;
    expect(computeComplexity(code)).toBe(2);
  });

  it("ignores keywords in comments", () => {
    const code = `
      // if (a) for (b) while (c)
      /* case 1: catch (e) */
      const x = 1;
    `;
    expect(computeComplexity(code)).toBe(1);
  });

  it("ignores keywords in string literals", () => {
    const code = `const msg = "if (condition) while (true) case 1:";`;
    expect(computeComplexity(code)).toBe(1);
  });

  it("handles complex real-world code", () => {
    const code = `
      function process(items) {
        if (!items) return null;
        for (const item of items) {
          if (item.type === "a" && item.active) {
            try {
              handle(item);
            } catch (e) {
              if (e.code === 404) {
                retry(item);
              } else if (e.code === 500) {
                throw e;
              }
            }
          } else if (item.type === "b") {
            skip(item);
          }
        }
        return items.length > 0 ? items : null;
      }
    `;
    // 1 + if + for + if + && + catch + if + else-if(e.code===500) + else-if(item.type==="b") + ternary
    // = 1 + 5(if) + 1(for) + 1(&&) + 1(catch) + 2(else-if matches) - 2(else-if correction) + 1(ternary)
    // = 1 + 5 + 1 + 1 + 1 + 2 - 2 + 1 = 10
    const result = computeComplexity(code);
    expect(result).toBeGreaterThanOrEqual(8);
    expect(result).toBeLessThanOrEqual(12);
  });
});

// ─── extractFunctions ────────────────────────────────────────────

describe("extractFunctions", () => {
  it("extracts named functions", () => {
    const code = `
      function hello() { return 1; }
      export function world() { return 2; }
    `;
    const funcs = extractFunctions(code);
    expect(funcs.length).toBe(2);
    expect(funcs[0].name).toBe("hello");
    expect(funcs[1].name).toBe("world");
  });

  it("extracts arrow functions", () => {
    const code = `
      const add = (a, b) => a + b;
      export const mul = (a, b) => a * b;
    `;
    const funcs = extractFunctions(code);
    expect(funcs.length).toBe(2);
    expect(funcs[0].name).toBe("add");
  });

  it("computes per-function complexity", () => {
    const code = `
      function simple() { return 1; }
      function complex() {
        if (a) { for (const x of y) { if (z) {} } }
      }
    `;
    const funcs = extractFunctions(code);
    const simpleFunc = funcs.find(f => f.name === "simple");
    const complexFunc = funcs.find(f => f.name === "complex");
    expect(simpleFunc.complexity).toBeLessThan(complexFunc.complexity);
  });

  it("returns empty array for no functions", () => {
    const funcs = extractFunctions("const x = 1;");
    expect(funcs).toEqual([]);
  });
});

// ─── analyzeComplexity ───────────────────────────────────────────

describe("analyzeComplexity", () => {
  it("analyzes JS files", async () => {
    await writeFile("src/a.js", `
      export function handle(x) {
        if (x > 0) return x;
        return -x;
      }
    `);
    const result = await analyzeComplexity(["src/a.js"], tmpDir);
    expect(result.files.length).toBe(1);
    expect(result.files[0].complexity).toBeGreaterThanOrEqual(2);
    expect(result.files[0].file).toBe("src/a.js");
    expect(result.functions.length).toBeGreaterThanOrEqual(1);
  });

  it("skips test files", async () => {
    await writeFile("a.test.js", "if (x) {}");
    const result = await analyzeComplexity(["a.test.js"], tmpDir);
    expect(result.files.length).toBe(0);
  });

  it("skips non-JS files", async () => {
    await writeFile("readme.md", "if something then");
    const result = await analyzeComplexity(["readme.md"], tmpDir);
    expect(result.files.length).toBe(0);
  });

  it("handles non-existent files", async () => {
    const result = await analyzeComplexity(["missing.js"], tmpDir);
    expect(result.files.length).toBe(0);
  });

  it("reports line count", async () => {
    await writeFile("lines.js", "a\nb\nc\nd\n");
    const result = await analyzeComplexity(["lines.js"], tmpDir);
    expect(result.files[0].lines).toBe(5);
  });

  it("reports function count per file", async () => {
    await writeFile("funcs.js", `
      function a() {}
      function b() {}
      const c = () => {};
    `);
    const result = await analyzeComplexity(["funcs.js"], tmpDir);
    expect(result.files[0].functions).toBe(3);
  });

  it("reports max function complexity", async () => {
    await writeFile("mix.js", `
      function simple() { return 1; }
      function hard() { if (a && b) { for (const x of y) { if (z || w) {} } } }
    `);
    const result = await analyzeComplexity(["mix.js"], tmpDir);
    expect(result.files[0].maxFunctionComplexity).toBeGreaterThan(1);
  });
});

// ─── computeCodeHealth ───────────────────────────────────────────

describe("computeCodeHealth", () => {
  const baseComplexity = {
    files: [
      { file: "src/a.js", complexity: 5, lines: 50, maxFunctionComplexity: 3, functions: 2 },
      { file: "src/b.js", complexity: 35, lines: 200, maxFunctionComplexity: 20, functions: 5 },
    ],
    functions: [
      { name: "foo", file: "src/a.js", line: 1, complexity: 3 },
      { name: "bar", file: "src/b.js", line: 10, complexity: 20 },
    ],
    filesAnalyzed: 2,
  };

  it("assigns high score to simple files", () => {
    const result = computeCodeHealth(baseComplexity, { nodes: [] }, { byFile: {} }, { findings: [] });
    const modA = result.modules.find(m => m.file === "src/a.js");
    expect(modA.score).toBeGreaterThanOrEqual(80);
    expect(modA.grade).toBe("A");
  });

  it("penalizes high complexity files", () => {
    const result = computeCodeHealth(baseComplexity, { nodes: [] }, { byFile: {} }, { findings: [] });
    const modB = result.modules.find(m => m.file === "src/b.js");
    expect(modB.score).toBeLessThan(60);
    expect(["C", "D", "F"]).toContain(modB.grade);
  });

  it("penalizes high coupling", () => {
    const depGraph = {
      nodes: [
        { file: "src/a.js", imports: ["b", "c", "d", "e", "f"], importedBy: ["g", "h", "i", "j", "k"] },
      ]
    };
    const simpleComplexity = {
      files: [{ file: "src/a.js", complexity: 5, lines: 50, maxFunctionComplexity: 3, functions: 1 }],
      functions: [],
      filesAnalyzed: 1,
    };
    const result = computeCodeHealth(simpleComplexity, depGraph, { byFile: {} }, { findings: [] });
    const mod = result.modules[0];
    expect(mod.coupling).toBe(25);
    expect(mod.score).toBeLessThan(100);
  });

  it("penalizes low documentation coverage", () => {
    const jsdocResult = {
      byFile: {
        "src/a.js": [
          { name: "x", jsdoc: null },
          { name: "y", jsdoc: null },
          { name: "z", jsdoc: null },
        ]
      }
    };
    const simpleComplexity = {
      files: [{ file: "src/a.js", complexity: 2, lines: 30, maxFunctionComplexity: 2, functions: 3 }],
      functions: [],
      filesAnalyzed: 1,
    };
    const result = computeCodeHealth(simpleComplexity, { nodes: [] }, jsdocResult, { findings: [] });
    const mod = result.modules[0];
    expect(mod.docCoverage).toBe(0);
    expect(mod.score).toBeLessThan(100);
  });

  it("penalizes security findings", () => {
    const secResult = {
      findings: [
        { file: "src/a.js", severity: "high" },
        { file: "src/a.js", severity: "medium" },
      ]
    };
    const simpleComplexity = {
      files: [{ file: "src/a.js", complexity: 2, lines: 30, maxFunctionComplexity: 2, functions: 1 }],
      functions: [],
      filesAnalyzed: 1,
    };
    const result = computeCodeHealth(simpleComplexity, { nodes: [] }, { byFile: {} }, secResult);
    const mod = result.modules[0];
    expect(mod.securityFindings).toBe(2);
    expect(mod.score).toBeLessThan(90);
  });

  it("sorts modules worst-first", () => {
    const result = computeCodeHealth(baseComplexity, { nodes: [] }, { byFile: {} }, { findings: [] });
    expect(result.modules[0].score).toBeLessThanOrEqual(result.modules[1].score);
  });

  it("computes grade distribution", () => {
    const result = computeCodeHealth(baseComplexity, { nodes: [] }, { byFile: {} }, { findings: [] });
    const total = Object.values(result.stats.gradeDistribution).reduce((s, n) => s + n, 0);
    expect(total).toBe(2);
  });

  it("returns top complex functions", () => {
    const result = computeCodeHealth(baseComplexity, { nodes: [] }, { byFile: {} }, { findings: [] });
    expect(result.topComplexFunctions.length).toBe(2);
    expect(result.topComplexFunctions[0].complexity).toBeGreaterThanOrEqual(result.topComplexFunctions[1].complexity);
  });

  it("identifies hotspots", () => {
    const result = computeCodeHealth(baseComplexity, { nodes: [] }, { byFile: {} }, { findings: [] });
    expect(result.hotspots.every(m => m.score < 60)).toBe(true);
  });

  it("generates a summary string", () => {
    const result = computeCodeHealth(baseComplexity, { nodes: [] }, { byFile: {} }, { findings: [] });
    expect(result.summary).toContain("2 files analyzed");
    expect(result.summary).toContain("Average health");
  });

  it("handles empty input", () => {
    const result = computeCodeHealth({ files: [], functions: [], filesAnalyzed: 0 }, { nodes: [] }, { byFile: {} }, { findings: [] });
    expect(result.modules.length).toBe(0);
    expect(result.stats.avgScore).toBe(100);
  });

  it("clamps score between 0 and 100", () => {
    const extreme = {
      files: [{ file: "x.js", complexity: 100, lines: 500, maxFunctionComplexity: 80, functions: 1 }],
      functions: [],
      filesAnalyzed: 1,
    };
    const secResult = {
      findings: Array(10).fill({ file: "x.js", severity: "high" }),
    };
    const result = computeCodeHealth(extreme, { nodes: [] }, { byFile: {} }, secResult);
    expect(result.modules[0].score).toBeGreaterThanOrEqual(0);
    expect(result.modules[0].score).toBeLessThanOrEqual(100);
  });
});

// ─── renderCodeHealth ────────────────────────────────────────────

describe("renderCodeHealth", () => {
  it("renders empty state for no data", () => {
    const result = renderCodeHealth({ modules: [] });
    expect(result).toContain("No source files");
    expect(result).toContain("# Code Health Report");
  });

  it("renders null/undefined as empty", () => {
    expect(renderCodeHealth(null)).toContain("No source files");
    expect(renderCodeHealth(undefined)).toContain("No source files");
  });

  it("renders full report with modules", () => {
    const healthResult = {
      summary: "5 files · avg 72",
      modules: [
        { file: "src/bad.js", score: 30, grade: "D", lines: 200, complexity: 40, maxFunctionComplexity: 25, fanIn: 3, fanOut: 8, coupling: 24, docCoverage: 20, securityFindings: 2, highSecurityFindings: 1 },
        { file: "src/ok.js", score: 75, grade: "B", lines: 80, complexity: 8, maxFunctionComplexity: 5, fanIn: 2, fanOut: 1, coupling: 2, docCoverage: 80, securityFindings: 0, highSecurityFindings: 0 },
        { file: "src/good.js", score: 95, grade: "A", lines: 30, complexity: 3, maxFunctionComplexity: 2, fanIn: 5, fanOut: 0, coupling: 0, docCoverage: 100, securityFindings: 0, highSecurityFindings: 0 },
      ],
      stats: {
        totalFiles: 3,
        avgScore: 67,
        avgComplexity: 17,
        gradeDistribution: { A: 1, B: 1, C: 0, D: 1, F: 0 },
      },
      hotspots: [
        { file: "src/bad.js", score: 30, grade: "D", complexity: 40, fanIn: 3, fanOut: 8, coupling: 24, docCoverage: 20, securityFindings: 2, highSecurityFindings: 1 },
      ],
      topComplexFunctions: [
        { name: "processAll", file: "src/bad.js", line: 15, complexity: 25 },
        { name: "validate", file: "src/ok.js", line: 8, complexity: 5 },
      ],
    };

    const md = renderCodeHealth(healthResult);
    expect(md).toContain("# Code Health Report");
    expect(md).toContain("Overview");
    expect(md).toContain("Grade Distribution");
    expect(md).toContain("🟢 A");
    expect(md).toContain("🟠 D");
    expect(md).toContain("Hotspots");
    expect(md).toContain("src/bad.js");
    expect(md).toContain("Most Complex Functions");
    expect(md).toContain("processAll()");
    expect(md).toContain("All Modules by Health Score");
    expect(md).toContain("Scoring Methodology");
  });
});

// ─── document-plan integration ───────────────────────────────────

describe("document-plan integration", () => {
  it("includes code_health in DOCUMENT_PLAN", async () => {
    const { DOCUMENT_PLAN, getDocumentByKey } = await import("../src/ai/document-plan.js");
    const entry = getDocumentByKey("code_health");
    expect(entry).toBeDefined();
    expect(entry.filename).toBe("16-code-health.md");
    expect(entry.audience).toBe("mixed");
    expect(entry.ai).toBe(false);
    expect(DOCUMENT_PLAN.length).toBe(17);
  });
});
