// Gap review 2026-11-24 (catch-up for the missed 23 Nov review).
// Confirmed on zk-org/zk 20fc540, charmbracelet/bubbletea 585149e,
// reduxjs/redux ce8d836, and pallets/click 08b803c with 1.17.3.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

vi.mock("../src/ai/provider.js", () => ({
  generateText: vi.fn().mockResolvedValue({ success: false }),
  isAIEnabled: vi.fn().mockReturnValue(false),
}));

import { scanRepo } from "../src/core/scan.js";
import { analyzeDependencyGraph } from "../src/analyzers/dependency-graph.js";
import { buildAIContext, isCliProject } from "../src/analyzers/context-builder.js";
import { inferDataFlows } from "../src/analyzers/flow-inference.js";
import { externalPackageName } from "../src/analyzers/import-parsers.js";
import { generateDeveloperOnboarding, generateSystemOverview } from "../src/ai/generate-sections.js";
import { renderModuleCatalog, renderRouteMap } from "../src/renderers/render.js";
import { groupModulesByDomain } from "../src/analyzers/domain-inference.js";

let tempDir;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-1124-"));
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
    module_roots: [],
    scan: { include: ["**/*.{go,py,js,jsx,ts,tsx}"], ignore: [], ...extra },
    outputs: { pages: [{ key: "system_overview", title: "System Overview" }] },
  };
}

describe("Go packages, not file expansions", () => {
  it("does not expand one import into the files of the package", async () => {
    await write("go.mod", "module example.com/tea\n\ngo 1.22\n");
    await write("clipboard.go", "package tea\nfunc Paste() {}\n");
    await write("keycode.go", "package tea\nfunc Key() {}\n");
    await write("tea.go", "package tea\nfunc New() {}\n");
    await write("cursor/cursor.go", "package cursor\nfunc Cursor() {}\n");
    await write("cursor/style.go", "package cursor\nfunc Style() {}\n");
    await write("tutorials/basics/main.go", `package main\n\nimport (\n\t"example.com/tea"\n\t"example.com/tea/cursor"\n)\n\nfunc main() { tea.New(); cursor.Cursor() }\n`);

    const files = [
      "clipboard.go", "keycode.go", "tea.go",
      "cursor/cursor.go", "cursor/style.go",
      "tutorials/basics/main.go",
    ];
    const graph = await analyzeDependencyGraph(files, tempDir);
    const edges = graph.edges.map((edge) => `${edge.from}->${edge.to}`);
    expect(edges).not.toEqual(expect.arrayContaining([expect.stringContaining("clipboard.go")]));
    expect(edges.some((edge) => edge.includes("clipboard") || edge.includes("keycode") || edge.includes("style.go"))).toBe(false);
    expect(edges.sort()).toEqual(["tutorials/basics->.", "tutorials/basics->cursor"].sort());
    expect(graph.stats.totalEdges).toBe(2);
    expect(graph.stats.goPackageEdges).toBe(2);

    const main = graph.nodes.find((node) => node.file === "tutorials/basics/main.go");
    expect(main.imports).toEqual([".", "cursor"]);
    const rootFiles = graph.nodes.filter((node) => ["clipboard.go", "keycode.go", "tea.go"].includes(node.file));
    for (const node of rootFiles) {
      expect(node.imports).toEqual([]);
      expect(node.importedBy).toEqual([]);
    }

    const flows = inferDataFlows({ metadata: { projectKind: "library" }, modules: [] }, {}, graph);
    expect(flows.length).toBeGreaterThan(0);
    const steps = flows.flatMap((flow) => flow.steps).join("\n");
    expect(steps).not.toContain("clipboard.go");
    expect(steps).toContain("imports 2 modules");
    expect(steps).toContain("example.com/tea");
    expect(flows.every((flow) => flow.critical !== true || !String(flow.modules?.[0] || "").includes("tutorials"))).toBe(true);
  });

  it("splits adapter, util, and cli packages instead of lumping them", async () => {
    await write("go.mod", "module example.com/zk\n\ngo 1.22\n");
    await write("cmd/zk/main.go", "package main\nfunc main() {}\n");
    await write("internal/adapter/sqlite/db.go", "package sqlite\n");
    await write("internal/adapter/lsp/server.go", `package lsp\n\nimport "github.com/tliron/glsp"\n`);
    await write("internal/adapter/handlebars/render.go", "package handlebars\n");
    await write("internal/util/text.go", "package util\n");
    await write("internal/util/paths/paths.go", "package paths\n");
    await write("internal/cli/cmd/root.go", "package cmd\n");
    await write("tutorials/commands/demo.go", "package main\nfunc main() {}\n");

    const scan = await scanRepo(scanConfig());
    const keys = scan.modules.map((mod) => mod.key).sort();
    expect(keys).toEqual([
      "cmd/zk",
      "internal/adapter/handlebars",
      "internal/adapter/lsp",
      "internal/adapter/sqlite",
      "internal/cli/cmd",
      "internal/util",
      "internal/util/paths",
    ].sort());
    expect(scan._files.some((file) => file.startsWith("tutorials/"))).toBe(false);
    expect(scan.metadata.projectKind).toBe("cli");
    expect(scan.metadata.goMainFiles).toEqual(["cmd/zk/main.go"]);
    expect(scan.metadata.lsp.evidence.some((item) => item.includes("internal/adapter/lsp"))).toBe(true);

    const context = buildAIContext(scan, { project: { name: "zk" }, module_roots: [] });
    expect(isCliProject(context)).toBe(true);
    expect(context.patterns.some((pattern) => pattern.startsWith("CLI tool architecture") && pattern.includes("tutorials"))).toBe(false);
    expect(context.patterns.some((pattern) => pattern.startsWith("Language server (LSP)"))).toBe(true);
    const overview = await generateSystemOverview(context, {}, {});
    expect(overview).toContain("Command-Line Tool and Language Server (LSP)");

    const onboarding = await generateDeveloperOnboarding(context, { depGraph: null, flows: [] }, {});
    expect(onboarding).toContain("`cmd/zk/main.go`");
    expect(onboarding).not.toContain("main.go` under `cmd/`");
    expect(onboarding).not.toContain("`tutorials");
  });

  it("names a root main.go and does not send a library to cmd/", async () => {
    await write("go.mod", "module example.com/tool\n\ngo 1.22\n");
    await write("main.go", "package main\nfunc main() {}\n");
    const program = await scanRepo(scanConfig());
    expect(program.metadata.goMainFiles).toEqual(["main.go"]);
    expect(program.metadata.projectKind).toBe("cli");
    const programContext = buildAIContext(program, { project: { name: "tool" }, module_roots: [] });
    const programGuide = await generateDeveloperOnboarding(programContext, { flows: [], depGraph: null }, {});
    expect(programGuide).toContain("`main.go`");
    expect(programGuide).toContain("package main");
    expect(programGuide).not.toContain("under `cmd/`");

    await fs.rm(path.join(tempDir, "main.go"));
    await write("tea.go", "package tea\nfunc New() {}\n");
    await write("clipboard.go", "package tea\nfunc Paste() {}\n");
    await write("tutorials/commands/demo.go", "package main\nfunc main() {}\n");
    const library = await scanRepo(scanConfig());
    expect(library.metadata.projectKind).toBe("library");
    expect(library.metadata.goMainFiles).toEqual([]);
    expect(library._files.some((file) => file.includes("tutorials"))).toBe(false);
    const libraryContext = buildAIContext(library, { project: { name: "tea" }, module_roots: [] });
    expect(isCliProject(libraryContext)).toBe(false);
    expect(libraryContext.patterns.some((pattern) => pattern.startsWith("CLI tool"))).toBe(false);
    const guide = await generateDeveloperOnboarding(libraryContext, { flows: [], depGraph: null }, {});
    expect(guide).not.toContain("cmd/");
    expect(guide).toContain("no `package main`");
    const catalog = renderModuleCatalog({ project: { name: "tea" } }, library, {}, null);
    expect(catalog).toContain("Go library package");
    expect(catalog).not.toContain("Repository root files");
    expect(catalog).not.toContain("Leaf module");
  });

  it("scans tutorials again only when include_dev_artifacts is set", async () => {
    await write("go.mod", "module example.com/tea\n\ngo 1.22\n");
    await write("tea.go", "package tea\n");
    await write("tutorials/basics/main.go", "package main\nfunc main() {}\n");
    const off = await scanRepo(scanConfig());
    expect(off.filesCount).toBe(1);
    const on = await scanRepo(scanConfig({ include_dev_artifacts: true }));
    expect(on._files).toContain("tutorials/basics/main.go");
  });
});

describe("docs sites, test rank, and tooling", () => {
  it("does not turn a Docusaurus site into the library's route map or runtime packages", async () => {
    await write("package.json", JSON.stringify({
      name: "redux",
      description: "A library for predictable state",
      main: "src/index.js",
    }));
    await write("src/index.js", "export function createStore() { return {}; }\n");
    await write("website/docusaurus.config.js", "module.exports = { title: 'Redux' };\n");
    await write("website/src/pages/index.js", "import Layout from '@theme/Layout';\nimport Link from '@docusaurus/Link';\nexport default function Home() { return null; }\n");
    await write("website/src/pages/react-redux.js", "import Nav from '@theme-original/Navbar';\nimport Box from '@site/src/components/Box';\nexport default function Page() { return null; }\n");
    for (let i = 0; i < 6; i += 1) {
      await write(`website/src/extra/page${i}.js`, "export const n = 1;\n");
    }

    expect(externalPackageName("@theme/Layout")).toBeNull();
    expect(externalPackageName("@theme-original/Navbar")).toBeNull();
    expect(externalPackageName("@site/src/components/Box")).toBeNull();
    expect(externalPackageName("@docusaurus/Link")).toBeNull();

    const scan = await scanRepo(scanConfig());
    expect(scan.metadata.projectKind).toBe("library");
    expect(scan.pages).toEqual([]);
    const graph = await analyzeDependencyGraph(scan._files, tempDir);
    for (const name of ["@theme/Layout", "@theme-original/Navbar", "@site/src", "@docusaurus/Link"]) {
      expect(graph.externalDeps).not.toContain(name);
      expect(graph.externalRuntime).not.toContain(name);
    }
    const context = buildAIContext(scan, { project: { name: "redux" }, module_roots: [] }, graph);
    expect(context.topModules[0].key).toBe("src");
    expect(context.topModules.find((mod) => mod.key === "website")?.docsSite).toBe(true);
    const guide = await generateDeveloperOnboarding(context, { flows: [], depGraph: graph }, {});
    const core = guide.split("## Core Modules to Understand")[1].split("##")[0];
    expect(core).toContain("`src`");
    expect(core.indexOf("`src`")).toBeLessThan(core.includes("`website`") ? core.indexOf("`website`") : core.length);
    expect(core).not.toMatch(/\| ⭐ High \| `website`/);
    const routes = renderRouteMap({ project: { name: "redux" } }, scan, context);
    expect(routes).not.toContain("/react-redux");
    expect(routes).not.toContain("/index");
    expect(routes).toContain("library/package");
  });

  it("does not rank tests above product or list them as shared libraries", async () => {
    await write("src/click/__init__.py", "from .core import Command\nfrom ._compat import text\n");
    await write("src/click/core.py", "class Command: pass\n");
    await write("src/click/_compat.py", "def text():\n    return ''\n");
    for (let i = 0; i < 6; i += 1) {
      await write(`src/click/extra${i}.py`, `from ._compat import text\ntext()\n`);
    }
    await write("tests/test_utils.py", "from click._compat import text\n");
    for (let i = 0; i < 21; i += 1) {
      await write(`tests/test_${i}.py`, "from click._compat import text\n");
    }

    const scan = await scanRepo({
      ...scanConfig(),
      module_roots: ["src"],
      scan: { include: ["**/*.py"], ignore: [] },
    });
    const tests = scan.modules.find((mod) => mod.key === "tests");
    const product = scan.modules.find((mod) => mod.key === "src/click");
    expect(tests.fileCount).toBeGreaterThan(product.fileCount);

    const files = scan._files;
    const graph = await analyzeDependencyGraph(files, tempDir);
    const flows = inferDataFlows(scan, {}, graph);
    const rendered = flows.flatMap((flow) => flow.steps).join("\n");
    expect(rendered).not.toMatch(/used by 1[4-9]|used by [2-9]\d/);
    const initFlow = flows.find((flow) => /__init__/.test(flow.name) || /__init__/.test(flow.modules?.[0] || ""));
    if (initFlow) {
      const { identifyFlowDependencies } = await import("../src/analyzers/flow-inference.js");
      const deps = identifyFlowDependencies(initFlow, scan);
      expect(deps.sharedLibraries.some((name) => name.includes("tests"))).toBe(false);
    }
    const context = buildAIContext(scan, { project: { name: "click" }, module_roots: ["src"] }, graph);
    expect(context.topModules[0].key).toBe("src/click");
    const guide = await generateDeveloperOnboarding(context, { flows, depGraph: graph }, {});
    const core = guide.split("## Core Modules to Understand")[1].split("##")[0];
    expect(core).toContain("`src/click`");
    expect(core).not.toMatch(/\| ⭐ High \| `tests`/);
    expect(core).not.toContain("core functionality");
    const flowDoc = guide.includes("Shared libraries used")
      ? guide.split("Shared libraries used").slice(1).join("\n")
      : "";
    expect(flowDoc).not.toContain("tests/test_utils");
  });

  it("detects Make, Task, and tesh instead of the standard toolchain", async () => {
    await write("go.mod", "module example.com/zk\n\ngo 1.22\n");
    await write("main.go", "package main\nfunc main() {}\n");
    await write("Makefile", "test:\n\tCGO_ENABLED=0 go test -tags fts5 ./...\n");
    await write("Taskfile.yml", "version: '3'\ntasks:\n  test:\n    cmds:\n      - go test ./...\n");
    await write("tests/basic.tesh", "hello\n");
    const scan = await scanRepo(scanConfig());
    expect(scan.metadata.buildTools).toEqual(expect.arrayContaining(["Make (CGO_ENABLED, -tags)", "Task", "tesh"]));
    expect(scan.metadata.testFrameworks).toContain("tesh");
    expect(scan.metadata.setup.test).toEqual(expect.arrayContaining(["go test ./...", "make test", "task test"]));
    const context = buildAIContext(scan, { project: { name: "zk" }, module_roots: [] });
    const guide = await generateDeveloperOnboarding(context, { flows: [], depGraph: null }, {});
    expect(guide).not.toContain("Standard toolchain");
    expect(guide).toContain("Make (CGO_ENABLED, -tags)");
    expect(guide).toContain("tesh");
  });

  it("does not make a Documentation module out of docs/conf.py", async () => {
    await write("src/app.py", "def run():\n    return 1\n");
    await write("docs/conf.py", "project = 'demo'\n");
    const scan = await scanRepo({
      ...scanConfig(),
      scan: { include: ["**/*.py"], ignore: [] },
    });
    expect(scan.modules.map((mod) => mod.key)).toEqual(["src"]);
    const domains = groupModulesByDomain(scan.modules);
    expect(domains.some((domain) => domain.name === "Documentation")).toBe(false);

    await fs.rm(path.join(tempDir, "src"), { recursive: true });
    const onlyDocs = await scanRepo({
      ...scanConfig(),
      scan: { include: ["**/*.py"], ignore: [] },
    });
    expect(onlyDocs.modules.map((mod) => mod.key)).toContain("docs");
  });
});
