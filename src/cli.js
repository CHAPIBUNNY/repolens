import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./core/config.js";
import { scanRepo } from "./core/scan.js";
import { getGitDiff } from "./core/diff.js";
import { runDoctor } from "./doctor.js";

import {
  renderSystemOverview,
  renderModuleCatalog,
  renderApiSurface,
  renderRouteMap
} from "./renderers/render.js";
import { renderSystemMap } from "./renderers/renderMap.js";
import { renderArchitectureDiff, buildArchitectureDiffData } from "./renderers/renderDiff.js";

import { publishDocs } from "./publishers/index.js";
import { upsertPrComment } from "./delivery/comment.js";
import { runInit } from "./init.js";
import { info, error } from "./utils/logger.js";

async function getPackageVersion() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const packageJsonPath = path.resolve(__dirname, "../package.json");

  const raw = await fs.readFile(packageJsonPath, "utf8");
  const pkg = JSON.parse(raw);

  return pkg.version || "0.0.0";
}

async function printBanner() {
  const version = await getPackageVersion();
  console.log(`\nRepoLens v${version}`);
  console.log("─".repeat(40));
}

function getArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

/**
 * Auto-discover .repolens.yml starting from current directory
 * Searches upward through parent directories until found or root reached
 */
async function findConfig(startDir = process.cwd()) {
  let currentDir = path.resolve(startDir);
  const root = path.parse(currentDir).root;

  while (currentDir !== root) {
    const configPath = path.join(currentDir, ".repolens.yml");
    try {
      await fs.access(configPath);
      return configPath;
    } catch {
      // Config not found, try parent directory
      currentDir = path.dirname(currentDir);
    }
  }

  // Check root directory as final attempt
  const rootConfigPath = path.join(root, ".repolens.yml");
  try {
    await fs.access(rootConfigPath);
    return rootConfigPath;
  } catch {
    throw new Error(
      "RepoLens config not found (.repolens.yml)\n" +
      "Run 'repolens init' to create one, or use --config to specify a path."
    );
  }
}

function printHelp() {
  console.log(`
RepoLens — Repo intelligence CLI

Usage:
  repolens <command> [options]

Commands:
  init        Scaffold RepoLens files in a target repository
  doctor      Validate a repository's RepoLens setup
  publish     Scan, render, and publish RepoLens outputs
  version     Print the current RepoLens version

Options:
  --config     Path to .repolens.yml (auto-discovered if not provided)
  --target     Target repository path for init/doctor
  --verbose    Enable verbose logging
  --version    Print version
  --help       Show this help message

Examples:
  repolens init --target /tmp/my-repo
  repolens doctor --target /tmp/my-repo
  repolens publish                              # Auto-discovers .repolens.yml
  repolens publish --config /path/.repolens.yml # Explicit config path
  repolens --version
`);
}

async function main() {
  const command = process.argv[2];

  if (command === "--help" || command === "-h" || command === "help") {
    printHelp();
    return;
  }

  if (command === "--version" || command === "-v" || command === "version") {
    const version = await getPackageVersion();
    console.log(version);
    return;
  }

  if (command === "init") {
    await printBanner();
    const targetDir = getArg("--target") || process.cwd();
    info(`Initializing RepoLens in: ${targetDir}`);
    try {
      await runInit(targetDir);
      info("✓ RepoLens initialized successfully");
    } catch (err) {
      error("Failed to initialize RepoLens:");
      error(err.message);
      process.exit(1);
    }
    return;
  }

  if (command === "doctor") {
    await printBanner();
    const targetDir = getArg("--target") || process.cwd();
    info(`Validating RepoLens setup in: ${targetDir}`);
    try {
      await runDoctor(targetDir);
      info("✓ RepoLens validation passed");
    } catch (err) {
      error("Validation failed:");
      error(err.message);
      process.exit(2);
    }
    return;
  }

  if (command === "publish" || !command || command.startsWith("--")) {
    await printBanner();
    
    // Auto-discover config if not provided
    let configPath;
    try {
      configPath = getArg("--config") || await findConfig();
      info(`Using config: ${configPath}`);
    } catch (err) {
      error(err.message);
      process.exit(2);
    }

    let cfg, scan;
    try {
      info("Loading configuration...");
      cfg = await loadConfig(configPath);
    } catch (err) {
      error("Failed to load configuration:");
      error(err.message);
      process.exit(2);
    }

    try {
      info("Scanning repository...");
      scan = await scanRepo(cfg);
      info(`Detected ${scan.modules?.length || 0} modules`);
    } catch (err) {
      error("Failed to scan repository:");
      error(err.message);
      process.exit(1);
    }

    const rawDiff = getGitDiff("origin/main");
    const diffData = buildArchitectureDiffData(rawDiff);

    const renderedPages = {
      system_overview: renderSystemOverview(cfg, scan),
      module_catalog: renderModuleCatalog(cfg, scan),
      api_surface: renderApiSurface(cfg, scan),
      arch_diff: renderArchitectureDiff(rawDiff),
      route_map: renderRouteMap(cfg, scan),
      system_map: renderSystemMap(scan)
    };

    try {
      info("Publishing documentation...");
      await publishDocs(cfg, renderedPages);
      await upsertPrComment(diffData);
      info("✓ Documentation published successfully");
    } catch (err) {
      error("Failed to publish documentation:");
      error(err.message);
      process.exit(1);
    }

    return;
  }

  error(`Unknown command: ${command}`);
  error("Available commands: init, doctor, publish, version, help");
  process.exit(1);
}

main().catch((err) => {
  console.error("\n❌ RepoLens encountered an unexpected error:\n");
  
  if (err.code === "ENOENT") {
    error(`File not found: ${err.path}`);
    error("Check that all required files exist and paths are correct.");
  } else if (err.code === "EACCES") {
    error(`Permission denied: ${err.path}`);
    error("Check file permissions and try again.");
  } else if (err.message) {
    error(err.message);
  } else {
    error(err);
  }
  
  if (process.env.VERBOSE || process.argv.includes("--verbose")) {
    console.error("\nStack trace:");
    console.error(err.stack);
  } else {
    console.error("\nRun with --verbose for full error details.");
  }
  
  process.exit(1);
});