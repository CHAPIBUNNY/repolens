import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fetch from "node-fetch";
import { info, warn } from "./logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CHECK_INTERVAL = 1000 * 60 * 60 * 24; // 24 hours
const CACHE_FILE = path.join(process.env.HOME || process.env.USERPROFILE, ".repolens-update-check.json");

async function getCurrentVersion() {
  try {
    const pkgPath = path.join(__dirname, "../../package.json");
    const pkg = JSON.parse(await fs.readFile(pkgPath, "utf8"));
    return pkg.version;
  } catch {
    return null;
  }
}

async function getLatestVersion() {
  try {
    const response = await fetch("https://registry.npmjs.org/repolens/latest", {
      timeout: 3000
    });
    
    if (!response.ok) return null;
    
    const data = await response.json();
    return data.version;
  } catch {
    return null;
  }
}

async function readCache() {
  try {
    const cache = JSON.parse(await fs.readFile(CACHE_FILE, "utf8"));
    return cache;
  } catch {
    return null;
  }
}

async function writeCache(data) {
  try {
    await fs.writeFile(CACHE_FILE, JSON.stringify(data), "utf8");
  } catch {
    // Fail silently - not critical
  }
}

function compareVersions(current, latest) {
  const currentParts = current.split(".").map(Number);
  const latestParts = latest.split(".").map(Number);
  
  for (let i = 0; i < 3; i++) {
    if (latestParts[i] > currentParts[i]) return "outdated";
    if (latestParts[i] < currentParts[i]) return "ahead";
  }
  
  return "current";
}

export async function checkForUpdates() {
  // Skip in CI environments
  if (process.env.CI || process.env.GITHUB_ACTIONS) {
    return;
  }

  const currentVersion = await getCurrentVersion();
  if (!currentVersion) return;

  // Check cache to avoid frequent API calls
  const cache = await readCache();
  const now = Date.now();
  
  if (cache && (now - cache.lastCheck < CHECK_INTERVAL)) {
    // Recently checked, show cached result if outdated
    if (cache.isOutdated) {
      showUpdateMessage(currentVersion, cache.latestVersion);
    }
    return;
  }

  // Perform check
  const latestVersion = await getLatestVersion();
  if (!latestVersion) {
    // Failed to fetch, update cache timestamp only
    await writeCache({ lastCheck: now, isOutdated: false, latestVersion: null });
    return;
  }

  const comparison = compareVersions(currentVersion, latestVersion);
  
  if (comparison === "outdated") {
    showUpdateMessage(currentVersion, latestVersion);
    await writeCache({ lastCheck: now, isOutdated: true, latestVersion });
  } else {
    await writeCache({ lastCheck: now, isOutdated: false, latestVersion });
  }
}

function showUpdateMessage(current, latest) {
  console.log("");
  warn("┌────────────────────────────────────────────────────────────┐");
  warn("│                   📦 Update Available                      │");
  warn("├────────────────────────────────────────────────────────────┤");
  warn(`│  Current: ${current.padEnd(10)} → Latest: ${latest.padEnd(10)}              │`);
  warn("│                                                            │");
  warn("│  Run one of these commands to update:                     │");
  warn("│                                                            │");
  warn("│  • npm install -g @rabitai/repolens@latest (global)  │");
  warn("│  • npm install @rabitai/repolens@latest (local)      │");
  warn("│  • npx @rabitai/repolens@latest <command>  (latest)  │");
  warn("│                                                            │");
  warn("│  Release notes: https://github.com/CHAPIBUNNY/repolens    │");
  warn("└────────────────────────────────────────────────────────────┘");
  console.log("");
}

export async function forceCheckForUpdates() {
  const currentVersion = await getCurrentVersion();
  if (!currentVersion) {
    info("Could not determine current version");
    return;
  }

  info(`Current version: ${currentVersion}`);
  info("Checking for updates...");

  const latestVersion = await getLatestVersion();
  if (!latestVersion) {
    warn("Could not fetch latest version from npm registry");
    return;
  }

  const comparison = compareVersions(currentVersion, latestVersion);
  
  if (comparison === "outdated") {
    info(`Latest version: ${latestVersion}`);
    showUpdateMessage(currentVersion, latestVersion);
  } else if (comparison === "ahead") {
    info("You're running a pre-release or development version");
  } else {
    info("✓ You're running the latest version!");
  }
}
