import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { analyzeDependencyGraph } from "../src/analyzers/dependency-graph.js";
import { inferDomain, stripEntryFileName } from "../src/analyzers/domain-inference.js";
import { buildAIContext, inferFindings } from "../src/analyzers/context-builder.js";
import { filterNoiseFlows, inferDataFlows } from "../src/analyzers/flow-inference.js";
import { collectMaturitySignals, detectMaturity, scoreMaturity, majorVersion } from "../src/analyzers/maturity.js";
import { detectProjectName } from "../src/utils/project-name.js";
import { aiUpgradeSections } from "../src/utils/ai-notice.js";
import {
  generateExecutiveSummary,
  generateArchitectureOverview,
  generateDataFlows,
  generateDeveloperOnboarding,
} from "../src/ai/generate-sections.js";

let tempDir;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-output-"));
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

const emptyGraph = { nodes: [], edges: [], cycles: [], externalDeps: [], stats: { cycles: 0, totalEdges: 0 } };

function contextFor(modules, depGraph = emptyGraph, extra = {}) {
  return {
    ...buildAIContext(
      { filesCount: modules.length, modules, api: [], pages: [], metadata: { frameworks: [], languages: new Set(["TypeScript"]), buildTools: [], testFrameworks: [] } },
      { project: { name: "demo-lib" } },
      depGraph,
    ),
    ...extra,
  };
}

describe("1. project name", () => {
  it("resolves `.` to the real directory name", async () => {
    const dir = path.join(tempDir, "my-project-dir");
    await fs.mkdir(dir);
    const previous = process.cwd();
    process.chdir(dir);
    try {
      expect(detectProjectName(".")).toBe("my-project-dir");
      expect(detectProjectName("")).toBe("my-project-dir");
    } finally {
      process.chdir(previous);
    }
  });

  it("prefers the package.json name and ignores invalid package.json", async () => {
    await write("pkg/package.json", JSON.stringify({ name: "music-metadata", version: "12.2.3" }));
    expect(detectProjectName(path.join(tempDir, "pkg"))).toBe("music-metadata");
    await write("bad/package.json", "{ not json");
    expect(detectProjectName(path.join(tempDir, "bad"))).toBe("bad");
  });

  it("never returns . or ..", () => {
    expect(detectProjectName(".")).not.toBe(".");
    expect(detectProjectName("..")).not.toBe("..");
  });
});

describe("2. maturity", () => {
  it("does not call a v12 library with tests, CI, and docs early-stage", async () => {
    await write("package.json", JSON.stringify({ name: "lib", version: "12.2.3" }));
    await write("README.md", "# lib\n");
    await write("docs/guide.md", "# guide\n");
    await write(".github/workflows/ci.yml", "name: CI\n");
    const maturity = detectMaturity(tempDir, { hasTests: true, cycles: 2 });
    expect(maturity.label).toBe("Production-grade");
    expect(maturity.score).toBeGreaterThanOrEqual(4);
    expect(maturity.signals.find((s) => s.key === "version").met).toBe(true);
  });

  it("calls a 0.x project with no tests, CI, or docs early-stage", async () => {
    await write("package.json", JSON.stringify({ name: "wip", version: "0.1.0" }));
    const maturity = detectMaturity(tempDir, { hasTests: false, cycles: 0 });
    expect(maturity.label).toBe("Early-stage");
  });

  it("leaves unmeasurable signals out of the total", () => {
    const signals = collectMaturitySignals(tempDir, { hasTests: true, cycles: null, version: "3.0.0", git: { shallow: true, tags: 0, firstCommitMs: null } });
    expect(signals.find((s) => s.key === "history").met).toBeNull();
    expect(signals.find((s) => s.key === "deps").met).toBeNull();
    const result = scoreMaturity(signals);
    expect(result.max).toBe(signals.filter((s) => s.met !== null).length);
  });

  it("counts more than a year of commit history", () => {
    const now = Date.UTC(2026, 9, 1);
    const old = collectMaturitySignals(tempDir, { version: "1.0.0", git: { shallow: false, tags: 6, firstCommitMs: Date.UTC(2020, 0, 1) }, now });
    expect(old.find((s) => s.key === "history").met).toBe(true);
    expect(old.find((s) => s.key === "releases").met).toBe(true);
    const fresh = collectMaturitySignals(tempDir, { version: "1.0.0", git: { shallow: false, tags: 1, firstCommitMs: Date.UTC(2026, 8, 1) }, now });
    expect(fresh.find((s) => s.key === "history").met).toBe(false);
  });

  it("parses major versions", () => {
    expect(majorVersion("12.2.3")).toBe(12);
    expect(majorVersion("v1.0.0")).toBe(1);
    expect(majorVersion("next")).toBeNull();
  });

  it("shows the measured maturity in the executive summary with a correct article", async () => {
    const modules = [{ key: "lib/ogg", fileCount: 3 }];
    const context = contextFor(modules, emptyGraph, {
      maturity: { label: "Early-stage", score: 1, max: 6, signals: [] },
    });
    const summary = await generateExecutiveSummary(context, { depGraph: emptyGraph, flows: [] }, {});
    expect(summary).toContain("is an early-stage");
    expect(summary).toContain("Early-stage (1/6 indicators)");
    const mature = await generateExecutiveSummary(
      { ...context, maturity: { label: "Production-grade", score: 5, max: 6, signals: [] } },
      { depGraph: emptyGraph, flows: [] },
      {},
    );
    expect(mature).toContain("is a production-grade");
    expect(mature).toContain("Production-grade (5/6 indicators)");
  });
});

describe("3. entry and barrel files are not classified by name", () => {
  it("does not map lib/index.ts to Search & Discovery", () => {
    expect(inferDomain("lib/index.ts").domain).not.toBe("Search & Discovery");
    expect(inferDomain("index.ts").domain).toBe("Other");
    expect(inferDomain("src/main.py").domain).toBe("Other");
  });

  it("still classifies a real search directory", () => {
    expect(inferDomain("src/search/index.js").domain).toBe("Search & Discovery");
    expect(inferDomain("src/index/builder.js").domain).toBe("Search & Discovery");
  });

  it("lets a user-defined hint see the full path", () => {
    const hints = [{ match: ["index"], domain: "Indexing", description: "Custom" }];
    expect(inferDomain("lib/index.ts", hints).domain).toBe("Indexing");
  });

  it("strips only entry file names", () => {
    expect(stripEntryFileName("lib/index.ts")).toBe("lib");
    expect(stripEntryFileName("pkg/__init__.py")).toBe("pkg");
    expect(stripEntryFileName("src/index/builder.js")).toBe("src/index/builder.js");
    expect(stripEntryFileName("src/indexer.ts")).toBe("src/indexer.ts");
  });
});

describe("4. core is not automatically a kernel", () => {
  it("does not cite a file named core.ts as Core/kernel architecture", () => {
    const context = contextFor([{ key: "lib/core.ts", fileCount: 1 }, { key: "lib/ogg", fileCount: 4 }]);
    expect(context.patterns.some((p) => p.startsWith("Core/kernel"))).toBe(false);
  });

  it("still cites a core/ or kernel/ directory", () => {
    const context = contextFor([{ key: "src/core", fileCount: 6 }, { key: "src/cli.js", fileCount: 1 }]);
    expect(context.patterns.some((p) => p.startsWith("Core/kernel architecture") && p.includes("src/core"))).toBe(true);
  });
});

describe("5. folders are not all labelled utility", () => {
  it("does not describe lib/ogg as utility and helper functions", async () => {
    const modules = [
      { key: "lib/ogg", fileCount: 15 },
      { key: "lib/id3v2", fileCount: 9 },
      { key: "lib/common", fileCount: 10 },
      { key: "src/utils", fileCount: 3 },
    ];
    const context = contextFor(modules);
    const onboarding = await generateDeveloperOnboarding(context, { depGraph: emptyGraph, flows: [], scanResult: { modules, filesCount: 37 } }, {});
    const overview = await generateArchitectureOverview(context, { depGraph: emptyGraph }, {});
    const text = `${onboarding}\n${overview}`;
    expect(text).not.toMatch(/`lib\/ogg`[^\n]*Utility and helper functions/);
    expect(text).not.toMatch(/`lib\/id3v2`[^\n]*Utility and helper functions/);
    expect(overview).toContain("| `lib/ogg` | 15 | Ogg module |");
    expect(overview).toContain("| `lib/id3v2` | 9 | Id3v2 module |");
    expect(overview).toContain("Code shared by the other modules");
  });

  it("keeps an utils folder described as utilities", async () => {
    const modules = [{ key: "src/utils", fileCount: 3 }, { key: "src/auth", fileCount: 2 }];
    const context = contextFor(modules);
    const overview = await generateArchitectureOverview(context, { depGraph: emptyGraph }, {});
    expect(overview).toContain("Utility and helper functions");
    expect(overview).toContain("Authentication and authorization logic");
  });
});

describe("6. cycles are findings, not patterns", () => {
  const cyclic = { nodes: [], edges: [], cycles: [["a", "b", "a"], ["c", "d", "c"]], externalDeps: [], stats: { cycles: 2, totalEdges: 12 } };

  it("keeps cycles out of the patterns list", () => {
    const context = contextFor([{ key: "src/a.ts", fileCount: 1 }], cyclic);
    expect(context.patterns.some((p) => /circular/i.test(p))).toBe(false);
    expect(context.findings).toEqual(["⚠️ 2 circular dependency cycles detected"]);
  });

  it("reports one cycle in the singular and none when acyclic", () => {
    expect(inferFindings({ stats: { cycles: 1 } })).toEqual(["⚠️ 1 circular dependency cycle detected"]);
    expect(inferFindings(emptyGraph)).toEqual([]);
    expect(inferFindings(null)).toEqual([]);
  });

  it("renders cycles under Findings in the architecture overview", async () => {
    const modules = [{ key: "src/a.ts", fileCount: 1 }, { key: "src/b.ts", fileCount: 1 }];
    const context = contextFor(modules, cyclic);
    const overview = await generateArchitectureOverview(context, { depGraph: cyclic }, {});
    expect(overview).toContain("### Findings");
    expect(overview).toContain("2 circular dependency cycles detected");
    const patternSection = overview.split("### Findings")[0];
    expect(patternSection).not.toMatch(/\*\*⚠️ 2 circular/);
  });
});

describe("7. the package's own name is not an external dependency", () => {
  it("skips self-imports from examples and nested packages", async () => {
    await write("package.json", JSON.stringify({ name: "music-metadata" }));
    await write("lib/index.js", `import { parse } from "./parse.js";\nimport yaml from "yaml";\nexport { parse };\n`);
    await write("lib/parse.js", `export const parse = () => {};\n`);
    await write("example/javascript/read.js", `import { parseFile } from "music-metadata";\nimport fetch from "node-fetch";\nparseFile();\n`);
    await write("example/javascript/sub.js", `import "music-metadata/lib/thing";\n`);
    const result = await analyzeDependencyGraph(
      ["lib/index.js", "lib/parse.js", "example/javascript/read.js", "example/javascript/sub.js"],
      tempDir,
    );
    expect(result.externalDeps).toEqual(["node-fetch", "yaml"]);
  });

  it("still reports the root package name when a nested package imports it", async () => {
    await write("package.json", JSON.stringify({ name: "root-pkg" }));
    await write("nested/package.json", JSON.stringify({ name: "nested-pkg" }));
    await write("nested/a.js", `import "root-pkg";\nimport "nested-pkg";\n`);
    const result = await analyzeDependencyGraph(["nested/a.js"], tempDir);
    expect(result.externalDeps).toEqual(["root-pkg"]);
  });
});

describe("8. AI notice", () => {
  it("only offers sections that were written and never calls them missing", () => {
    const sections = aiUpgradeSections([
      { key: "executive_summary" },
      { key: "developer_onboarding" },
      { key: "module_catalog" },
      { key: "data_flows", error: true },
    ]);
    expect(sections.map((s) => s.key)).toEqual(["executive_summary", "developer_onboarding"]);
  });

  it("offers nothing when no AI-capable section was generated", () => {
    expect(aiUpgradeSections([{ key: "module_catalog" }])).toEqual([]);
  });

  it("falls back to every AI-capable section without a document list", () => {
    expect(aiUpgradeSections().length).toBe(5);
  });

  it("does not print the old 'missing' wording in the demo notice", async () => {
    const source = await fs.readFile(path.join(process.cwd(), "src", "cli.js"), "utf8");
    expect(source).not.toContain("Your docs are missing these AI-powered sections");
  });
});

describe("9. noise data flows", () => {
  const flow = (name, steps, first = "src/app.js") => ({ name, steps, modules: [first], description: "d" });

  it("drops flows with no steps or only the starting file", () => {
    const kept = filterNoiseFlows([
      flow("util Integration Flow", []),
      flow("app Request Flow", ["`app` (entry point)"]),
      flow("server Request Flow", ["`server` (entry point)", "`db` (leaf)"], "src/server.js"),
    ]);
    expect(kept.map((f) => f.name)).toEqual(["server Request Flow"]);
  });

  it("drops chains that start in doc-gen, scripts, or examples", () => {
    const steps = ["`a`", "`b`"];
    expect(filterNoiseFlows([
      flow("gen Request Flow", steps, "doc-gen/gen"),
      flow("build Command Flow", steps, "scripts/build"),
      flow("demo Request Flow", steps, "example/js/demo"),
      flow("main Request Flow", steps, "src/main"),
    ]).map((f) => f.name)).toEqual(["main Request Flow"]);
  });

  it("drops generic helper names", () => {
    const steps = ["`a`", "`b`"];
    expect(filterNoiseFlows([flow("util Integration Flow", steps, "lib/util"), flow("gen Request Flow", steps, "src/gen"), flow("router Request Flow", steps, "src/router")]).map((f) => f.name)).toEqual(["router Request Flow"]);
  });

  it("tolerates missing input", () => {
    expect(filterNoiseFlows(undefined)).toEqual([]);
    expect(filterNoiseFlows([null])).toEqual([]);
  });

  it("does not infer a flow from a doc-gen script", () => {
    const node = (key, imports = [], importedBy = []) => ({ key, imports, importedBy });
    const graph = {
      nodes: [
        node("doc-gen/gen", ["lib/a", "lib/b"]),
        node("lib/a", [], ["doc-gen/gen"]),
        node("lib/b", [], ["doc-gen/gen"]),
      ],
    };
    const flows = inferDataFlows({ modules: [], pages: [], api: [] }, {}, graph);
    expect(flows.some((f) => f.name.startsWith("gen "))).toBe(false);
  });

  it("does not render 0-step flows in the data flows document", async () => {
    const graph = {
      nodes: [
        { key: "lib/util", imports: [], importedBy: ["test/a.test", "test/b.test", "test/c.test"] },
        { key: "lib/x", imports: [], importedBy: [] },
      ],
      edges: [], cycles: [], externalDeps: [], stats: { cycles: 0, totalEdges: 3 },
    };
    const context = contextFor([{ key: "lib/util", fileCount: 1 }], graph);
    const doc = await generateDataFlows([], context, { depGraph: graph }, {});
    expect(doc).not.toContain("0 steps");
    expect(doc).not.toContain("util Integration Flow");
  });
});

describe("git history for maturity", () => {
  it("reads tags and commit age from a real repo", async () => {
    await write("package.json", JSON.stringify({ name: "g", version: "2.0.0" }));
    const run = (...args) => execFileSync("git", args, { cwd: tempDir, stdio: "ignore", env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t", GIT_AUTHOR_DATE: "2020-01-01T00:00:00Z", GIT_COMMITTER_DATE: "2020-01-01T00:00:00Z" } });
    run("init", "-q");
    run("add", ".");
    run("commit", "-q", "-m", "init");
    for (let i = 0; i < 5; i++) run("tag", `v${i}`);
    const signals = collectMaturitySignals(tempDir, { hasTests: true, cycles: 0 });
    expect(signals.find((s) => s.key === "releases").met).toBe(true);
    expect(signals.find((s) => s.key === "history").met).toBe(true);
  });
});
