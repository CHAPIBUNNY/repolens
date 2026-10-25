import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { analyzeDependencyGraph } from "../src/analyzers/dependency-graph.js";
import { scanRepo } from "../src/core/scan.js";
import { inferDomain, pathHasKeyword } from "../src/analyzers/domain-inference.js";
import { buildAIContext } from "../src/analyzers/context-builder.js";
import { renderModuleCatalog } from "../src/renderers/render.js";
import { renderDependencyGraph } from "../src/renderers/renderAnalysis.js";

let tempDir;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-imports-"));
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

describe("JavaScript and TypeScript import accuracy", () => {
  it("ignores imports inside comments and strings", async () => {
    await write("lib/command.js", `import { Help } from "./help.js";\nexport const Command = {};\n`);
    await write("lib/help.js", `/**\n * @typedef { import("./command.js").Command } Command\n */\nexport const Help = {};\nconst example = "import { Command } from './command.js'";\n`);
    const result = await analyzeDependencyGraph(["lib/command.js", "lib/help.js"], tempDir);
    expect(result.cycles).toEqual([]);
    expect(result.edges).toEqual([{ from: "lib/command", to: "lib/help" }]);
  });

  it("does not treat an import inside a template string as a package", async () => {
    await write("browser.ts", "const script = `\\n\\timport ky from '/distribution/index.js';\\n`;\nexport const n = 1;\n");
    const result = await analyzeDependencyGraph(["browser.ts"], tempDir);
    expect(result.externalDeps).not.toContain("");
    expect(result.externalDeps.filter((name) => !name.trim())).toEqual([]);
    expect(result.edges).toEqual([]);
  });

  it("excludes type-only imports from cycles and edges", async () => {
    await write("source/types/options.ts", `import type { Hooks } from "./hooks.js";\nexport type Options = { hooks?: Hooks };\n`);
    await write("source/types/hooks.ts", `import { type stop } from "../core/constants.js";\nimport type { Options } from "./options.js";\nexport type Hooks = { stop: typeof stop };\n`);
    await write("source/core/constants.ts", `export type { Options } from "../types/options.js";\nexport const stop = Symbol("stop");\n`);
    const result = await analyzeDependencyGraph([
      "source/types/options.ts",
      "source/types/hooks.ts",
      "source/core/constants.ts",
    ], tempDir);
    expect(result.edges).toEqual([]);
    expect(result.cycles).toEqual([]);
  });

  it("keeps a value import when a type specifier is mixed in", async () => {
    await write("a.ts", `import { type Only, value } from "./b.js";\nexport const n = value;\n`);
    await write("b.ts", `export const value = 1;\nexport type Only = string;\n`);
    const result = await analyzeDependencyGraph(["a.ts", "b.ts"], tempDir);
    expect(result.edges).toEqual([{ from: "a", to: "b" }]);
  });

  it("still records real external packages and skips node: built-ins", async () => {
    await write("index.js", `import express from "express";\nimport path from "node:path";\nconst dynamic = import("./lib.js");\n`);
    await write("lib.js", `module.exports = require("./extra.js");\n`);
    await write("extra.js", `exports.n = 1;\n`);
    const result = await analyzeDependencyGraph(["index.js", "lib.js", "extra.js"], tempDir);
    expect(result.externalDeps).toEqual(["express"]);
    expect(result.edges.map((edge) => `${edge.from}->${edge.to}`).sort()).toEqual(["index->lib", "lib->extra"]);
  });

  it("does not list Node.js built-ins as external packages", async () => {
    await write("index.js", `import fs from "fs";\nimport { spawn } from "child_process";\nimport EventEmitter from "events";\nimport path from "node:path";\nimport chalk from "chalk";\n`);
    const result = await analyzeDependencyGraph(["index.js"], tempDir);
    expect(result.externalDeps).toEqual(["chalk"]);
    expect(result.externalDeps).not.toContain("fs");
    expect(result.externalDeps).not.toContain("child_process");
    expect(result.externalDeps).not.toContain("events");
    expect(result.externalDeps).not.toContain("path");
    expect(result.externalDeps).not.toContain("node:path");
  });
});

describe("Python import accuracy", () => {
  it("resolves absolute and relative imports inside the package", async () => {
    await write("httpx/__init__.py", "from ._client import Client\nfrom ._models import Request\n");
    await write("httpx/_client.py", "import certifi\nfrom ._models import Response\nfrom ._transports.base import BaseTransport\n# import os\n");
    await write("httpx/_models.py", "import typing\nfrom ._client import Client\n");
    await write("httpx/_transports/base.py", "from .._models import Request\n");
    const files = [
      "httpx/__init__.py",
      "httpx/_client.py",
      "httpx/_models.py",
      "httpx/_transports/base.py",
    ];
    const result = await analyzeDependencyGraph(files, tempDir);
    const edges = result.edges.map((edge) => `${edge.from}->${edge.to}`).sort();
    expect(edges).toContain("httpx/_client.py->httpx/_models.py");
    expect(edges).toContain("httpx/_client.py->httpx/_transports/base.py");
    expect(edges).toContain("httpx/_models.py->httpx/_client.py");
    expect(edges).toContain("httpx/_transports/base.py->httpx/_models.py");
    expect(edges).toContain("httpx/__init__.py->httpx/_client.py");
    expect(result.stats.totalEdges).toBeGreaterThan(0);
    expect(result.externalDeps).toEqual(["certifi"]);
    expect(result.externalDeps).not.toContain("typing");
    expect(result.externalDeps).not.toContain("os");
  });

  it("resolves a src-layout package such as click", async () => {
    await write("src/click/__init__.py", "from .core import Command\n");
    await write("src/click/core.py", "from .decorators import command\n");
    await write("src/click/decorators.py", "import sys\n");
    const result = await analyzeDependencyGraph([
      "src/click/__init__.py",
      "src/click/core.py",
      "src/click/decorators.py",
    ], tempDir);
    expect(result.edges.map((edge) => edge.to)).toEqual(expect.arrayContaining([
      "src/click/core.py",
      "src/click/decorators.py",
    ]));
    expect(result.externalDeps).not.toContain("sys");
    expect(result.stats.totalEdges).toBeGreaterThan(0);
  });

  it("resolves a nested package and a unique loose test module", async () => {
    await write("examples/complex/complex/__init__.py", "");
    await write("examples/complex/complex/cli.py", "def pass_environment(fn): return fn\n");
    await write("examples/complex/complex/commands/cmd_init.py", "from complex.cli import pass_environment\nimport msvcrt\n");
    await write("tests/test_options.py", "ENV = True\n");
    await write("tests/test_arguments.py", "from test_options import ENV\n");
    const result = await analyzeDependencyGraph([
      "examples/complex/complex/__init__.py",
      "examples/complex/complex/cli.py",
      "examples/complex/complex/commands/cmd_init.py",
      "tests/test_options.py",
      "tests/test_arguments.py",
    ], tempDir);
    const edges = result.edges.map((edge) => `${edge.from}->${edge.to}`);
    expect(edges).toContain("examples/complex/complex/commands/cmd_init.py->examples/complex/complex/cli.py");
    expect(edges).toContain("tests/test_arguments.py->tests/test_options.py");
    expect(result.externalDeps).not.toContain("complex");
    expect(result.externalDeps).not.toContain("test_options");
    expect(result.externalDeps).not.toContain("msvcrt");
  });

  it("resolves a same-directory conftest import when several conftest files exist", async () => {
    await write("tests/conftest.py", "class TestServer: pass\n");
    await write("tests/test_exceptions.py", "from conftest import TestServer\n");
    await write("httpx/conftest.py", "class Other: pass\n");
    const result = await analyzeDependencyGraph([
      "tests/conftest.py",
      "tests/test_exceptions.py",
      "httpx/conftest.py",
    ], tempDir);
    const edges = result.edges.map((edge) => `${edge.from}->${edge.to}`);
    expect(edges).toContain("tests/test_exceptions.py->tests/conftest.py");
    expect(result.externalDeps).not.toContain("conftest");
  });

  it("does not create edges for TYPE_CHECKING imports", async () => {
    await write("src/click/__init__.py", "");
    await write("src/click/core.py", "import typing as t\nfrom .utils import echo\nif t.TYPE_CHECKING:\n    from .shell_completion import CompletionItem\n");
    await write("src/click/utils.py", "from typing import TYPE_CHECKING\nif TYPE_CHECKING:\n    from .core import Context\n");
    await write("src/click/shell_completion.py", "import typing\nif typing.TYPE_CHECKING:\n    from .utils import echo\n");
    const files = [
      "src/click/__init__.py",
      "src/click/core.py",
      "src/click/utils.py",
      "src/click/shell_completion.py",
    ];
    const result = await analyzeDependencyGraph(files, tempDir);
    const edges = result.edges.map((edge) => `${edge.from}->${edge.to}`);
    expect(edges).toContain("src/click/core.py->src/click/utils.py");
    expect(edges).not.toContain("src/click/core.py->src/click/shell_completion.py");
    expect(edges).not.toContain("src/click/utils.py->src/click/core.py");
    expect(edges).not.toContain("src/click/shell_completion.py->src/click/utils.py");
    expect(result.cycles).toEqual([]);
  });

  it("resolves from-import names to sibling modules", async () => {
    await write("pkg/__init__.py", "from .core import Command\n");
    await write("pkg/core.py", "from . import types\n");
    await write("pkg/types.py", "VALUE = 1\n");
    const result = await analyzeDependencyGraph([
      "pkg/__init__.py",
      "pkg/core.py",
      "pkg/types.py",
    ], tempDir);
    const edges = result.edges.map((edge) => `${edge.from}->${edge.to}`);
    expect(edges).toContain("pkg/core.py->pkg/types.py");
    expect(edges).not.toContain("pkg/core.py->pkg/__init__.py");
    expect(result.cycles).toEqual([]);
  });
});

describe("Go import accuracy", () => {
  it("resolves module-relative imports and skips the standard library", async () => {
    await write("go.mod", "module github.com/spf13/cobra\n\ngo 1.22\n");
    await write("command.go", `package cobra\n\nimport (\n\t"fmt"\n\tflag "github.com/spf13/pflag"\n\t"github.com/spf13/cobra/doc"\n)\n`);
    await write("doc/man_docs.go", `package sub\n\nimport "github.com/spf13/cobra"\n`);
    await write("doc/man_docs_test.go", `package sub\n\nimport "github.com/spf13/cobra"\n`);
    const result = await analyzeDependencyGraph([
      "command.go",
      "doc/man_docs.go",
      "doc/man_docs_test.go",
    ], tempDir);
    expect(result.nodes.map((node) => node.file).sort()).toEqual(["command.go", "doc/man_docs.go"]);
    const edges = result.edges.map((edge) => `${edge.from}->${edge.to}`).sort();
    expect(edges).toContain("command.go->doc/man_docs.go");
    expect(edges).toContain("doc/man_docs.go->command.go");
    expect(result.externalDeps).toEqual(["github.com/spf13/pflag"]);
    expect(result.externalDeps).not.toContain("fmt");
  });

  it("lists one hub per Go package", async () => {
    await write("go.mod", "module example.com/app\n\ngo 1.22\n");
    await write("command.go", "package app\n");
    await write("args.go", "package app\n");
    for (let i = 0; i < 6; i += 1) {
      await write(`sub/page${i}.go`, `package sub\n\nimport "example.com/app"\n`);
    }
    const files = ["command.go", "args.go", ...Array.from({ length: 6 }, (_, i) => `sub/page${i}.go`)];
    const result = await analyzeDependencyGraph(files, tempDir);
    expect(result.stats.hubs.map((hub) => hub.key)).toEqual(["example.com/app"]);
    expect(result.stats.hubs[0].importedBy).toBe(6);
    const rendered = renderDependencyGraph(result);
    expect(rendered).toContain("`example.com/app`");
    expect(rendered).not.toContain("`command.go`");
    expect(rendered).not.toContain("`args.go`");
  });

  it("does not list Go test files as their own modules", async () => {
    await write("middleware/compress.go", "package middleware\n");
    await write("middleware/compress_test.go", "package middleware\n");
    await write("go.mod", "module github.com/go-chi/chi/v5\n\ngo 1.22\n");
    const scan = await scanRepo({
      __repoRoot: tempDir,
      module_roots: ["middleware"],
      scan: { include: ["**/*.go"], ignore: [] },
      project: { name: "chi" },
    });
    expect(scan.modules.map((mod) => mod.key)).toEqual(["middleware"]);
    expect(scan.modules.some((mod) => mod.key.includes("_test.go"))).toBe(false);
  });
});

describe("pattern descriptions", () => {
  it("does not call a substring match AI integration", () => {
    expect(pathHasKeyword("httpx/_main.py", "ai")).toBe(false);
    expect(pathHasKeyword("email", "ai")).toBe(false);
    const context = buildAIContext(
      { filesCount: 2, modules: [{ key: "httpx/_main.py", fileCount: 1 }, { key: "httpx/_client.py", fileCount: 4 }], api: [], pages: [], metadata: {} },
      { project: { name: "httpx" } },
      { nodes: [], edges: [], cycles: [], externalDeps: ["certifi"], stats: { cycles: 0, totalEdges: 3 } },
    );
    expect(context.patterns).not.toContain("AI/LLM integration");
  });

  it("does not call ky test hooks Custom React hooks without a react import", async () => {
    await write("test/hooks.ts", `import test from "ava";\nexport const n = 1;\n`);
    const graph = await analyzeDependencyGraph(["test/hooks.ts"], tempDir);
    const domain = inferDomain("test/hooks.ts", [], { react: false });
    expect(domain.domain).not.toBe("React Hooks");
    expect(domain.description).not.toContain("React");
    const catalog = renderModuleCatalog(
      { project: { name: "ky" } },
      { modules: [{ key: "test/hooks.ts", fileCount: 1 }], filesCount: 1 },
      {},
      graph,
    );
    expect(catalog).not.toContain("Custom React hooks");
    expect(catalog).toContain("Test suites and fixtures");
  });

  it("calls hooks Custom React hooks when the module imports react", async () => {
    await write("src/hooks/useThing.js", `import { useState } from "react";\nexport function useThing() { return useState(0); }\n`);
    const graph = await analyzeDependencyGraph(["src/hooks/useThing.js"], tempDir);
    const catalog = renderModuleCatalog(
      { project: { name: "app" } },
      { modules: [{ key: "src/hooks", fileCount: 1 }], filesCount: 1 },
      {},
      graph,
    );
    expect(catalog).toContain("Custom React hooks");
  });

  it("does not cite test files as CLI evidence", () => {
    const context = buildAIContext(
      {
        filesCount: 2,
        modules: [
          { key: "tests/test_commands.py", fileCount: 4 },
          { key: "src/click", fileCount: 12 },
        ],
        api: [],
        pages: [],
        metadata: {},
      },
      { project: { name: "click" } },
      { nodes: [], edges: [], cycles: [], externalDeps: [], stats: { cycles: 0, totalEdges: 0 } },
    );
    expect(context.patterns.some((pattern) => pattern.startsWith("CLI tool architecture"))).toBe(false);
    expect(context.patterns.some((pattern) => pattern.includes("tests/test_commands.py") && pattern.startsWith("Dedicated test infrastructure"))).toBe(true);
  });

  it("does not call a library file named _api an API route", () => {
    const httpx = buildAIContext(
      {
        filesCount: 2,
        modules: [
          { key: "httpx/_api.py", fileCount: 1 },
          { key: "httpx/_client.py", fileCount: 4 },
        ],
        api: [],
        pages: [],
        metadata: {},
      },
      { project: { name: "httpx" } },
      { nodes: [], edges: [], cycles: [], externalDeps: ["certifi"], stats: { cycles: 0, totalEdges: 3 } },
    );
    expect(httpx.patterns.some((pattern) => pattern.startsWith("API route pattern"))).toBe(false);

    const routes = buildAIContext(
      {
        filesCount: 1,
        modules: [{ key: "src/api/users.js", fileCount: 3 }],
        api: [],
        pages: [],
        metadata: {},
      },
      { project: { name: "app" } },
      { nodes: [], edges: [], cycles: [], externalDeps: [], stats: { cycles: 0, totalEdges: 0 } },
    );
    const api = routes.patterns.find((pattern) => pattern.startsWith("API route pattern"));
    expect(api).toContain("src/api/users.js");
  });

  it("cites the module that matched an AI path token", () => {
    const context = buildAIContext(
      { filesCount: 1, modules: [{ key: "src/llm/client.py", fileCount: 1 }], api: [], pages: [], metadata: {} },
      { project: { name: "demo" } },
      { nodes: [], edges: [], cycles: [], externalDeps: [], stats: { cycles: 0, totalEdges: 0 } },
    );
    const ai = context.patterns.find((pattern) => pattern.startsWith("AI/LLM integration"));
    expect(ai).toContain("src/llm/client.py");
    expect(ai).not.toMatch(/providers and intelligent features/);
  });

  it("describes a matched domain from the path token", () => {
    const domain = inferDomain("pkg/llm/client.py", [], {});
    expect(domain.domain).toBe("AI & Machine Learning");
    expect(domain.description).toContain("pkg/llm/client.py");
    expect(domain.description).toContain("`llm`");
    expect(domain.description).not.toContain("intelligent features");
  });
});
