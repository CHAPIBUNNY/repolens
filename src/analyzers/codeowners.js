// CODEOWNERS file parser
// Maps file paths to team/individual owners

import fs from "node:fs/promises";
import path from "node:path";
import { info } from "../utils/logger.js";

/**
 * Parse CODEOWNERS file and return ownership rules.
 * Searches standard locations: CODEOWNERS, .github/CODEOWNERS, docs/CODEOWNERS
 */
export async function parseCodeowners(repoRoot) {
  const locations = [
    path.join(repoRoot, "CODEOWNERS"),
    path.join(repoRoot, ".github", "CODEOWNERS"),
    path.join(repoRoot, "docs", "CODEOWNERS"),
  ];

  for (const loc of locations) {
    try {
      const content = await fs.readFile(loc, "utf8");
      const rules = parseRules(content);
      if (rules.length > 0) {
        info(`CODEOWNERS loaded from ${path.relative(repoRoot, loc)} (${rules.length} rules)`);
        return { found: true, file: path.relative(repoRoot, loc), rules };
      }
    } catch {
      // File doesn't exist, try next
    }
  }

  return { found: false, file: null, rules: [] };
}

/**
 * Parse CODEOWNERS content into pattern→owners rules.
 */
function parseRules(content) {
  const rules = [];

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const parts = trimmed.split(/\s+/);
    if (parts.length < 2) continue;

    const pattern = parts[0];
    const owners = parts.slice(1).filter(o => o.startsWith("@") || o.includes("@"));

    if (owners.length > 0) {
      rules.push({ pattern, owners });
    }
  }

  return rules;
}

/**
 * Find owners for a given file path using CODEOWNERS rules.
 * Rules are matched last-match-wins (same as GitHub behavior).
 */
export function findOwners(filePath, rules) {
  let matched = [];

  for (const rule of rules) {
    if (matchPattern(filePath, rule.pattern)) {
      matched = rule.owners;
    }
  }

  return matched;
}

/**
 * Match a file path against a CODEOWNERS pattern.
 * Supports: *, **, directory patterns, exact matches.
 */
function matchPattern(filePath, pattern) {
  const normalized = filePath.replace(/\\/g, "/");

  // Remove leading slash for consistency
  const cleanPattern = pattern.startsWith("/") ? pattern.slice(1) : pattern;

  // Directory pattern (e.g., "src/")
  if (cleanPattern.endsWith("/")) {
    return normalized.startsWith(cleanPattern) || normalized.includes(`/${cleanPattern}`);
  }

  // Convert glob to regex
  let regex = cleanPattern
    .replace(/\./g, "\\.")
    .replace(/\*\*/g, "<<DOUBLESTAR>>")
    .replace(/\*/g, "[^/]*")
    .replace(/<<DOUBLESTAR>>/g, ".*");

  // If pattern has no path separator, match anywhere in path
  if (!cleanPattern.includes("/")) {
    regex = `(^|/)${regex}($|/)`;
  } else {
    regex = `(^|/)${regex}$`;
  }

  try {
    return new RegExp(regex).test(normalized);
  } catch {
    return false;
  }
}

/**
 * Build an ownership summary for modules.
 * Returns a map of modulePath → owners[].
 */
export function buildOwnershipMap(modules, files, rules) {
  if (!rules || rules.length === 0) return {};

  const ownershipMap = {};

  for (const mod of modules) {
    const moduleFiles = files.filter(f => {
      const normalized = f.replace(/\\/g, "/");
      return normalized.startsWith(mod.key + "/") || normalized === mod.key;
    });

    // Find owners for representative files in this module
    const ownerCounts = {};
    for (const file of moduleFiles) {
      const owners = findOwners(file, rules);
      for (const owner of owners) {
        ownerCounts[owner] = (ownerCounts[owner] || 0) + 1;
      }
    }

    // Primary owners are those who own the most files in this module
    const sortedOwners = Object.entries(ownerCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([owner]) => owner);

    if (sortedOwners.length > 0) {
      ownershipMap[mod.key] = sortedOwners;
    }
  }

  return ownershipMap;
}
