// Monorepo workspace detection
// Detects npm/yarn workspaces, pnpm workspaces, and Lerna configurations

import fs from "node:fs/promises";
import path from "node:path";
import { info } from "../utils/logger.js";
import { isInsideRoot } from "../utils/safe-path.js";
import { loadYaml } from "../utils/yaml.js";

/**
 * Detect monorepo workspaces in a repository.
 * Returns { isMonorepo, tool, packages[] } where each package has { name, path, packageJson }.
 */
export async function detectMonorepo(repoRoot, { quiet = false } = {}) {
  const result = { isMonorepo: false, tool: null, packages: [] };
  const log = (message) => { if (!quiet) info(message); };

  // 1. Check package.json workspaces (npm/yarn)
  const npmWorkspaces = await detectNpmWorkspaces(repoRoot);
  if (npmWorkspaces.length > 0) {
    result.isMonorepo = true;
    result.tool = await workspaceToolLabel(repoRoot);
    result.packages = npmWorkspaces;
    log(`Monorepo detected: ${result.tool} with ${result.packages.length} packages`);
    return result;
  }

  // 2. Check pnpm-workspace.yaml
  const pnpmWorkspaces = await detectPnpmWorkspaces(repoRoot);
  if (pnpmWorkspaces.length > 0) {
    result.isMonorepo = true;
    result.tool = "pnpm workspaces";
    result.packages = pnpmWorkspaces;
    log(`Monorepo detected: ${result.tool} with ${result.packages.length} packages`);
    return result;
  }

  // 3. Check lerna.json
  const lernaPackages = await detectLerna(repoRoot);
  if (lernaPackages.length > 0) {
    result.isMonorepo = true;
    result.tool = "Lerna";
    result.packages = lernaPackages;
    log(`Monorepo detected: ${result.tool} with ${result.packages.length} packages`);
    return result;
  }

  return result;
}

async function detectNpmWorkspaces(repoRoot) {
  try {
    const pkgPath = path.join(repoRoot, "package.json");
    const raw = await fs.readFile(pkgPath, "utf8");
    const pkg = JSON.parse(raw);

    if (!pkg.workspaces) return [];

    // workspaces can be an array or { packages: [...] }
    const patterns = Array.isArray(pkg.workspaces)
      ? pkg.workspaces
      : pkg.workspaces.packages || [];

    return await resolveWorkspacePatterns(repoRoot, patterns);
  } catch {
    return [];
  }
}

async function detectPnpmWorkspaces(repoRoot) {
  try {
    const yamlPath = path.join(repoRoot, "pnpm-workspace.yaml");
    const raw = await fs.readFile(yamlPath, "utf8");
    const doc = loadYaml(raw);
    const patterns = Array.isArray(doc?.packages) ? doc.packages.filter((item) => typeof item === "string") : [];

    return await resolveWorkspacePatterns(repoRoot, patterns);
  } catch {
    return [];
  }
}

async function detectLerna(repoRoot) {
  try {
    const lernaPath = path.join(repoRoot, "lerna.json");
    const raw = await fs.readFile(lernaPath, "utf8");
    const lerna = JSON.parse(raw);

    const patterns = lerna.packages || ["packages/*"];
    return await resolveWorkspacePatterns(repoRoot, patterns);
  } catch {
    return [];
  }
}

async function fileExists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

/**
 * package.json `packageManager` wins over a leftover lockfile (zod is nub,
 * and still ships pnpm-lock.yaml). Otherwise the lockfile names the tool.
 */
async function workspaceToolLabel(repoRoot) {
  let declared = "";
  try {
    const pkg = JSON.parse(await fs.readFile(path.join(repoRoot, "package.json"), "utf8"));
    declared = String(pkg.packageManager || "").split("@")[0].trim().toLowerCase();
  } catch {
    declared = "";
  }
  if (declared === "nub") return "nub workspaces";
  if (declared === "bun" || await fileExists(path.join(repoRoot, "bun.lock")) || await fileExists(path.join(repoRoot, "bun.lockb"))) {
    return "bun workspaces";
  }
  if (declared === "pnpm" || await fileExists(path.join(repoRoot, "pnpm-lock.yaml")) || await fileExists(path.join(repoRoot, "pnpm-workspace.yaml"))) {
    return "pnpm workspaces";
  }
  if (declared === "yarn" || await fileExists(path.join(repoRoot, "yarn.lock"))) return "yarn workspaces";
  if (declared === "npm") return "npm workspaces";
  return "npm/yarn workspaces";
}

async function pushPackage(repoRoot, pkgDir, entryName, seen, packages) {
  if (!isInsideRoot(repoRoot, pkgDir)) return;
  const relativePath = path.relative(repoRoot, pkgDir).replace(/\\/g, "/");
  if (!relativePath || relativePath === "." || relativePath.startsWith("..") || seen.has(relativePath)) return;
  try {
    const raw = await fs.readFile(path.join(pkgDir, "package.json"), "utf8");
    const pkg = JSON.parse(raw);
    seen.add(relativePath);
    packages.push({
      name: pkg.name || entryName || path.basename(pkgDir),
      path: relativePath,
      version: pkg.version,
      dependencies: Object.keys(pkg.dependencies || {}),
      devDependencies: Object.keys(pkg.devDependencies || {}),
    });
  } catch {
    // No package.json in this directory, skip
  }
}

/**
 * Resolve workspace patterns to package directories.
 * `packages/*` lists children. `frontend` is that directory, not its children.
 */
async function resolveWorkspacePatterns(repoRoot, patterns) {
  const packages = [];
  const seen = new Set();

  for (const pattern of patterns) {
    if (typeof pattern !== "string" || pattern.includes("\0")) continue;
    const normalized = pattern.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
    if (!normalized || normalized.split("/").includes("..")) continue;

    if (!normalized.includes("*")) {
      await pushPackage(repoRoot, path.resolve(repoRoot, normalized), path.posix.basename(normalized), seen, packages);
      continue;
    }

    const basePath = normalized.replace(/\/?\*.*$/, "") || ".";
    const searchDir = path.resolve(repoRoot, basePath);
    if (!isInsideRoot(repoRoot, searchDir)) continue;

    try {
      const entries = await fs.readdir(searchDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        await pushPackage(repoRoot, path.join(searchDir, entry.name), entry.name, seen, packages);
      }
    } catch {
      // Directory doesn't exist, skip
    }
  }

  return packages;
}
