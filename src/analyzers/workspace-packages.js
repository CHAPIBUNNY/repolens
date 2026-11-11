// Workspace members declared by the repository: root package.json `workspaces`
// (npm / yarn / bun), pnpm-workspace.yaml `packages`, and lerna.json `packages`.
// Only declared members are internal packages for the dependency graph. A stray
// package.json (a test stub named `express`, a fixture, a vendored copy) is not.

import fs from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import { loadYaml } from "../utils/yaml.js";

async function readJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return null;
  }
}

function cleanPattern(raw) {
  if (typeof raw !== "string") return null;
  let p = raw.trim();
  if (!p || p.includes("\0")) return null;
  const negated = p.startsWith("!");
  if (negated) p = p.slice(1).trim();
  p = p.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
  if (!p || p.startsWith("/") || /^[A-Za-z]:/.test(p)) return null;
  if (p.split("/").includes("..")) return null;
  return { pattern: p, negated };
}

async function declaredPatterns(repoRoot) {
  const sources = [];
  const patterns = [];

  const rootPkg = await readJson(path.join(repoRoot, "package.json"));
  if (rootPkg?.workspaces) {
    const list = Array.isArray(rootPkg.workspaces) ? rootPkg.workspaces : rootPkg.workspaces.packages;
    if (Array.isArray(list) && list.length > 0) {
      sources.push("package.json workspaces");
      patterns.push(...list);
    }
  }

  try {
    const doc = loadYaml(await fs.readFile(path.join(repoRoot, "pnpm-workspace.yaml"), "utf8"));
    if (Array.isArray(doc?.packages) && doc.packages.length > 0) {
      sources.push("pnpm-workspace.yaml");
      patterns.push(...doc.packages);
    }
  } catch {
    // no pnpm workspace
  }

  const lerna = await readJson(path.join(repoRoot, "lerna.json"));
  if (lerna) {
    const list = Array.isArray(lerna.packages) && lerna.packages.length > 0 ? lerna.packages : ["packages/*"];
    sources.push("lerna.json");
    patterns.push(...list);
  }

  return { sources, patterns };
}

/**
 * @returns {Promise<{ sources: string[], packages: { name: string, dir: string, manifest: object }[] }>}
 * `dir` is repository-relative with forward slashes ("" never occurs: the root is not a member).
 */
export async function listWorkspacePackages(repoRoot) {
  const { sources, patterns } = await declaredPatterns(repoRoot);
  const positive = [];
  const negative = [];
  for (const raw of patterns) {
    const cleaned = cleanPattern(raw);
    if (!cleaned) continue;
    (cleaned.negated ? negative : positive).push(cleaned.pattern);
  }
  if (positive.length === 0) return { sources, packages: [] };

  let manifests = [];
  try {
    manifests = await fg(positive.map((p) => `${p}/package.json`), {
      cwd: repoRoot,
      dot: true,
      onlyFiles: true,
      followSymbolicLinks: false,
      unique: true,
      ignore: ["**/node_modules/**", ...negative.map((p) => `${p}/package.json`), ...negative.map((p) => `${p}/**`)],
    });
  } catch {
    manifests = [];
  }

  const byName = new Map();
  for (const rel of manifests.sort()) {
    const dir = path.posix.dirname(rel.replace(/\\/g, "/"));
    if (!dir || dir === ".") continue;
    const manifest = await readJson(path.join(repoRoot, rel));
    if (!manifest || typeof manifest.name !== "string" || !manifest.name) continue;
    const existing = byName.get(manifest.name);
    if (!existing || dir.split("/").length < existing.dir.split("/").length) {
      byName.set(manifest.name, { name: manifest.name, dir, manifest });
    }
  }
  return { sources, packages: [...byName.values()] };
}
