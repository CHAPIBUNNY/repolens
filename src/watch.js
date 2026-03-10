/**
 * Watch mode for RepoLens — regenerates Markdown docs when source files change.
 * Only publishes to Markdown (no API calls on every save).
 */

import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "./core/config.js";
import { scanRepo } from "./core/scan.js";
import { generateDocumentSet } from "./docs/generate-doc-set.js";
import { writeDocumentSet } from "./docs/write-doc-set.js";
import { getGitDiff } from "./core/diff.js";
import { info, warn, error } from "./utils/logger.js";

const DEBOUNCE_MS = 500;

/**
 * Run a single rebuild cycle (scan → render → write markdown).
 */
async function rebuild(configPath) {
  const start = Date.now();
  try {
    const cfg = await loadConfig(configPath);
    const scan = await scanRepo(cfg);
    const rawDiff = getGitDiff("origin/main");
    const docSet = await generateDocumentSet(scan, cfg, rawDiff);
    const result = await writeDocumentSet(docSet, process.cwd());
    const elapsed = Date.now() - start;
    info(`✓ Regenerated ${result.documentCount} docs in ${elapsed}ms`);
  } catch (err) {
    error(`Rebuild failed: ${err.message}`);
  }
}

/**
 * Start watch mode.
 * @param {string} configPath - Resolved path to .repolens.yml
 */
export async function runWatch(configPath) {
  info("Starting watch mode (Markdown only)...");
  info("Press Ctrl+C to stop.\n");

  // Initial build
  await rebuild(configPath);

  // Determine directories to watch from config
  const cfg = await loadConfig(configPath);
  const repoRoot = cfg.__repoRoot || process.cwd();
  const moduleRoots = cfg.module_roots || ["src", "app", "lib"];

  let debounceTimer = null;

  const onChange = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => rebuild(configPath), DEBOUNCE_MS);
  };

  const watchers = [];
  for (const root of moduleRoots) {
    const dirPath = path.resolve(repoRoot, root);
    try {
      fs.accessSync(dirPath);
      const watcher = fs.watch(dirPath, { recursive: true }, (eventType, filename) => {
        if (filename && !filename.includes("node_modules")) {
          info(`Change detected: ${root}/${filename}`);
          onChange();
        }
      });
      watchers.push(watcher);
      info(`Watching: ${root}/`);
    } catch {
      // Directory doesn't exist, skip
    }
  }

  if (watchers.length === 0) {
    warn("No directories to watch. Check module_roots in .repolens.yml");
    return;
  }

  info("\nWaiting for changes...\n");

  // Keep process alive and clean up on exit
  process.on("SIGINT", () => {
    info("\nStopping watch mode...");
    for (const w of watchers) w.close();
    process.exit(0);
  });

  // Keep alive indefinitely
  await new Promise(() => {});
}
