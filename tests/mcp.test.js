import { describe, it, expect, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../src/mcp/server.js";
import { resolveInsideWorkspace } from "../src/mcp/workspace.js";
import { callTool, TOOL_NAMES } from "../src/mcp/tools.js";
import { DOCS_BADGE_MARKDOWN } from "../src/docs/branding.js";

const previousWorkspace = process.env.REPOLENS_WORKSPACE;

afterEach(() => {
  if (previousWorkspace === undefined) delete process.env.REPOLENS_WORKSPACE;
  else process.env.REPOLENS_WORKSPACE = previousWorkspace;
});

async function fixtureRepo() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-mcp-"));
  await fs.mkdir(path.join(root, "src"));
  await fs.writeFile(
    path.join(root, "src/index.js"),
    'import { greet } from "./lib.js";\nexport function main() { return greet(); }\nexport function start(app) { app.get("/health", () => "ok"); }\n'
  );
  await fs.writeFile(path.join(root, "src/lib.js"), "export function greet() { return \"hi\"; }\n");
  await fs.writeFile(
    path.join(root, ".repolens.yml"),
    [
      "configVersion: 1",
      "project:",
      "  name: Fixture",
      "publishers:",
      "  - markdown",
      "scan:",
      "  include:",
      "    - \"src/**/*.js\"",
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
    ].join("\n")
  );
  return root;
}

function git(repo, args) {
  execFileSync("git", args, { cwd: repo, stdio: "ignore" });
}

describe("mcp workspace paths", () => {
  it("keeps paths inside the workspace and rejects escapes", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-mcp-root-"));
    try {
      expect(resolveInsideWorkspace(root, "src")).toBe(path.resolve(root, "src"));
      expect(resolveInsideWorkspace(root, ".")).toBe(path.resolve(root));
      expect(() => resolveInsideWorkspace(root, "../outside")).toThrow(/escapes/);
      expect(() => resolveInsideWorkspace(root, "/etc/passwd")).toThrow(/escapes/);
      expect(() => resolveInsideWorkspace(root, "a\0b")).toThrow(/null byte/);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});

describe("mcp tools", () => {
  it("scans a fixture for overview, modules, API, graph, diff, and docs", async () => {
    const root = await fixtureRepo();
    process.env.REPOLENS_WORKSPACE = root;
    const originalFetch = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (url) => {
      calls.push(String(url));
      throw new Error("network disabled");
    };
    process.env.REPOLENS_AI_ENABLED = "true";

    try {
      git(root, ["init"]);
      git(root, ["config", "user.email", "repolens@example.com"]);
      git(root, ["config", "user.name", "RepoLens"]);
      git(root, ["add", "."]);
      git(root, ["commit", "-m", "init"]);
      const base = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
      await fs.writeFile(path.join(root, "src/extra.js"), "export const extra = 1;\n");
      git(root, ["add", "src/extra.js"]);
      git(root, ["commit", "-m", "extra"]);

      const overview = await callTool("get_system_overview", {});
      expect(overview.isError).toBeUndefined();
      expect(overview.content[0].text).toContain("System Overview");
      expect(overview.content[0].text).toContain("Fixture");

      const modules = await callTool("list_modules", { root: "." });
      expect(modules.content[0].text).toMatch(/src/);

      const api = await callTool("get_api_surface", {});
      expect(api.content[0].text).toContain("API");
      expect(api.content[0].text).toMatch(/Route|route/);

      const graph = await callTool("get_dependency_graph", {});
      expect(graph.content[0].text).toContain("Dependency");

      const diff = await callTool("get_architecture_diff", { baseRef: base, headRef: "HEAD" });
      expect(diff.content[0].text).toContain("extra.js");

      const escaped = await callTool("get_architecture_diff", { baseRef: "HEAD; touch /tmp/x" });
      expect(escaped.isError).toBe(true);

      const outside = await callTool("list_modules", { root: "../outside" });
      expect(outside.isError).toBe(true);
      expect(outside.content[0].text).toMatch(/escapes/);

      const docs = await callTool("generate_docs", { outputDir: "out/docs" });
      expect(docs.isError).toBeUndefined();
      expect(docs.content[0].text).toContain("out/docs");
      const overviewFile = await fs.readFile(path.join(root, "out/docs/01-system-overview.md"), "utf8");
      expect(overviewFile).toContain(DOCS_BADGE_MARKDOWN);

      const blocked = await callTool("generate_docs", { outputDir: "../outside" });
      expect(blocked.isError).toBe(true);
      expect(blocked.content[0].text).toMatch(/escapes|relative path/);
      expect(calls).toEqual([]);
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.REPOLENS_AI_ENABLED;
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("lists the read-only tools over the MCP transport", async () => {
    const root = await fixtureRepo();
    process.env.REPOLENS_WORKSPACE = root;
    const server = createMcpServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: "repolens-test", version: "1.0.0" });
    await client.connect(clientTransport);
    try {
      const listed = await client.listTools();
      const names = listed.tools.map((tool) => tool.name).sort();
      expect(names).toEqual([...TOOL_NAMES].sort());
      const overview = listed.tools.find((tool) => tool.name === "get_system_overview");
      expect(overview.annotations.readOnlyHint).toBe(true);
      const docs = listed.tools.find((tool) => tool.name === "generate_docs");
      expect(docs.annotations.readOnlyHint).toBe(false);
      const result = await client.callTool({ name: "list_modules", arguments: {} });
      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toMatch(/src/);
    } finally {
      await client.close();
      await server.close();
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
