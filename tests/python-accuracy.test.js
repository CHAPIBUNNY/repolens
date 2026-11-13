import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { analyzeDependencyGraph } from "../src/analyzers/dependency-graph.js";
import { extractPythonImports, indexPythonModules, resolvePythonImport } from "../src/analyzers/import-parsers.js";
import { renderDependencyGraph } from "../src/renderers/renderAnalysis.js";
import { describeOnboardingModule } from "../src/ai/generate-sections.js";

let tempDir;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-py-acc-"));
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

describe("extractPythonImports: deferred and TYPE_CHECKING", () => {
  it("marks function-local imports as deferred and TYPE_CHECKING imports as typeOnly", () => {
    const source = `
from pkg import runtime

def load():
    from pkg.lazy import Helper

async def more():
    import pkg.also_lazy

class C:
    from pkg import class_level

    def method(self):
        from pkg import in_method

if TYPE_CHECKING:
    from pkg import OnlyType

if t.TYPE_CHECKING:
    from pkg import AliasType
`;
    const imports = extractPythonImports(source);
    const byName = (module, name) => imports.filter((item) => item.module === module && item.name === name);
    expect(byName("pkg", "runtime")[0]).toMatchObject({ typeOnly: false, deferred: false });
    expect(imports.find((item) => item.module === "pkg.lazy") || byName("pkg.lazy", "Helper")[0] || imports.find((item) => item.module === "pkg.lazy" || (item.module === "pkg" && item.name === "lazy"))).toBeTruthy();
    const lazy = imports.find((item) => item.module === "pkg.lazy" || (item.module === "pkg" && item.name === "lazy") || item.name === "Helper");
    expect(lazy.deferred).toBe(true);
    expect(lazy.typeOnly).toBe(false);
    const also = imports.find((item) => item.module === "pkg.also_lazy");
    expect(also).toMatchObject({ typeOnly: false, deferred: true });
    const classLevel = byName("pkg", "class_level")[0];
    expect(classLevel).toMatchObject({ typeOnly: false, deferred: false });
    const method = byName("pkg", "in_method")[0];
    expect(method).toMatchObject({ typeOnly: false, deferred: true });
    const onlyType = byName("pkg", "OnlyType")[0];
    expect(onlyType).toMatchObject({ typeOnly: true, deferred: false });
  });

  it("handles one-line TYPE_CHECKING and one-line deferred imports", () => {
    const source = `
if TYPE_CHECKING: from pkg import Hint
def load(): from pkg import Late
`;
    const imports = extractPythonImports(source);
    expect(imports.find((item) => item.name === "Hint")).toMatchObject({ typeOnly: true, deferred: false });
    expect(imports.find((item) => item.name === "Late")).toMatchObject({ typeOnly: false, deferred: true });
  });
});

describe("from pkg import submodule resolution", () => {
  it("resolves from pkg import submodule to the submodule file, not __init__.py", () => {
    const files = [
      "litestar/__init__.py",
      "litestar/connection.py",
      "litestar/datastructures/__init__.py",
      "litestar/exceptions.py",
    ];
    const index = indexPythonModules(files);
    const resolved = resolvePythonImport(
      "litestar/typing.py",
      { module: "litestar", name: "connection", level: 0 },
      index,
    );
    expect(resolved).toEqual({ kind: "internal", file: "litestar/connection.py" });
    const pkg = resolvePythonImport(
      "litestar/typing.py",
      { module: "litestar", name: "datastructures", level: 0 },
      index,
    );
    expect(pkg).toEqual({ kind: "internal", file: "litestar/datastructures/__init__.py" });
    const fallback = resolvePythonImport(
      "litestar/typing.py",
      { module: "litestar", name: "HTTPException", level: 0 },
      index,
    );
    expect(fallback).toEqual({ kind: "internal", file: "litestar/__init__.py" });
  });

  it("does not route a submodule import through __init__.py in the graph", async () => {
    await write("litestar/__init__.py", "from litestar.app import Litestar\n");
    await write("litestar/app.py", "from litestar import connection, datastructures\n");
    await write("litestar/connection.py", "VALUE = 1\n");
    await write("litestar/datastructures/__init__.py", "VALUE = 2\n");
    const files = [
      "litestar/__init__.py",
      "litestar/app.py",
      "litestar/connection.py",
      "litestar/datastructures/__init__.py",
    ];
    const result = await analyzeDependencyGraph(files, tempDir);
    const edges = result.edges.map((edge) => `${edge.from}->${edge.to}`).sort();
    expect(edges).toContain("litestar/__init__.py->litestar/app.py");
    expect(edges).toContain("litestar/app.py->litestar/connection.py");
    expect(edges).toContain("litestar/app.py->litestar/datastructures/__init__.py");
    expect(edges).not.toContain("litestar/app.py->litestar/__init__.py");
    expect(result.cycles).toEqual([]);
  });
});

describe("deferred and TYPE_CHECKING cycles", () => {
  it("classifies a function-local cycle as deferred, not High refactor", async () => {
    // typing.py imports di only inside a function; di imports typing at module level.
    await write("pkg/__init__.py", "");
    await write("pkg/typing.py", "def get_dep():\n    from pkg.di import Dependency\n    return Dependency\n");
    await write("pkg/di.py", "from pkg import typing\n");
    const result = await analyzeDependencyGraph([
      "pkg/__init__.py",
      "pkg/typing.py",
      "pkg/di.py",
    ], tempDir);
    expect(result.edges).toEqual([{ from: "pkg/di.py", to: "pkg/typing.py" }]);
    expect(result.cycles).toEqual([]);
    expect(result.stats.cycles).toBe(0);
    expect(result.deferredEdges).toEqual([
      { from: "pkg/typing.py", to: "pkg/di.py", reason: "deferred" },
    ]);
    expect(result.deferredReports.length).toBe(1);
    expect(result.deferredReports[0].kind).toBe("deferred");
    expect(result.deferredReports[0].priority).toBe("low");
    expect(result.deferredReports[0].priorityLine).toBe("Priority: Low — deferred imports; verify");
    expect(result.stats.deferredCycles).toBe(1);
    expect(result.summary).toMatch(/deferred cycle\(s\), not load-time/);

    const doc = renderDependencyGraph(result);
    expect(doc).toContain("## Deferred import cycles");
    expect(doc).toContain("Priority: Low — deferred imports; verify");
    expect(doc).toContain("Deferred import cycles (not load-time, not counted)");
    expect(doc).not.toContain("Priority: High refactor");
  });

  it("lists TYPE_CHECKING cycles as type-only, not runtime", async () => {
    await write("pkg/__init__.py", "");
    await write("pkg/a.py", "from typing import TYPE_CHECKING\nfrom pkg import b\nif TYPE_CHECKING:\n    from pkg import c\n");
    await write("pkg/b.py", "VALUE = 1\n");
    await write("pkg/c.py", "from pkg import a\n");
    const result = await analyzeDependencyGraph([
      "pkg/__init__.py",
      "pkg/a.py",
      "pkg/b.py",
      "pkg/c.py",
    ], tempDir);
    const edges = result.edges.map((edge) => `${edge.from}->${edge.to}`);
    expect(edges).toContain("pkg/a.py->pkg/b.py");
    expect(edges).toContain("pkg/c.py->pkg/a.py");
    expect(edges).not.toContain("pkg/a.py->pkg/c.py");
    expect(result.cycles).toEqual([]);
    expect(result.typeOnlyEdges).toEqual([
      { from: "pkg/a.py", to: "pkg/c.py", reason: "syntax" },
    ]);
    expect(result.typeOnlyReports.length).toBe(1);
    expect(result.typeOnlyReports[0].kind).toBe("type-only");
    expect(result.typeOnlyReports[0].priorityLine).toBe("Priority: Low — type-only imports; verify");
    expect(result.stats.typeOnlyCycles).toBe(1);

    const doc = renderDependencyGraph(result);
    expect(doc).toContain("## Type-only cycles");
    expect(doc).toContain("if TYPE_CHECKING:");
  });

  it("keeps a module-level import as a runtime edge even when a deferred import exists the other way", async () => {
    await write("pkg/__init__.py", "");
    await write("pkg/a.py", "from pkg import b\n");
    await write("pkg/b.py", "def load():\n    from pkg import a\n");
    const result = await analyzeDependencyGraph(["pkg/__init__.py", "pkg/a.py", "pkg/b.py"], tempDir);
    expect(result.edges).toEqual([{ from: "pkg/a.py", to: "pkg/b.py" }]);
    expect(result.cycles).toEqual([]);
    expect(result.deferredReports.length).toBe(1);
  });
});

describe("data-flow module roles", () => {
  it("does not label product modules under a package whose name contains 'test' as Test infrastructure", () => {
    expect(describeOnboardingModule("litestar/exceptions/__init__.py")).toBe("Exceptions module");
    expect(describeOnboardingModule("litestar/enums.py")).toBe("Enums module");
    expect(describeOnboardingModule("litestar/types/__init__.py")).toBe("Types module");
    expect(describeOnboardingModule("litestar/status_codes.py")).toBe("Status codes module");
    expect(describeOnboardingModule("litestar/middleware/session/client_side.py")).toBe("Request/response middleware");
  });

  it("still labels real test paths as Test infrastructure", () => {
    expect(describeOnboardingModule("tests/unit/test_app.py")).toBe("Test infrastructure");
    expect(describeOnboardingModule("litestar/testing/client/async_client.py")).toBe("Test infrastructure");
    expect(describeOnboardingModule("src/utils/helpers.spec.ts")).toBe("Test infrastructure");
  });

  it("does not treat inspect or latest as test or spec", () => {
    expect(describeOnboardingModule("src/inspect.py")).toBe("Inspect module");
    expect(describeOnboardingModule("pkg/latest.py")).toBe("Latest module");
  });
});
