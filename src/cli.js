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
import { runMigrate } from "./migrate.js";
import { info, error } from "./utils/logger.js";
import { checkForUpdates } from "./utils/update-check.js";
import { generateDocumentSet } from "./docs/generate-doc-set.js";
import { writeDocumentSet } from "./docs/write-doc-set.js";
import { 
  initTelemetry, 
  captureError, 
  setContext, 
  closeTelemetry,
  trackUsage,
  startTimer,
  stopTimer
} from "./utils/telemetry.js";

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
  console.log(`
██████╗ ███████╗██████╗  ██████╗ ██╗     ███████╗███╗   ██╗███████╗
██╔══██╗██╔════╝██╔══██╗██╔═══██╗██║     ██╔════╝████╗  ██║██╔════╝
██████╔╝█████╗  ██████╔╝██║   ██║██║     █████╗  ██╔██╗ ██║███████╗
██╔══██╗██╔══╝  ██╔═══╝ ██║   ██║██║     ██╔══╝  ██║╚██╗██║╚════██║
██║  ██║███████╗██║     ╚██████╔╝███████╗███████╗██║ ╚████║███████║
╚═╝  ╚═╝╚══════╝╚═╝      ╚═════╝ ╚══════╝╚══════╝╚═╝  ╚═══╝╚══════╝
          🔍 Repository Intelligence by RABITAI 🐰
          v${version}
`);
  console.log("─".repeat(70));
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
RepoLens — Repository Intelligence CLI by RABITAI 🐰

Usage:
  repolens <command> [options]

Commands:
  init        Scaffold RepoLens files in your repository
  doctor      Validate your RepoLens setup
  migrate     Upgrade workflow files to v0.4.0 format
  publish     Scan, render, and publish documentation
  version     Print the current RepoLens version

Options:
  --config     Path to .repolens.yml (auto-discovered if not provided)
  --target     Target repository path for init/doctor/migrate
  --dry-run    Preview migration changes without applying them
  --force      Skip interactive confirmation for migration
  --verbose    Enable verbose logging
  --version    Print version
  --help       Show this help message

Examples:
  repolens init --target /tmp/my-repo
  repolens doctor --target /tmp/my-repo
  repolens migrate                              # Migrate workflows in current directory
  repolens migrate --dry-run                    # Preview changes without applying
  repolens publish                              # Auto-discovers .repolens.yml
  repolens publish --config /path/.repolens.yml # Explicit config path
  repolens --version
`);
}

async function main() {
  const command = process.argv[2];

  // Initialize telemetry (opt-in via REPOLENS_TELEMETRY_ENABLED=true)
  initTelemetry();
  setContext("cli", {
    command: command || "publish",
    args: process.argv.slice(2),
    nodeVersion: process.version,
    platform: process.platform,
  });

  // Check for updates (non-blocking, runs in background)
  checkForUpdates().catch(() => {/* Silently fail */});

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
    
    const timer = startTimer("init");
    try {
      await runInit(targetDir);
      const duration = stopTimer(timer);
      info("✓ RepoLens initialized successfully");
      
      trackUsage("init", "success", { duration });
      await closeTelemetry();
    } catch (err) {
      stopTimer(timer);
      captureError(err, { command: "init", targetDir });
      trackUsage("init", "failure");
      error("Failed to initialize RepoLens:");
      error(err.message);
      await closeTelemetry();
      process.exit(1);
    }
    return;
  }

  if (command === "doctor") {
    await printBanner();
    const targetDir = getArg("--target") || process.cwd();
    info(`Validating RepoLens setup in: ${targetDir}`);
    
    const timer = startTimer("doctor");
    try {
      await runDoctor(targetDir);
      const duration = stopTimer(timer);
      info("✓ RepoLens validation passed");
      
      trackUsage("doctor", "success", { duration });
      await closeTelemetry();
    } catch (err) {
      stopTimer(timer);
      captureError(err, { command: "doctor", targetDir });
      trackUsage("doctor", "failure");
      error("Validation failed:");
      error(err.message);
      await closeTelemetry();
      process.exit(2);
    }
    return;
  }

  if (command === "migrate") {
    const targetDir = getArg("--target") || process.cwd();
    const dryRun = process.argv.includes("--dry-run");
    const force = process.argv.includes("--force");
    
    const timer = startTimer("migrate");
    try {
      const result = await runMigrate(targetDir, { dryRun, force });
      const duration = stopTimer(timer);
      
      trackUsage("migrate", "success", {
        duration,
        migratedCount: result?.migratedCount || 0,
        skippedCount: result?.skippedCount || 0,
        dryRun,
      });
      await closeTelemetry();
    } catch (err) {
      stopTimer(timer);
      captureError(err, { command: "migrate", targetDir, dryRun, force });
      trackUsage("migrate", "failure", { dryRun });
      error("Migration failed:");
      error(err.message);
      await closeTelemetry();
      process.exit(1);
    }
    return;
  }

  if (command === "publish" || !command || command.startsWith("--")) {
    await printBanner();
    
    const commandTimer = startTimer("publish");
    
    // Auto-discover config if not provided
    let configPath;
    try {
      configPath = getArg("--config") || await findConfig();
      info(`Using config: ${configPath}`);
    } catch (err) {
      stopTimer(commandTimer);
      error(err.message);
      process.exit(2);
    }

    let cfg, scan;
    try {
      info("Loading configuration...");
      cfg = await loadConfig(configPath);
    } catch (err) {
      stopTimer(commandTimer);
      captureError(err, { command: "publish", step: "load-config", configPath });
      trackUsage("publish", "failure", { step: "config-load" });
      error("Failed to load configuration:");
      error(err.message);
      await closeTelemetry();
      process.exit(2);
    }

    try {
      info("Scanning repository...");
      const scanTimer = startTimer("scan");
      scan = await scanRepo(cfg);
      stopTimer(scanTimer);
      info(`Detected ${scan.modules?.length || 0} modules`);
    } catch (err) {
      stopTimer(commandTimer);
      captureError(err, { command: "publish", step: "scan", patterns: cfg.scan?.patterns });
      trackUsage("publish", "failure", { step: "scan" });
      error("Failed to scan repository:");
      error(err.message);
      await closeTelemetry();
      process.exit(1);
    }

    const rawDiff = getGitDiff("origin/main");
    const diffData = buildArchitectureDiffData(rawDiff);

    try {
      info("Generating documentation set...");
      const renderTimer = startTimer("render");
      const docSet = await generateDocumentSet(scan, cfg, rawDiff);
      stopTimer(renderTimer);
      
      info("Writing documentation to disk...");
      const writeResult = await writeDocumentSet(docSet, process.cwd());
      info(`✓ Generated ${writeResult.documentCount} documents in ${writeResult.outputDir}`);
      
      // Build legacy renderedPages format for Notion publishing
      const renderedPages = {};
      for (const doc of docSet.documents) {
        // Map new document keys to legacy keys for backwards compatibility
        const legacyKey = doc.key;
        renderedPages[legacyKey] = doc.content;
      }
      
      info("Publishing documentation...");
      const publishTimer = startTimer("publish_docs");
      await publishDocs(cfg, renderedPages, scan);
      stopTimer(publishTimer);
      
      await upsertPrComment(diffData);
      info("✓ Documentation published successfully");
      
      const totalDuration = stopTimer(commandTimer);
      
      // Track successful publish with comprehensive metrics
      const publishers = [];
      if (cfg.publishers?.notion?.enabled !== false) publishers.push("notion");
      if (cfg.publishers?.markdown?.enabled !== false) publishers.push("markdown");
      
      trackUsage("publish", "success", {
        duration: totalDuration,
        fileCount: scan.filesCount || 0,
        moduleCount: scan.modules?.length || 0,
        aiEnabled: Boolean(process.env.REPOLENS_AI_API_KEY || process.env.OPENAI_API_KEY),
        aiProvider: process.env.AI_PROVIDER || "openai",
        publishers,
        documentCount: writeResult.documentCount,
      });
    } catch (err) {
      stopTimer(commandTimer);
      captureError(err, { command: "publish", step: "generate-or-publish", publishers: cfg.publishers });
      trackUsage("publish", "failure", { step: "generate-or-publish" });
      error("Failed to publish documentation:");
      error(err.message);
      await closeTelemetry();
      process.exit(1);
    }

    await closeTelemetry();
    return;
  }

  error(`Unknown command: ${command}`);
  error("Available commands: init, doctor, migrate, publish, version, help");
  process.exit(1);
}

main().catch(async (err) => {
  // Capture unexpected errors
  captureError(err, { 
    type: "uncaught",
    command: process.argv[2] || "unknown"
  });
  
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
  
  await closeTelemetry();
  process.exit(1);
});