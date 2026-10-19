import fs from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "../core/config.js";
import { scanRepo } from "../core/scan.js";
import { getGitDiff, isSafeGitRef } from "../core/diff.js";
import { analyzeDependencyGraph } from "../analyzers/dependency-graph.js";
import {
  renderSystemOverview,
  renderModuleCatalog,
  renderApiSurface,
  renderRouteMap,
} from "../renderers/render.js";
import { renderDependencyGraph } from "../renderers/renderAnalysis.js";
import { renderArchitectureDiff } from "../renderers/renderDiff.js";
import { generateDocumentSet } from "../docs/generate-doc-set.js";
import { writeDocumentSet } from "../docs/write-doc-set.js";
import { resolveDocsOutputDir, resolveInsideWorkspace, resolveWorkspaceRoot } from "./workspace.js";

const MAX_TEXT = 80_000;

export function asToolText(text) {
  const body = String(text ?? "");
  if (body.length <= MAX_TEXT) return body;
  return `${body.slice(0, MAX_TEXT)}\n\n[truncated ${body.length - MAX_TEXT} characters]`;
}

export function ok(text) {
  return { content: [{ type: "text", text: asToolText(text) }] };
}

export function fail(error) {
  const message = error instanceof Error ? error.message : String(error);
  return { isError: true, content: [{ type: "text", text: message }] };
}

function projectRootFromArgs(args) {
  const workspace = resolveWorkspaceRoot();
  return resolveInsideWorkspace(workspace, args?.root, "root");
}

function defaultConfig(root) {
  return {
    configVersion: 1,
    project: { name: path.basename(root) || "repository" },
    publishers: ["markdown"],
    scan: {
      include: ["**/*.{js,ts,jsx,tsx,mjs,cjs,py,go,rs,java,rb,php,cs,swift,kt}"],
      ignore: [
        "**/node_modules/**",
        "**/dist/**",
        "**/build/**",
        "**/.git/**",
        "**/vendor/**",
        "**/target/**",
        "**/__pycache__/**",
      ],
    },
    module_roots: ["src", "lib", "app", "packages"],
    outputs: {
      pages: [
        { key: "system_overview", title: "System Overview" },
        { key: "module_catalog", title: "Module Catalog" },
        { key: "api_surface", title: "API Surface" },
        { key: "route_map", title: "Route Map" },
      ],
    },
    documentation: { output_dir: ".repolens", include_artifacts: false },
    ai: { enabled: false, mode: "off" },
    branding: true,
    __repoRoot: root,
    __configPath: path.join(root, ".repolens.yml"),
  };
}

async function prepareConfig(root, { deterministic = true, outputDir } = {}) {
  const configPath = path.join(root, ".repolens.yml");
  let cfg;
  try {
    await fs.access(configPath);
    cfg = await loadConfig(configPath);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      cfg = defaultConfig(root);
    } else {
      throw error;
    }
  }

  cfg.__repoRoot = root;
  if (deterministic) {
    cfg.ai = { ...(cfg.ai || {}), enabled: false, mode: "off" };
  }
  if (outputDir != null && outputDir !== "") {
    cfg.documentation = {
      ...(cfg.documentation || {}),
      output_dir: resolveDocsOutputDir(root, outputDir),
    };
  }
  return cfg;
}

/**
 * Drop REPOLENS_AI_ENABLED for one call so deterministic mode cannot
 * reach an AI provider. The previous value is restored afterwards.
 */
export async function runDeterministic(fn) {
  const previous = process.env.REPOLENS_AI_ENABLED;
  delete process.env.REPOLENS_AI_ENABLED;
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete process.env.REPOLENS_AI_ENABLED;
    else process.env.REPOLENS_AI_ENABLED = previous;
  }
}

async function scanned(args) {
  const root = projectRootFromArgs(args);
  const cfg = await prepareConfig(root, { deterministic: true });
  const scan = await runDeterministic(() => scanRepo(cfg));
  return { root, cfg, scan };
}

export async function getSystemOverview(args = {}) {
  const { cfg, scan } = await scanned(args);
  return renderSystemOverview(cfg, scan);
}

export async function listModules(args = {}) {
  const { cfg, scan } = await scanned(args);
  return renderModuleCatalog(cfg, scan);
}

export async function getApiSurface(args = {}) {
  const { cfg, scan } = await scanned(args);
  return `${renderApiSurface(cfg, scan)}\n\n${renderRouteMap(cfg, scan)}`;
}

export async function getDependencyGraph(args = {}) {
  const { root, scan } = await scanned(args);
  const graph = await runDeterministic(() => analyzeDependencyGraph(scan._files || [], root));
  return renderDependencyGraph(graph);
}

export async function getArchitectureDiff(args = {}) {
  const root = projectRootFromArgs(args);
  const baseRef = args.baseRef == null || args.baseRef === "" ? "HEAD" : args.baseRef;
  const headRef = args.headRef == null || args.headRef === "" ? undefined : args.headRef;
  if (!isSafeGitRef(baseRef)) {
    throw new Error("baseRef contains unsupported characters");
  }
  if (headRef !== undefined && !isSafeGitRef(headRef)) {
    throw new Error("headRef contains unsupported characters");
  }
  const raw = getGitDiff(baseRef, root, headRef);
  return renderArchitectureDiff(raw);
}

export async function generateDocs(args = {}) {
  const root = projectRootFromArgs(args);
  const deterministic = args.deterministic !== false;
  const outputDir = args.outputDir;

  const run = async () => {
    const cfg = await prepareConfig(root, { deterministic, outputDir });
    const scan = await scanRepo(cfg);
    const raw = getGitDiff("HEAD", root);
    const docSet = await generateDocumentSet(scan, cfg, raw);
    const written = await writeDocumentSet(docSet, root);
    const rel = path.relative(root, written.outputDir) || ".";
    const lines = [
      `Wrote ${written.documentCount} documents to ${rel}`,
      ...written.files.map((file) => `- ${file}`),
    ];
    return lines.join("\n");
  };

  if (deterministic) return runDeterministic(run);
  return run();
}

const HANDLERS = {
  get_system_overview: getSystemOverview,
  list_modules: listModules,
  get_api_surface: getApiSurface,
  get_dependency_graph: getDependencyGraph,
  get_architecture_diff: getArchitectureDiff,
  generate_docs: generateDocs,
};

export const TOOL_NAMES = Object.keys(HANDLERS);

export async function callTool(name, args) {
  const handler = HANDLERS[name];
  if (!handler) return fail(new Error(`Unknown tool: ${name}`));
  try {
    const text = await handler(args || {});
    return ok(text);
  } catch (error) {
    return fail(error);
  }
}
