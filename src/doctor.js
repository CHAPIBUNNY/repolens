import fs from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "./core/config.js";
import { info } from "./utils/logger.js";
import { forceCheckForUpdates } from "./utils/update-check.js";

const DETECTABLE_ROOTS = [
  "app",
  "src/app",
  "components",
  "src/components",
  "lib",
  "src/lib",
  "hooks",
  "src/hooks",
  "store",
  "src/store",
  "pages",
  "src/pages"
];

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function dirExists(dirPath) {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function detectRepoRoots(repoRoot) {
  const found = [];

  for (const relativePath of DETECTABLE_ROOTS) {
    const absolutePath = path.join(repoRoot, relativePath);
    if (await dirExists(absolutePath)) {
      found.push(relativePath);
    }
  }

  return found;
}

function ok(message) {
  info(`✅ ${message}`);
}

function fail(message) {
  info(`❌ ${message}`);
}

function warn(message) {
  info(`⚠️  ${message}`);
}

export async function runDoctor(targetDir = process.cwd()) {
  const repoRoot = path.resolve(targetDir);

  const repolensConfigPath = path.join(repoRoot, ".repolens.yml");
  const workflowPath = path.join(repoRoot, ".github", "workflows", "repolens.yml");
  const envExamplePath = path.join(repoRoot, ".env.example");
  const readmePath = path.join(repoRoot, "README.repolens.md");

  let hasFailures = false;

  info(`Running doctor for ${repoRoot}`);
  info("");
  
  // Check for RepoLens version updates
  info("Version Check:");
  info("");
  await forceCheckForUpdates();
  info("");

  if (await fileExists(repolensConfigPath)) {
    ok("Found .repolens.yml");
  } else {
    fail("Missing .repolens.yml");
    hasFailures = true;
  }

  if (await fileExists(workflowPath)) {
    ok("Found .github/workflows/repolens.yml");
  } else {
    fail("Missing .github/workflows/repolens.yml");
    hasFailures = true;
  }

  if (await fileExists(envExamplePath)) {
    ok("Found .env.example");
  } else {
    warn("Missing .env.example");
  }

  if (await fileExists(readmePath)) {
    ok("Found README.repolens.md");
  } else {
    warn("Missing README.repolens.md");
  }

  info("");

  let cfg = null;

  if (await fileExists(repolensConfigPath)) {
    try {
      cfg = await loadConfig(repolensConfigPath);
      ok("RepoLens config parsed successfully");
    } catch (error) {
      fail(`RepoLens config is invalid: ${error.message}`);
      hasFailures = true;
    }
  }

  if (cfg) {
    if (Array.isArray(cfg.publishers) && cfg.publishers.length > 0) {
      ok(`Configured publishers: ${cfg.publishers.join(", ")}`);
    } else {
      fail("No publishers configured");
      hasFailures = true;
    }

    if (Array.isArray(cfg.scan?.include) && cfg.scan.include.length > 0) {
      ok(`scan.include has ${cfg.scan.include.length} pattern(s)`);
    } else {
      fail("scan.include is missing or empty");
      hasFailures = true;
    }

    if (Array.isArray(cfg.module_roots) && cfg.module_roots.length > 0) {
      ok(`module_roots has ${cfg.module_roots.length} item(s)`);
    } else {
      fail("module_roots is missing or empty");
      hasFailures = true;
    }

    if (Array.isArray(cfg.outputs?.pages) && cfg.outputs.pages.length > 0) {
      ok(`outputs.pages has ${cfg.outputs.pages.length} page definition(s)`);
    } else {
      fail("outputs.pages is missing or empty");
      hasFailures = true;
    }
  }

  // Validate environment variables for configured publishers
  if (cfg && Array.isArray(cfg.publishers)) {
    info("Environment:");
    info("");

    const envChecks = [];

    if (cfg.publishers.includes("notion")) {
      envChecks.push(
        { key: "NOTION_TOKEN", required: true, publisher: "Notion" },
        { key: "NOTION_PARENT_PAGE_ID", required: true, publisher: "Notion" },
      );
    }

    if (cfg.publishers.includes("confluence")) {
      envChecks.push(
        { key: "CONFLUENCE_URL", required: true, publisher: "Confluence" },
        { key: "CONFLUENCE_EMAIL", required: true, publisher: "Confluence" },
        { key: "CONFLUENCE_API_TOKEN", required: true, publisher: "Confluence" },
        { key: "CONFLUENCE_SPACE_KEY", required: true, publisher: "Confluence" },
        { key: "CONFLUENCE_PARENT_PAGE_ID", required: true, publisher: "Confluence" },
      );
    }

    if (cfg.publishers.includes("github_wiki")) {
      envChecks.push(
        { key: "GITHUB_TOKEN", required: true, publisher: "GitHub Wiki" },
      );
    }

    if (cfg.ai?.enabled || process.env.REPOLENS_AI_ENABLED === "true") {
      envChecks.push(
        { key: "REPOLENS_AI_API_KEY", required: true, publisher: "AI" },
      );
    }

    if (envChecks.length === 0) {
      ok("No publisher-specific env vars required (Markdown only)");
    }

    for (const check of envChecks) {
      if (process.env[check.key]) {
        ok(`${check.key} is set (${check.publisher})`);
      } else {
        warn(`${check.key} is not set — required for ${check.publisher} publishing`);
      }
    }

    info("");
  }

  info("");

  const detectedRoots = await detectRepoRoots(repoRoot);

  if (detectedRoots.length > 0) {
    ok(`Detected repo roots: ${detectedRoots.join(", ")}`);
  } else {
    warn("No known repo roots detected (app/src/components/lib/hooks/store/pages)");
  }

  info("");

  if (hasFailures) {
    fail("RepoLens doctor found blocking issues.");
    process.exitCode = 1;
    return { ok: false };
  }

  ok("RepoLens doctor passed.");
  return { ok: true };
}