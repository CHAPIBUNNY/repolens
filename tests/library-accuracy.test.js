// Output accuracy for a plain-JavaScript library with a flat src/ and a build-helper bin/
// (found by running RepoLens on mattiasw/ExifReader). One describe block per bug.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { scanRepo } from "../src/core/scan.js";
import { analyzeDependencyGraph } from "../src/analyzers/dependency-graph.js";
import { analyzeSecurityPatterns, isStaticHtmlAssignment } from "../src/analyzers/security-patterns.js";
import { inferDomain, stripContainerSegments } from "../src/analyzers/domain-inference.js";
import { buildAIContext, buildModuleContext, computeModuleLevelMetrics, isCliProject } from "../src/analyzers/context-builder.js";
import { inferDataFlows } from "../src/analyzers/flow-inference.js";
import { isTestPath, isToolingPath, isBuildOrExamplePath } from "../src/utils/path-roles.js";
import { emptyDocumentReason } from "../src/docs/generate-doc-set.js";
import { renderDependencyGraph } from "../src/renderers/renderAnalysis.js";
import {
  generateExecutiveSummary,
  generateArchitectureOverview,
  generateDataFlows,
} from "../src/ai/generate-sections.js";

let tempDir;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-library-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

async function write(rel, content = "") {
  const file = path.join(tempDir, rel);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content);
  return rel;
}

const libraryPackage = {
  name: "exif-lib",
  description: "Library that parses Exif metadata in images.",
  main: "dist/exif-lib.js",
  module: "src/exif-lib.js",
  exports: { ".": { module: "./src/exif-lib.js", import: "./dist/exif-lib.js" } },
  bin: { "exif-lib": "bin/cli.js" },
  optionalDependencies: { "@xmldom/xmldom": "^0.8.0" },
  devDependencies: { typescript: "^5.0.0", chai: "^4.0.0", webpack: "^5.0.0" },
};

async function writeLibraryRepo() {
  await write("package.json", JSON.stringify(libraryPackage));
  await write("src/exif-lib.js", `import utils from "./utils.js";\nimport tags from "./tags.js";\nimport "@xmldom/xmldom";\nexport default { utils, tags };\n`);
  await write("src/utils.js", `export default {};\n`);
  await write("src/tags.js", `import utils from "./utils.js";\nexport default { utils };\n`);
  await write("src/tag-filter.js", `import utils from "./utils.js";\nexport default {};\n`);
  await write("src/dom-parser.js", `export default {};\n`);
  await write("src/constants.js", `export default {};\n`);
  await write("exif-lib.d.ts", `export function load(): void;\n`);
  await write("test/types/types.ts", `import { load } from "../../exif-lib";\nload();\n`);
  await write("test/unit/test-utils.js", `import chai from "chai";\nexport default chai;\n`);
  for (let i = 0; i < 6; i += 1) {
    await write(`test/unit/spec-${i}.js`, `import u from "./test-utils.js";\nimport lib from "../../src/exif-lib.js";\nu; lib;\n`);
  }
  await write("bin/cli.js", `import b from "./build.js";\nimport p from "./build-pages.js";\nb; p;\n`);
  await write("bin/build.js", `import webpack from "webpack";\nwebpack;\n`);
  await write("bin/build-pages.js", `export default {};\n`);
  await write("examples/page.js", `document.querySelector('.x').innerHTML = '';\n`);
}

const libraryConfig = () => ({
  __repoRoot: tempDir,
  module_roots: ["src", "bin", "test", "examples"],
  scan: { include: ["**/*.{js,ts}"], ignore: ["**/node_modules/**", "**/dist/**"] },
  project: { name: "exif-lib" },
});

describe("1. a flat src/ is one module", () => {
  it("groups files directly under a module root into the root", async () => {
    await writeLibraryRepo();
    const scan = await scanRepo(libraryConfig());
    const keys = scan.modules.map((m) => m.key);
    expect(keys).toContain("src");
    expect(keys).toContain("bin");
    expect(keys.some((key) => /^src\/.+\.js$/.test(key))).toBe(false);
    expect(keys.some((key) => /^bin\/.+\.js$/.test(key))).toBe(false);
    expect(scan.modules.find((m) => m.key === "src").fileCount).toBe(6);
  });

  it("keeps sub-directories as their own modules", async () => {
    await write("lib/index.js", "export {};\n");
    await write("lib/ogg/parse.js", "export {};\n");
    await write("lib/ogg/more.js", "export {};\n");
    const scan = await scanRepo({ ...libraryConfig(), module_roots: ["lib"] });
    const keys = scan.modules.map((m) => m.key).sort();
    expect(keys).toEqual(["lib", "lib/ogg"]);
  });

  it("counts distinct modules for fan-in and fan-out, not file edges", async () => {
    await writeLibraryRepo();
    const config = libraryConfig();
    const scan = await scanRepo(config);
    const graph = await analyzeDependencyGraph(scan._files, tempDir);
    const metrics = computeModuleLevelMetrics(graph, scan.modules);
    // test/unit has 7 files importing test-utils and src: two other modules, not nine edges.
    expect(metrics.get("test/unit").fanOut).toBe(1);
    expect(metrics.get("src").fanIn).toBeGreaterThanOrEqual(1);
  });
});

describe("2-3. package metadata decides library or CLI", () => {
  it("calls a package with a library entry and a build helper bin a library", async () => {
    await writeLibraryRepo();
    const scan = await scanRepo(libraryConfig());
    expect(scan.metadata.projectKind).toBe("library");
    expect(scan.metadata.packageEntryFiles).toContain("src/exif-lib.js");
  });

  it("calls a package with only a bin a CLI", async () => {
    await write("package.json", JSON.stringify({ name: "tool", bin: { tool: "bin/tool.js" } }));
    await write("bin/tool.js", "console.log(1);\n");
    const scan = await scanRepo({ ...libraryConfig(), module_roots: ["bin"] });
    expect(scan.metadata.projectKind).toBe("cli");
  });

  it("keeps a package that calls itself a CLI a CLI", async () => {
    await write("package.json", JSON.stringify({ name: "tool", description: "A command-line tool", main: "src/index.js", bin: { tool: "bin/tool.js" }, keywords: ["cli"] }));
    await write("src/index.js", "export {};\n");
    await write("bin/tool.js", "console.log(1);\n");
    const scan = await scanRepo({ ...libraryConfig(), module_roots: ["src", "bin"] });
    expect(scan.metadata.projectKind).toBe("cli");
  });

  it("does not describe a library as a command-line tool or add a CLI pattern", async () => {
    await writeLibraryRepo();
    const scan = await scanRepo(libraryConfig());
    const graph = await analyzeDependencyGraph(scan._files, tempDir);
    const context = buildAIContext(scan, { project: { name: "exif-lib" } }, graph);
    expect(context.project.kind).toBe("library");
    expect(isCliProject(context)).toBe(false);
    expect(context.patterns.some((p) => p.startsWith("CLI tool"))).toBe(false);
    const summary = await generateExecutiveSummary(context, { depGraph: graph, flows: [] }, {});
    expect(summary).toMatch(/is an? [\w-]+ library/);
    expect(summary).not.toMatch(/command-line/i);
    expect(summary).not.toContain("As a CLI tool");
  });

  it("keeps the old pattern-based CLI detection when package metadata says nothing", () => {
    const context = { project: {}, patterns: ["CLI tool architecture — `bin`"] };
    expect(isCliProject(context)).toBe(true);
  });

  it("does not name a primary pattern after a file such as bin/analyze.js", () => {
    const context = buildAIContext(
      { filesCount: 3, modules: [{ key: "bin", fileCount: 3 }, { key: "src", fileCount: 9 }], api: [], pages: [], metadata: { projectKind: "library", frameworks: [], languages: new Set(["JavaScript"]), buildTools: [], testFrameworks: [] } },
      { project: { name: "x" } },
    );
    expect(context.patterns.join("\n")).not.toMatch(/analyze\.js|cli\.js/);
  });
});

describe("4. pattern descriptions come from the pattern, not its evidence", () => {
  it("describes an acyclic graph without the CLI blurb even when a path says cli", async () => {
    const context = {
      project: { name: "x", kind: "library", modulesDetected: 2, filesScanned: 4, pagesDetected: 0, apiRoutesDetected: 0 },
      patterns: ["Acyclic dependency graph — clean layering", "Shared utility layer — `bin/cli.js`, `src/utils`", "Analysis pipeline — `bin/analyze.js`"],
      domains: [{ name: "Core Source", description: "d", moduleCount: 1, fileCount: 4, topModules: ["src"] }],
      topModules: [{ key: "src", type: "source", fileCount: 4 }],
      techStack: { frameworks: [], languages: ["JavaScript"], buildTools: [], testFrameworks: [] },
      routes: { pages: [], apis: [] },
      findings: [],
    };
    const overview = await generateArchitectureOverview(context, { depGraph: { stats: { cycles: 0 } } }, {});
    expect(overview).not.toContain("terminal commands");
    expect(overview).not.toContain("A structured approach to organizing code");
    expect(overview).toContain("No circular imports were found");
    expect(overview).toContain("Common helpers sit in shared modules");
    expect(overview).toContain("Analyzer or detector modules inspect input");
    expect(overview).toContain("follows a **Acyclic dependency graph** architecture");
  });
});

describe("5. build scripts are not route modules", () => {
  it("types bin/build-pages.js as cli or other, never route", () => {
    const context = buildModuleContext([{ key: "bin/build-pages.js", fileCount: 1 }, { key: "src/pages", fileCount: 3 }], { project: { name: "x" } });
    expect(context.find((m) => m.key === "bin/build-pages.js").type).not.toBe("route");
    expect(context.find((m) => m.key === "src/pages").type).toBe("route");
  });
});

describe("6. TypeScript only when the source is TypeScript", () => {
  it("ignores .d.ts files, type tests, and a typescript devDependency", async () => {
    await writeLibraryRepo();
    const scan = await scanRepo(libraryConfig());
    expect([...scan.metadata.languages]).not.toContain("TypeScript");
    expect([...scan.metadata.languages]).toContain("JavaScript");
  });

  it("still detects real TypeScript source", async () => {
    await write("package.json", JSON.stringify({ name: "ts-lib", main: "dist/index.js" }));
    await write("src/index.ts", "export const a = 1;\n");
    const scan = await scanRepo({ ...libraryConfig(), module_roots: ["src"] });
    expect([...scan.metadata.languages]).toContain("TypeScript");
  });
});

describe("7. domain keywords are not substrings of file names", () => {
  it("does not send tag-filter, dom-parser, or constants to search, analysis, or configuration", () => {
    expect(inferDomain("src/tag-filter.js").domain).not.toBe("Search & Discovery");
    expect(inferDomain("src/tag-filter-config.js").domain).toBe("Configuration");
    expect(inferDomain("src/dom-parser.js").domain).not.toBe("Analysis & Detection");
    expect(inferDomain("src/constants.js").domain).not.toBe("Configuration");
  });

  it("still finds a real search or analysis folder", () => {
    expect(inferDomain("src/search/index.js").domain).toBe("Search & Discovery");
    expect(inferDomain("src/analyzers").domain).toBe("Analysis & Detection");
  });
});

describe("8. hubs describe the product, not its tests", () => {
  it("excludes test helpers and counts only product importers", async () => {
    await write("package.json", JSON.stringify({ name: "x" }));
    await write("src/core.js", "export default 1;\n");
    for (let i = 0; i < 6; i += 1) await write(`src/m${i}.js`, `import c from "./core.js";\nexport default c;\n`);
    await write("test/helper.js", "export default 1;\n");
    for (let i = 0; i < 20; i += 1) await write(`test/t${i}.js`, `import h from "./helper.js";\nimport c from "../src/core.js";\nh; c;\n`);
    const files = ["src/core.js", ...Array.from({ length: 6 }, (_, i) => `src/m${i}.js`), "test/helper.js", ...Array.from({ length: 20 }, (_, i) => `test/t${i}.js`)];
    const graph = await analyzeDependencyGraph(files, tempDir);
    expect(graph.stats.hubs.map((h) => h.key)).toEqual(["src/core"]);
    expect(graph.stats.hubs[0].importedBy).toBe(6);
    expect(graph.stats.sourceFiles).toBe(7);
  });

  it("does not call a test helper a coupling hotspot", async () => {
    const stats = { totalFiles: 100, sourceFiles: 40, totalEdges: 50, externalDeps: 2, cycles: 0, orphanFiles: 0, hubs: [{ key: "src/utils", importedBy: 6 }] };
    const context = { project: { name: "x", modulesDetected: 1, filesScanned: 100, pagesDetected: 0, apiRoutesDetected: 0 }, patterns: [], domains: [], topModules: [], techStack: { frameworks: [], languages: ["JavaScript"], buildTools: [], testFrameworks: [] } };
    const summary = await generateExecutiveSummary(context, { depGraph: { stats }, flows: [] }, {});
    expect(summary).toContain("Healthy coupling");
    expect(summary).not.toContain("Coupling hotspot");
  });

  it("classifies test, tooling, and build paths", () => {
    expect(isTestPath("test/unit/test-utils")).toBe(true);
    expect(isTestPath("src/a.spec.js")).toBe(true);
    expect(isTestPath("src/test")).toBe(true);
    expect(isTestPath("src/utils.js")).toBe(false);
    expect(isToolingPath("examples/utils.js")).toBe(true);
    expect(isBuildOrExamplePath("bin/build.js")).toBe(true);
    expect(isBuildOrExamplePath("src/core.js")).toBe(false);
  });
});

describe("9. runtime and development packages are separate", () => {
  it("splits external packages by package.json and where they are imported", async () => {
    await writeLibraryRepo();
    const scan = await scanRepo(libraryConfig());
    const graph = await analyzeDependencyGraph(scan._files, tempDir);
    expect(graph.externalRuntime).toEqual(["@xmldom/xmldom"]);
    expect(graph.externalDev).toEqual(["chai", "webpack"]);
    expect(graph.stats.externalRuntime).toBe(1);
    expect(graph.stats.externalDev).toBe(2);
    const rendered = renderDependencyGraph(graph);
    expect(rendered).toContain("3 (1 runtime, 2 dev/test tooling)");
    expect(rendered).toContain("### Runtime (1)");
    expect(rendered).toContain("### Development and test tooling (2)");
  });

  it("treats an undeclared package imported by product code as runtime", async () => {
    await write("package.json", JSON.stringify({ name: "x" }));
    await write("src/a.js", `import "left-pad";\n`);
    await write("test/a.js", `import "chai";\n`);
    const graph = await analyzeDependencyGraph(["src/a.js", "test/a.js"], tempDir);
    expect(graph.externalRuntime).toEqual(["left-pad"]);
    expect(graph.externalDev).toEqual(["chai"]);
  });

  it("counts everything as runtime without a package.json", async () => {
    await write("a.py", "import requests\n");
    const graph = await analyzeDependencyGraph(["a.py"], tempDir);
    expect(graph.externalRuntime).toEqual(["requests"]);
    expect(graph.externalDev).toEqual([]);
  });
});

describe("10. security findings are not inflated", () => {
  it("recognizes fixed-string innerHTML assignments", () => {
    expect(isStaticHtmlAssignment(" '';\n")).toBe(true);
    expect(isStaticHtmlAssignment(' "";')).toBe(true);
    expect(isStaticHtmlAssignment(" ``;")).toBe(true);
    expect(isStaticHtmlAssignment(" '<b>ok</b>';")).toBe(true);
    expect(isStaticHtmlAssignment(" `<b>ok</b>`;")).toBe(true);
    expect(isStaticHtmlAssignment(" `<b>${name}</b>`;")).toBe(false);
    expect(isStaticHtmlAssignment(" '<b>' + name;")).toBe(false);
    expect(isStaticHtmlAssignment(" userInput;")).toBe(false);
  });

  it("does not flag clearing an element but flags interpolated markup in product code", async () => {
    await write("src/view.js", "el.innerHTML = '';\nel.innerHTML = `<b>${name}</b>`;\n");
    const result = await analyzeSecurityPatterns(["src/view.js"], tempDir);
    const xss = result.findings.filter((f) => f.id === "innerhtml-assignment");
    expect(xss).toHaveLength(1);
    expect(xss[0].line).toBe(2);
    expect(xss[0].severity).toBe("high");
  });

  it("lists examples and build scripts as low severity", async () => {
    await write("examples/page.js", "el.innerHTML = `<b>${name}</b>`;\n");
    await write("bin/build.js", "execSync(`npx webpack ${target}`);\n");
    await write("src/run.js", "execSync(`ls ${dir}`);\n");
    const result = await analyzeSecurityPatterns(["examples/page.js", "bin/build.js", "src/run.js"], tempDir);
    const byFile = Object.fromEntries(result.findings.map((f) => [f.file, f]));
    expect(byFile["examples/page.js"].severity).toBe("low");
    expect(byFile["examples/page.js"].name).toContain("build/example code");
    expect(byFile["bin/build.js"].severity).toBe("low");
    expect(byFile["src/run.js"].severity).toBe("high");
    expect(result.bySeverity).toEqual({ high: 1, medium: 0, low: 2 });
  });

  it("keeps hardcoded credentials in examples at their own severity", async () => {
    await write("examples/a.js", `const password = "supersecret123";\n`);
    const result = await analyzeSecurityPatterns(["examples/a.js"], tempDir);
    expect(result.findings[0].severity).toBe("high");
  });
});

describe("11. health agrees with the orphan warning", () => {
  const context = { project: { name: "x", modulesDetected: 1, filesScanned: 100, pagesDetected: 0, apiRoutesDetected: 0 }, patterns: [], domains: [], topModules: [], techStack: { frameworks: [], languages: ["JavaScript"], buildTools: [], testFrameworks: ["Mocha"] } };
  const stats = (orphans) => ({ totalFiles: 100, sourceFiles: 60, totalEdges: 80, externalDeps: 2, cycles: 0, orphanFiles: orphans, hubs: [] });

  it("warns and lowers health when orphans are 9% of files", async () => {
    const summary = await generateExecutiveSummary(context, { depGraph: { stats: stats(9) }, flows: [] }, {});
    expect(summary).toContain("⚠️ 9 unused (9%)");
    expect(summary).toContain("Overall Health: 🟢 95/100");
    expect(summary).toContain("Potential dead code");
  });

  it("shows 100/100 without a warning when orphans are 3%", async () => {
    const summary = await generateExecutiveSummary(context, { depGraph: { stats: stats(3) }, flows: [] }, {});
    expect(summary).toContain("Overall Health: 🟢 100/100");
    expect(summary).toContain("✅ 3 (3%), within normal range");
    expect(summary).not.toContain("Potential dead code");
  });

  it("does not hide cycle penalties behind a bonus", async () => {
    const summary = await generateExecutiveSummary(context, { depGraph: { stats: { ...stats(0), cycles: 1 } }, flows: [] }, {});
    expect(summary).toContain("Overall Health: 🟢 90/100");
  });
});

describe("12. empty GraphQL and route pages are skipped", () => {
  const plan = (key) => ({ key });

  it("skips graphql_schema without a schema and route_map without routes", () => {
    const ctx = { config: {}, scanResult: { pages: [], api: [] }, graphqlResult: { detected: false } };
    expect(emptyDocumentReason(plan("graphql_schema"), ctx)).toMatch(/GraphQL/);
    expect(emptyDocumentReason(plan("route_map"), ctx)).toMatch(/routes/);
    expect(emptyDocumentReason(plan("module_catalog"), ctx)).toBeNull();
  });

  it("keeps them when something was found or the config asks for them", () => {
    expect(emptyDocumentReason(plan("graphql_schema"), { config: {}, scanResult: {}, graphqlResult: { detected: true } })).toBeNull();
    expect(emptyDocumentReason(plan("route_map"), { config: {}, scanResult: { pages: [{}] }, graphqlResult: {} })).toBeNull();
    expect(emptyDocumentReason(plan("route_map"), { config: {}, scanResult: { api: [{}] }, graphqlResult: {} })).toBeNull();
    const explicit = { documentation: { sections: ["route_map", "graphql_schema"] } };
    expect(emptyDocumentReason(plan("route_map"), { config: explicit, scanResult: {}, graphqlResult: {} })).toBeNull();
    expect(emptyDocumentReason(plan("graphql_schema"), { config: explicit, scanResult: {}, graphqlResult: {} })).toBeNull();
  });
});

describe("13. lib/* folders are not one shared-utilities domain", () => {
  it("types folders by their own name and not by the lib container", () => {
    expect(stripContainerSegments("lib/ogg")).toBe("ogg");
    expect(stripContainerSegments("lib")).toBe("");
    expect(inferDomain("lib/ogg").domain).toBe("Core Source");
    expect(inferDomain("lib").domain).toBe("Core Source");
    expect(inferDomain("lib/common").domain).toBe("Shared Utilities");
    expect(inferDomain("lib/search").domain).toBe("Search & Discovery");
    expect(inferDomain("examples").domain).toBe("Other");
  });

  it("does not make every lib folder a shared library layer", () => {
    const modules = buildModuleContext([{ key: "lib", fileCount: 5 }, { key: "lib/ogg", fileCount: 4 }, { key: "lib/common", fileCount: 3 }], { project: { name: "x" } });
    const type = (key) => modules.find((m) => m.key === key).type;
    expect(type("lib")).toBe("source");
    expect(type("lib/ogg")).toBe("source");
    expect(type("lib/common")).toBe("library");
  });

  it("does not infer a shared utility pattern from the lib folder name alone", () => {
    const context = buildAIContext(
      { filesCount: 9, modules: [{ key: "lib", fileCount: 5 }, { key: "lib/ogg", fileCount: 4 }], api: [], pages: [], metadata: { frameworks: [], languages: new Set(["TypeScript"]), buildTools: [], testFrameworks: [] } },
      { project: { name: "x" } },
    );
    expect(context.patterns.join("\n")).not.toContain("Shared utility layer");
  });
});

describe("14. no noisy hub flows", () => {
  const node = (key, imports, importedBy) => ({ key, file: `${key}.js`, imports, importedBy });
  const importers = Array.from({ length: 8 }, (_, i) => `lib/m${i}`);
  const graph = {
    nodes: [
      node("lib", ["lib/core"], importers),
      node("lib/core", [], ["lib"]),
      node("lib/ParseError", [], importers),
      node("lib/router", ["lib/core"], importers),
      node("test/helper", ["lib/core"], Array.from({ length: 30 }, (_, i) => `test/t${i}`)),
      ...importers.map((key) => node(key, ["lib/router"], [])),
    ],
    edges: [],
    cycles: [],
    stats: { totalFiles: 20, totalEdges: 30, externalDeps: 0, cycles: 0, orphanFiles: 0, hubs: [] },
  };
  const context = { project: { name: "x", modulesDetected: 3, filesScanned: 20, pagesDetected: 0, apiRoutesDetected: 0 }, patterns: [], domains: [], topModules: [], techStack: { frameworks: [], languages: ["JavaScript"], buildTools: [], testFrameworks: [] } };

  it("skips a barrel hub, a leaf helper hub, and a test helper hub", async () => {
    const out = await generateDataFlows([], context, { depGraph: graph, scanResult: { modules: [], pages: [], api: [] } }, {});
    expect(out).not.toContain("lib Integration Flow");
    expect(out).not.toContain("ParseError Integration Flow");
    expect(out).not.toContain("helper Integration Flow");
    expect(out).toContain("router Integration Flow");
  });

  it("starts library flows at the package entry and skips build configs and bin/ helpers", () => {
    const flowGraph = {
      nodes: [
        node("src/exif-lib", ["src/utils", "src/tags"], ["test/spec"]),
        node("src/utils", [], ["src/exif-lib", "src/tags"]),
        node("src/tags", ["src/utils"], ["src/exif-lib"]),
        node("webpack.config", ["src/utils", "src/tags"], []),
        node("bin/cli", ["bin/build", "src/utils"], []),
        node("bin/build", ["src/utils"], ["bin/cli"]),
        node("test/spec", ["src/exif-lib", "src/utils"], []),
      ],
      edges: [],
      cycles: [],
      stats: { totalFiles: 7 },
    };
    const flows = inferDataFlows({ modules: [], pages: [], api: [], metadata: { projectKind: "library", packageEntryFiles: ["src/exif-lib.js"] } }, {}, flowGraph);
    expect(flows.map((f) => f.name)).toEqual(["exif-lib Library Flow"]);
  });
});
