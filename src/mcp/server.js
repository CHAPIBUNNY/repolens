import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { callTool } from "./tools.js";

const rootField = z.string().optional().describe(
  "Directory to read. Relative or absolute, and it must stay inside the workspace root. Defaults to the workspace root."
);

const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

function packageVersion() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const pkg = JSON.parse(readFileSync(path.join(here, "../../package.json"), "utf8"));
  return pkg.version || "0.0.0";
}

/**
 * Stdio MCP server. Tool handlers live in tools.js so tests can call them
 * without opening a transport. Logs must stay off stdout.
 */
export function createMcpServer() {
  const server = new McpServer(
    { name: "repolens", version: packageVersion() },
    {
      instructions: [
        "RepoLens reads the workspace and returns architecture documentation.",
        "Every path stays inside the workspace root.",
        "Tools are read-only except generate_docs, which writes Markdown inside that root.",
        "Deterministic mode (the default) does not make network calls.",
      ].join(" "),
    }
  );

  server.registerTool(
    "get_system_overview",
    {
      title: "System overview",
      description: "Scan the workspace and return the RepoLens system overview. Read-only. No network calls.",
      inputSchema: { root: rootField },
      annotations: readOnly,
    },
    async (args) => callTool("get_system_overview", args)
  );

  server.registerTool(
    "list_modules",
    {
      title: "List modules",
      description: "Scan the workspace and list detected modules. Read-only. No network calls.",
      inputSchema: { root: rootField },
      annotations: readOnly,
    },
    async (args) => callTool("list_modules", args)
  );

  server.registerTool(
    "get_api_surface",
    {
      title: "API surface and routes",
      description: "Scan the workspace and return the API surface and the route map. Read-only. No network calls.",
      inputSchema: { root: rootField },
      annotations: readOnly,
    },
    async (args) => callTool("get_api_surface", args)
  );

  server.registerTool(
    "get_dependency_graph",
    {
      title: "Dependency graph",
      description: "Scan the workspace and return the import dependency graph. Read-only. No network calls.",
      inputSchema: { root: rootField },
      annotations: readOnly,
    },
    async (args) => callTool("get_dependency_graph", args)
  );

  server.registerTool(
    "get_architecture_diff",
    {
      title: "Architecture diff",
      description: "Return the architecture diff. With only baseRef, compare that ref to the working tree. With baseRef and headRef, run git diff between those two refs. Read-only. No network calls.",
      inputSchema: {
        root: rootField,
        baseRef: z.string().optional().describe("Base git ref. Defaults to HEAD. Compared with the working tree when headRef is omitted."),
        headRef: z.string().optional().describe("Optional second git ref. When set, the diff is baseRef...headRef as git diff baseRef headRef."),
      },
      annotations: readOnly,
    },
    async (args) => callTool("get_architecture_diff", args)
  );

  server.registerTool(
    "generate_docs",
    {
      title: "Generate docs",
      description: "Generate RepoLens Markdown into a directory inside the workspace. Deterministic by default, which disables AI and does not make network calls. This is the only tool that writes files.",
      inputSchema: {
        root: rootField,
        outputDir: z.string().optional().describe("Output directory relative to the repository. Must stay inside the repository. Defaults to .repolens or documentation.output_dir."),
        deterministic: z.boolean().optional().describe("Defaults to true. When true, AI stays off and this call does not use the network."),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => callTool("generate_docs", args)
  );

  return server;
}

export async function startMcpServer() {
  process.env.REPOLENS_LOG_STDERR = "1";
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
