import { execSync } from "node:child_process";

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
    const branch = execSync("git rev-parse --abbrev-ref HEAD", {
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

  // Check if current branch matches any allowed pattern
  return config.notion.branches.some(pattern => {
    // Exact match
    if (pattern === currentBranch) {
      return true;
    }

    // Wildcard pattern (simple glob)
    if (pattern.includes("*")) {
      const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
      return regex.test(currentBranch);
    }

    return false;
  });
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

  // Check if current branch matches any allowed pattern
  return config.confluence.branches.some(pattern => {
    // Exact match
    if (pattern === currentBranch) {
      return true;
    }

    // Wildcard pattern (simple glob)
    if (pattern.includes("*")) {
      const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
      return regex.test(currentBranch);
    }

    return false;
  });
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
