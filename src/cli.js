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
import { runWatch } from "./watch.js";
import { info, error, warn, fmt } from "./utils/logger.js";
import { formatError } from "./utils/errors.js";
import { checkForUpdates } from "./utils/update-check.js";
import { generateDocumentSet } from "./docs/generate-doc-set.js";
import { writeDocumentSet } from "./docs/write-doc-set.js";
import { loadPlugins } from "./plugins/loader.js";
import { PluginManager } from "./plugins/manager.js";
import { 
  initTelemetry, 
  captureError, 
  setContext, 
  closeTelemetry,
  trackUsage,
  startTimer,
  stopTimer,
  sendFeedback,
  getTimings
} from "./utils/telemetry.js";
import { createInterface } from "node:readline";

// Standardized exit codes
const EXIT_SUCCESS = 0;
const EXIT_ERROR = 1;
const EXIT_VALIDATION = 2;

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function printPerformanceSummary() {
  const timings = getTimings();
  if (timings.length === 0) return;

  console.log("\n" + "─".repeat(40));
  console.log("  Phase          Duration");
  console.log("  " + "─".repeat(30));
  let total = 0;
  for (const { operation, duration } of timings) {
    const label = operation.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    console.log(`  ${label.padEnd(16)} ${formatDuration(duration)}`);
    total += duration;
  }
  console.log("  " + "─".repeat(30));
  console.log(`  ${"Total".padEnd(16)} ${formatDuration(total)}`);
  console.log("─".repeat(40));
}

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
          🔍 Repository Intelligence by RepoLens
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
      formatError("CONFIG_NOT_FOUND")
    );
  }
}

function printHelp() {
  console.log(`
RepoLens — Repository Intelligence CLI

Usage:
  repolens <command> [options]

Commands:
  init        Scaffold RepoLens files in your repository
  doctor      Validate your RepoLens setup
  migrate     Upgrade workflow files to current format
  publish     Scan, render, and publish documentation
  demo        Generate local docs without API keys (quick preview)
  watch       Watch for file changes and regenerate docs
  uninstall   Remove all RepoLens-generated files from your repository
  feedback    Send feedback to the RepoLens team
  version     Print the current RepoLens version

Options:
  --config        Path to .repolens.yml (auto-discovered if not provided)
  --target        Target repository path for init/doctor/migrate
  --interactive   Run init with step-by-step configuration wizard
  --dry-run       Preview migration changes without applying them
  --force         Skip interactive confirmation for migration
  --verbose       Enable verbose logging
  --version       Print version
  --help          Show this help message

Examples:
  repolens init                                 # Quick setup with auto-detection
  repolens init --interactive                   # Step-by-step wizard
  repolens init --target /tmp/my-repo
  repolens doctor --target /tmp/my-repo
  repolens migrate                              # Migrate workflows in current directory
  repolens migrate --dry-run                    # Preview changes without applying
  repolens publish                              # Auto-discovers .repolens.yml
  repolens publish --config /path/.repolens.yml # Explicit config path
  repolens demo                                  # Quick local preview (no API keys)
  repolens watch                                # Watch mode (Markdown only)
  repolens uninstall                             # Remove all RepoLens files
  repolens uninstall --target /tmp/my-repo       # Uninstall from specific repo
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
    const interactive = process.argv.includes("--interactive");
    info(`Initializing RepoLens in: ${targetDir}`);
    
    const timer = startTimer("init");
    try {
      await runInit(targetDir, { interactive });
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
      process.exit(EXIT_ERROR);
    }
    return;
  }

  if (command === "doctor") {
    await printBanner();
    const targetDir = getArg("--target") || process.cwd();
    info(`Validating RepoLens setup in: ${targetDir}`);
    
    const timer = startTimer("doctor");
    try {
      const result = await runDoctor(targetDir);
      const duration = stopTimer(timer);
      
      if (result && result.ok === false) {
        trackUsage("doctor", "failure", { duration });
        await closeTelemetry();
        process.exit(EXIT_VALIDATION);
      }
      
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
      process.exit(EXIT_VALIDATION);
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
      process.exit(EXIT_ERROR);
    }
    return;
  }

  if (command === "watch") {
    await printBanner();
    let configPath;
    try {
      configPath = getArg("--config") || await findConfig();
      info(`Using config: ${configPath}`);
    } catch (err) {
      error(err.message);
      process.exit(EXIT_VALIDATION);
    }
    await runWatch(configPath);
    return;
  }

  // Reject unknown flags/commands before falling through to publish
  if (command && command.startsWith("--") && !["--help", "-h", "--version", "-v"].includes(command)) {
    error(`Unknown option: ${command}`);
    error("Run 'repolens help' for usage information.");
    process.exit(EXIT_ERROR);
  }

  if (command === "publish" || !command) {
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
      process.exit(EXIT_VALIDATION);
    }

    let cfg, scan;
    try {
      info("Loading configuration...");
      cfg = await loadConfig(configPath);
    } catch (err) {
      stopTimer(commandTimer);
      captureError(err, { command: "publish", step: "load-config", configPath });
      trackUsage("publish", "failure", { step: "config-load" });
      error(formatError("CONFIG_VALIDATION_FAILED", err));
      await closeTelemetry();
      process.exit(EXIT_VALIDATION);
    }

    // Auto-detect GITHUB_TOKEN and enable AI with GitHub Models (free)
    if (!cfg.ai?.enabled && process.env.REPOLENS_AI_ENABLED !== "true" && process.env.GITHUB_TOKEN) {
      info("✨ GITHUB_TOKEN detected — enabling AI-enhanced docs via GitHub Models (free)");
      cfg.ai = { enabled: true, provider: "github" };
      process.env.REPOLENS_AI_ENABLED = "true";
      process.env.REPOLENS_AI_PROVIDER = "github";
    }

    // Load plugins
    let pluginManager;
    try {
      const plugins = await loadPlugins(cfg.plugins, cfg.__repoRoot);
      pluginManager = new PluginManager(plugins);
      if (pluginManager.hasPlugins()) {
        info(`Loaded ${pluginManager.count} plugin(s): ${pluginManager.names.join(", ")}`);
      }
    } catch (err) {
      warn(`Plugin loading failed: ${err.message}`);
      pluginManager = new PluginManager([]);
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
      const code = err.message?.includes("No files") ? "SCAN_NO_FILES" 
                 : err.message?.includes("limit") ? "SCAN_TOO_MANY_FILES" : null;
      error(code ? formatError(code, err) : `Failed to scan repository:\n  ${err.message}`);
      await closeTelemetry();
      process.exit(EXIT_ERROR);
    }

    const rawDiff = getGitDiff("origin/main");
    const diffData = buildArchitectureDiffData(rawDiff);

    try {
      info("Generating documentation set...");
      const renderTimer = startTimer("render");
      const docSet = await generateDocumentSet(scan, cfg, rawDiff, pluginManager);
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
      await publishDocs(cfg, renderedPages, scan, pluginManager);
      stopTimer(publishTimer);
      
      await upsertPrComment(diffData);
      info("✓ Documentation published successfully");
      
      const totalDuration = stopTimer(commandTimer);
      
      printPerformanceSummary();
      
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
      process.exit(EXIT_ERROR);
    }

    await closeTelemetry();
    return;
  }

  if (command === "demo") {
    await printBanner();
    info("Demo mode — generating local documentation (no API keys required)...");
    
    const commandTimer = startTimer("demo");
    const targetDir = getArg("--target") || process.cwd();
    
    // Try to load existing config, otherwise use sensible defaults
    let cfg;
    try {
      const configPath = getArg("--config") || await findConfig();
      info(`Using config: ${configPath}`);
      cfg = await loadConfig(configPath);
    } catch {
      info("No .repolens.yml found — using default scan patterns");
      cfg = {
        configVersion: 1,
        project: { name: path.basename(targetDir) },
        publishers: ["markdown"],
        scan: {
          include: ["**/*.{js,ts,jsx,tsx,mjs,cjs,py,go,rs,java,rb,php,cs,swift,kt}"],
          ignore: ["**/node_modules/**", "**/dist/**", "**/build/**", "**/.git/**", "**/vendor/**", "**/target/**", "**/__pycache__/**"],
        },
        module_roots: ["src", "lib", "app", "packages"],
        outputs: {
          pages: [
            { key: "system_overview", title: "System Overview" },
            { key: "module_catalog", title: "Module Catalog" },
            { key: "api_surface", title: "API Surface" },
            { key: "route_map", title: "Route Map" },
            { key: "system_map", title: "System Map" },
            { key: "executive_summary", title: "Executive Summary" },
            { key: "business_domains", title: "Business Domains" },
            { key: "architecture_overview", title: "Architecture Overview" },
            { key: "data_flows", title: "Data Flows" },
            { key: "developer_onboarding", title: "Developer Onboarding" },
          ],
        },
        __repoRoot: targetDir,
        __configPath: path.join(targetDir, ".repolens.yml"),
      };
    }
    
    // Auto-detect GITHUB_TOKEN and enable AI with GitHub Models (free)
    const aiAlreadyConfigured = cfg.ai?.enabled || process.env.REPOLENS_AI_ENABLED === "true";
    let aiAutoEnabled = false;
    if (!aiAlreadyConfigured && process.env.GITHUB_TOKEN) {
      info("\n✨ GITHUB_TOKEN detected — enabling AI-enhanced docs via GitHub Models (free)");
      cfg.ai = { enabled: true, provider: "github" };
      process.env.REPOLENS_AI_ENABLED = "true";
      process.env.REPOLENS_AI_PROVIDER = "github";
      aiAutoEnabled = true;
    } else if (aiAlreadyConfigured) {
      info("\n🤖 AI-enhanced documentation enabled");
    } else {
      info("\n📄 Running in deterministic mode (no GITHUB_TOKEN detected)");
      info("   Set GITHUB_TOKEN to auto-enable free AI-enhanced docs via GitHub Models");
    }
    
    try {
      info("Scanning repository...");
      const scanTimer = startTimer("scan");
      const scan = await scanRepo(cfg);
      stopTimer(scanTimer);
      info(`Detected ${scan.modules?.length || 0} modules, ${scan.filesCount || 0} files`);
      
      const rawDiff = getGitDiff("origin/main");
      
      info("Generating documentation set...");
      const renderTimer = startTimer("render");
      const docSet = await generateDocumentSet(scan, cfg, rawDiff);
      stopTimer(renderTimer);
      
      info("Writing documentation to disk...");
      const writeResult = await writeDocumentSet(docSet, targetDir);
      
      const totalDuration = stopTimer(commandTimer);
      
      info(`\n✓ Generated ${writeResult.documentCount} documents in ${writeResult.outputDir}`);
      info("Browse your docs: open the .repolens/ directory");
      info("\nTo publish to Notion, Confluence, or GitHub Wiki, run: repolens publish");
      
      if (aiAutoEnabled) {
        info(`\n🤖 AI-enhanced docs were generated using ${fmt.boldGreen("GitHub Models (FREE)")}`);
        info("   To keep AI enabled permanently, run: repolens init --interactive");
      } else if (!cfg.ai?.enabled && process.env.REPOLENS_AI_ENABLED !== "true") {
        info(`\n${fmt.cyan("┌──────────────────────────────────────────────────────────────────┐")}`);
        info(`${fmt.cyan("│")} ${fmt.boldYellow("✨ Unlock AI-Enhanced Documentation")}                             ${fmt.cyan("│")}`);
        info(`${fmt.cyan("├──────────────────────────────────────────────────────────────────┤")}`);
        info(`${fmt.cyan("│")} Your docs are missing these AI-powered sections:                ${fmt.cyan("│")}`);
        info(`${fmt.cyan("│")}   ${fmt.yellow("•")} Executive Summary — plain language overview for leadership   ${fmt.cyan("│")}`);
        info(`${fmt.cyan("│")}   ${fmt.yellow("•")} Business Domains — what the system does for stakeholders    ${fmt.cyan("│")}`);
        info(`${fmt.cyan("│")}   ${fmt.yellow("•")} Architecture Overview — deeper narrative for architects     ${fmt.cyan("│")}`);
        info(`${fmt.cyan("│")}   ${fmt.yellow("•")} Data Flows — how information moves through your system      ${fmt.cyan("│")}`);
        info(`${fmt.cyan("│")}   ${fmt.yellow("•")} Developer Onboarding — getting started guide for new hires  ${fmt.cyan("│")}`);
        info(`${fmt.cyan("│")}                                                                  ${fmt.cyan("│")}`);
        info(`${fmt.cyan("│")} ${fmt.boldGreen("🆓 Enable for FREE with GitHub Models:")}                          ${fmt.cyan("│")}`);
        info(`${fmt.cyan("│")}   ${fmt.green("export GITHUB_TOKEN=<your-token>")}                            ${fmt.cyan("│")}`);
        info(`${fmt.cyan("│")}   ${fmt.green("repolens demo")}                                               ${fmt.cyan("│")}`);
        info(`${fmt.cyan("│")}                                                                  ${fmt.cyan("│")}`);
        info(`${fmt.cyan("│")} Or run: ${fmt.brightCyan("repolens init --interactive")} → select GitHub Models      ${fmt.cyan("│")}`);
        info(`${fmt.cyan("└──────────────────────────────────────────────────────────────────┘")}`);
      }
      
      printPerformanceSummary();
      
      trackUsage("demo", "success", {
        duration: totalDuration,
        fileCount: scan.filesCount || 0,
        moduleCount: scan.modules?.length || 0,
        documentCount: writeResult.documentCount,
        usedConfig: Boolean(cfg.__configPath && cfg.__configPath !== path.join(targetDir, ".repolens.yml")),
      });
    } catch (err) {
      stopTimer(commandTimer);
      captureError(err, { command: "demo", targetDir });
      trackUsage("demo", "failure");
      error("Demo failed:");
      error(err.message);
      await closeTelemetry();
      process.exit(EXIT_ERROR);
    }
    
    await closeTelemetry();
    return;
  }

  if (command === "uninstall") {
    await printBanner();
    
    const targetDir = getArg("--target") || process.cwd();
    const forceFlag = process.argv.includes("--force");
    
    info("Scanning for RepoLens files...\n");
    
    // All files/directories that RepoLens creates
    const candidates = [
      { path: path.join(targetDir, ".repolens"),                    type: "dir",  label: ".repolens/",                     source: "demo/publish" },
      { path: path.join(targetDir, ".repolens.yml"),                type: "file", label: ".repolens.yml",                  source: "init" },
      { path: path.join(targetDir, ".github", "workflows", "repolens.yml"), type: "file", label: ".github/workflows/repolens.yml", source: "init" },
      { path: path.join(targetDir, ".env.example"),                 type: "file", label: ".env.example",                   source: "init" },
      { path: path.join(targetDir, "README.repolens.md"),           type: "file", label: "README.repolens.md",             source: "init" },
    ];
    
    // Check which files exist
    const found = [];
    for (const item of candidates) {
      try {
        const stat = await fs.stat(item.path);
        if ((item.type === "dir" && stat.isDirectory()) || (item.type === "file" && stat.isFile())) {
          found.push(item);
        }
      } catch {
        // File doesn't exist — skip
      }
    }
    
    if (found.length === 0) {
      info("No RepoLens files found. Nothing to remove.");
      await closeTelemetry();
      return;
    }
    
    info("Found the following RepoLens files:\n");
    for (const item of found) {
      const icon = item.type === "dir" ? "📁" : "📄";
      info(`  ${icon} ${item.label}  (created by ${item.source})`);
    }
    
    // Confirm unless --force
    if (!forceFlag) {
      const isCI = process.env.CI || process.env.GITHUB_ACTIONS;
      const isTest = process.env.NODE_ENV === "test" || process.env.VITEST;
      
      if (isCI || isTest) {
        info("\nCI/test environment detected — skipping confirmation (use --force to suppress this message).");
      } else {
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        const answer = await new Promise((resolve) => {
          rl.question(`\nRemove ${found.length} item${found.length === 1 ? "" : "s"}? This cannot be undone. (y/N): `, resolve);
        });
        rl.close();
        
        if (!answer || answer.trim().toLowerCase() !== "y") {
          info("Uninstall cancelled.");
          await closeTelemetry();
          return;
        }
      }
    }
    
    // Remove files
    let removed = 0;
    for (const item of found) {
      try {
        if (item.type === "dir") {
          await fs.rm(item.path, { recursive: true, force: true });
        } else {
          await fs.unlink(item.path);
        }
        info(`  ✓ Removed ${item.label}`);
        removed++;
      } catch (err) {
        error(`  ✗ Failed to remove ${item.label}: ${err.message}`);
      }
    }
    
    info(`\n✓ Removed ${removed}/${found.length} RepoLens file${found.length === 1 ? "" : "s"}.`);
    
    if (removed > 0) {
      info("\nTo reinstall, run: repolens init");
      info("To uninstall the npm package: npm uninstall @chappibunny/repolens");
    }
    
    trackUsage("uninstall", "success", { removed, total: found.length });
    await closeTelemetry();
    return;
  }

  if (command === "feedback") {
    await printBanner();
    info("Send feedback to the RepoLens team");
    info("Your feedback is anonymous and helps us improve RepoLens.\n");

    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

    try {
      const name = await ask("Your name: ");
      const email = await ask("Your email: ");
      const message = await ask("Feedback: ");
      rl.close();

      if (!message.trim()) {
        error("Feedback message cannot be empty.");
        await closeTelemetry();
        process.exit(EXIT_ERROR);
      }

      info("\nSending feedback...");
      const sent = await sendFeedback(
        name.trim() || "Anonymous",
        email.trim() || "no-email@repolens.dev",
        message.trim()
      );

      if (sent) {
        info("✓ Thank you! Your feedback has been sent.");
      } else {
        error("Failed to send feedback. Please try again later.");
        await closeTelemetry();
        process.exit(EXIT_ERROR);
      }
    } catch (err) {
      rl.close();
      captureError(err, { command: "feedback" });
      error("Failed to send feedback:");
      error(err.message);
    }

    await closeTelemetry();
    return;
  }

  error(`Unknown command: ${command}`);
  error("Available commands: init, doctor, migrate, publish, demo, watch, uninstall, feedback, version, help");
  process.exit(EXIT_ERROR);
}

main().catch(async (err) => {
  // Capture unexpected errors
  captureError(err, { 
    type: "uncaught",
    command: process.argv[2] || "unknown"
  });
  
  console.error("\n❌ RepoLens encountered an unexpected error:\n");
  
  if (err.code === "ENOENT") {
    error(formatError("FILE_NOT_FOUND", err.path));
  } else if (err.code === "EACCES") {
    error(formatError("FILE_PERMISSION_DENIED", err.path));
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
  process.exit(EXIT_ERROR);
});