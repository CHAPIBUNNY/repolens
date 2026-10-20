import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * True when `entryPath` is the RepoLens install under npm's global prefix.
 * npx caches live under `_npx` and are not a global install.
 */
export function isGlobalInstallPath(entryPath, globalPrefix) {
  if (!entryPath || !globalPrefix) return false;
  if (entryPath.includes(`${path.sep}_npx${path.sep}`)) return false;
  let entry = entryPath;
  let prefix = globalPrefix;
  try {
    entry = fs.realpathSync(entryPath);
  } catch {
    entry = path.resolve(entryPath);
  }
  prefix = path.resolve(globalPrefix);
  return entry === prefix || entry.startsWith(prefix + path.sep);
}

let cachedGlobal = null;

export function isGlobalInstall() {
  if (cachedGlobal != null) return cachedGlobal;
  const entry = process.argv[1];
  if (!entry) {
    cachedGlobal = false;
    return false;
  }
  try {
    const prefix = execFileSync("npm", ["prefix", "-g"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    }).trim();
    cachedGlobal = isGlobalInstallPath(entry, prefix);
  } catch {
    cachedGlobal = false;
  }
  return cachedGlobal;
}

/**
 * Command shown in init's next-steps text.
 * Global installs get `repolens publish`. Everything else gets npx.
 */
export function repolensCommand(subcommand, options = {}) {
  const globalInstall = options.globalInstall ?? isGlobalInstall();
  const bin = globalInstall ? "repolens" : "npx @chappibunny/repolens";
  if (!subcommand) return bin;
  return `${bin} ${subcommand}`;
}
