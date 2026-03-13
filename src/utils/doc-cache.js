/**
 * Hash-based document cache.
 * Compares rendered content hashes to avoid redundant publisher API calls.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { info } from "./logger.js";

const CACHE_FILENAME = "doc-hashes.json";

/**
 * Hash a string using SHA-256.
 */
function hashContent(content) {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

/**
 * Load the previous cache from disk.
 * @returns {Record<string, string>} Map of docKey → contentHash
 */
export async function loadDocCache(cacheDir) {
  try {
    const raw = await fs.readFile(path.join(cacheDir, CACHE_FILENAME), "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
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
 * Log cache statistics.
 */
export function logCacheStats(changedCount, unchangedCount) {
  const total = changedCount + unchangedCount;
  if (unchangedCount > 0) {
    info(`Cache: ${unchangedCount}/${total} documents unchanged, skipping. ${changedCount} to publish.`);
  } else {
    info(`Cache: All ${total} documents changed or new.`);
  }
}
