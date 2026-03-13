// Monorepo workspace detection
// Detects npm/yarn workspaces, pnpm workspaces, and Lerna configurations

import fs from "node:fs/promises";
import path from "node:path";
import { info } from "../utils/logger.js";

/**
 * Detect monorepo workspaces in a repository.
 * Returns { isMonorepo, tool, packages[] } where each package has { name, path, packageJson }.
 */
export async function detectMonorepo(repoRoot) {
  const result = { isMonorepo: false, tool: null, packages: [] };

  // 1. Check package.json workspaces (npm/yarn)
  const npmWorkspaces = await detectNpmWorkspaces(repoRoot);
  if (npmWorkspaces.length > 0) {
    result.isMonorepo = true;
    result.tool = "npm/yarn workspaces";
    result.packages = npmWorkspaces;
    info(`Monorepo detected: ${result.tool} with ${result.packages.length} packages`);
    return result;
  }

  // 2. Check pnpm-workspace.yaml
  const pnpmWorkspaces = await detectPnpmWorkspaces(repoRoot);
  if (pnpmWorkspaces.length > 0) {
    result.isMonorepo = true;
    result.tool = "pnpm workspaces";
    result.packages = pnpmWorkspaces;
    info(`Monorepo detected: ${result.tool} with ${result.packages.length} packages`);
    return result;
  }

  // 3. Check lerna.json
  const lernaPackages = await detectLerna(repoRoot);
  if (lernaPackages.length > 0) {
    result.isMonorepo = true;
    result.tool = "Lerna";
    result.packages = lernaPackages;
    info(`Monorepo detected: ${result.tool} with ${result.packages.length} packages`);
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

    // Simple YAML parsing for packages array (avoid adding js-yaml dependency for this)
    const patterns = [];
    let inPackages = false;
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (trimmed === "packages:") {
        inPackages = true;
        continue;
      }
      if (inPackages) {
        if (trimmed.startsWith("- ")) {
          patterns.push(trimmed.slice(2).replace(/['"]/g, "").trim());
        } else if (trimmed && !trimmed.startsWith("#")) {
          break; // End of packages list
        }
      }
    }

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

/**
 * Resolve workspace glob patterns to actual package directories.
 */
async function resolveWorkspacePatterns(repoRoot, patterns) {
  const packages = [];
  const seen = new Set();

  for (const pattern of patterns) {
    // Convert glob pattern to directory search
    // e.g. "packages/*" → list dirs in packages/
    const basePath = pattern.replace(/\/?\*.*$/, "");
    const searchDir = path.join(repoRoot, basePath);

    try {
      const entries = await fs.readdir(searchDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const pkgDir = path.join(searchDir, entry.name);
        const pkgJsonPath = path.join(pkgDir, "package.json");

        try {
          const raw = await fs.readFile(pkgJsonPath, "utf8");
          const pkg = JSON.parse(raw);
          const relativePath = path.relative(repoRoot, pkgDir).replace(/\\/g, "/");

          if (!seen.has(relativePath)) {
            seen.add(relativePath);
            packages.push({
              name: pkg.name || entry.name,
              path: relativePath,
              version: pkg.version,
              dependencies: Object.keys(pkg.dependencies || {}),
              devDependencies: Object.keys(pkg.devDependencies || {}),
            });
          }
        } catch {
          // No package.json in this directory, skip
        }
      }
    } catch {
      // Directory doesn't exist, skip
    }
  }

  return packages;
}
