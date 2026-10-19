import { execFileSync } from "node:child_process";

/**
 * Detect the current git branch from various sources
 * Priority: CI environment → git command → fallback
 */
export function getCurrentBranch() {
  // 1. Check GitHub Actions environment
  if (process.env.GITHUB_REF_NAME) {
    return process.env.GITHUB_REF_NAME;
  }

  // 2. Check GitLab CI environment
  if (process.env.CI_COMMIT_REF_NAME) {
    return process.env.CI_COMMIT_REF_NAME;
  }

  // 3. Check CircleCI environment
  if (process.env.CIRCLE_BRANCH) {
    return process.env.CIRCLE_BRANCH;
  }

  // 4. Try git command
  try {
    const branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"]
    }).trim();
    
    if (branch && branch !== "HEAD") {
      return branch;
    }
  } catch {
    // Git command failed, continue to fallback
  }

  // 5. Fallback
  return "unknown";
}

/**
 * Normalize branch name for display (sanitize special characters)
 */
export function normalizeBranchName(branch) {
  return branch
    .replace(/\//g, "-")  // feature/auth → feature-auth
    .replace(/[^a-zA-Z0-9-_]/g, "")  // Remove special chars
    .toLowerCase();
}

/**
 * Match a branch name against an exact value or a simple `*` glob.
 * Regex metacharacters in the pattern are escaped so a bad config cannot
 * throw or widen the match.
 */
export function branchMatches(pattern, branch) {
  if (pattern === branch) return true;
  if (typeof pattern !== "string" || typeof branch !== "string" || !pattern.includes("*")) {
    return false;
  }
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`).test(branch);
}

function matchesAnyBranch(patterns, currentBranch) {
  return patterns.some((pattern) => branchMatches(pattern, currentBranch));
}

/**
 * Check if current branch should publish to Notion
 * Based on config.notion.branches setting
 */
export function shouldPublishToNotion(config, currentBranch = getCurrentBranch()) {
  // If no notion config, allow all branches (backward compatible)
  if (!config.notion) {
    return true;
  }

  // If branches not specified, allow all
  if (!config.notion.branches || config.notion.branches.length === 0) {
    return true;
  }

  return matchesAnyBranch(config.notion.branches, currentBranch);
}

/**
 * Check if current branch should publish to Confluence
 * Based on config.confluence.branches setting
 */
export function shouldPublishToConfluence(config, currentBranch = getCurrentBranch()) {
  // If no confluence config, allow all branches (backward compatible)
  if (!config.confluence) {
    return true;
  }

  // If branches not specified, allow all
  if (!config.confluence.branches || config.confluence.branches.length === 0) {
    return true;
  }

  return matchesAnyBranch(config.confluence.branches, currentBranch);
}

/**
 * Check if current branch should publish to GitHub Wiki
 * Based on config.github_wiki.branches setting
 */
export function shouldPublishToGitHubWiki(config, currentBranch = getCurrentBranch()) {
  if (!config.github_wiki) {
    return true;
  }

  if (!config.github_wiki.branches || config.github_wiki.branches.length === 0) {
    return true;
  }

  return matchesAnyBranch(config.github_wiki.branches, currentBranch);
}

/**
 * Check if current branch should publish to an Obsidian vault.
 * Based on config.obsidian.branches setting.
 */
export function shouldPublishToObsidian(config, currentBranch = getCurrentBranch()) {
  if (!config.obsidian) {
    return true;
  }

  if (!config.obsidian.branches || config.obsidian.branches.length === 0) {
    return true;
  }

  return matchesAnyBranch(config.obsidian.branches, currentBranch);
}

/**
 * Get branch-qualified page title
 */
export function getBranchQualifiedTitle(baseTitle, branch = getCurrentBranch(), includeBranch = true) {
  if (!includeBranch || branch === "main" || branch === "master") {
    return baseTitle;
  }

  const normalizedBranch = normalizeBranchName(branch);
  return `${baseTitle} [${normalizedBranch}]`;
}
