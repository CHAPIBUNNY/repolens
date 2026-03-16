/**
 * Hash-based document cache.
 * Compares rendered content hashes to avoid redundant publisher API calls.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { info, verbose } from "./logger.js";

const CACHE_FILENAME = "doc-hashes.json";

/**
 * Hash a string using SHA-256.
 */
function hashContent(content) {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

/**
 * Load the previous cache from disk.
 * @returns {{ cache: Record<string, string>, age: number|null }} Map of docKey → contentHash and cache age in ms
 */
export async function loadDocCache(cacheDir) {
  const cachePath = path.join(cacheDir, CACHE_FILENAME);
  try {
    const [raw, stat] = await Promise.all([
      fs.readFile(cachePath, "utf8"),
      fs.stat(cachePath),
    ]);
    // Math.max ensures age is never negative due to timing precision
    const age = Math.max(0, Date.now() - stat.mtimeMs);
    return { cache: JSON.parse(raw), age };
  } catch {
    return { cache: {}, age: null };
  }
}

/**
 * Save the cache to disk.
 */
export async function saveDocCache(cacheDir, cache) {
  await fs.mkdir(cacheDir, { recursive: true });
  await fs.writeFile(
    path.join(cacheDir, CACHE_FILENAME),
    JSON.stringify(cache, null, 2),
    "utf8"
  );
}

/**
 * Filter rendered pages to only those whose content has changed.
 * Returns { changedPages, unchangedKeys, newCache }.
 */
export function filterChangedDocs(renderedPages, previousCache) {
  const newCache = {};
  const changedPages = {};
  const unchangedKeys = [];

  for (const [key, content] of Object.entries(renderedPages)) {
    const hash = hashContent(content);
    newCache[key] = hash;

    if (previousCache[key] === hash) {
      unchangedKeys.push(key);
    } else {
      changedPages[key] = content;
    }
  }

  return { changedPages, unchangedKeys, newCache };
}

/**
 * Format duration in human-readable form.
 */
function formatAge(ms) {
  if (ms < 60000) return `${Math.round(ms / 1000)}s ago`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}m ago`;
  if (ms < 86400000) return `${Math.round(ms / 3600000)}h ago`;
  return `${Math.round(ms / 86400000)}d ago`;
}

/**
 * Log cache statistics.
 */
export function logCacheStats(changedCount, unchangedCount, cacheAge = null) {
  const total = changedCount + unchangedCount;
  const ageStr = cacheAge ? ` (last run: ${formatAge(cacheAge)})` : "";
  if (unchangedCount > 0) {
    info(`Cache: ${unchangedCount}/${total} documents unchanged, skipping. ${changedCount} to publish.${ageStr}`);
  } else {
    info(`Cache: All ${total} documents changed or new.${ageStr}`);
  }
}
