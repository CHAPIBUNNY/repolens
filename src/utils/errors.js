/**
 * Enhanced error messages with actionable guidance.
 * Each error includes a description, likely cause, and fix.
 */

const ERROR_CATALOG = {
  CONFIG_NOT_FOUND: {
    message: "RepoLens config not found (.repolens.yml)",
    cause: "No .repolens.yml file was found in the current directory or any parent directory.",
    fix: "Run 'repolens init' to create one, or use --config to specify a path.",
  },
  CONFIG_PARSE_FAILED: {
    message: "Failed to parse .repolens.yml",
    cause: "The configuration file contains invalid YAML syntax.",
    fix: "Check .repolens.yml for YAML syntax errors (incorrect indentation, missing colons, etc.).",
  },
  CONFIG_VALIDATION_FAILED: {
    message: "Configuration validation failed",
    cause: "The configuration file is missing required fields or contains invalid values.",
    fix: "Run 'repolens doctor' to identify specific issues, or compare with .repolens.example.yml.",
  },
  NOTION_TOKEN_MISSING: {
    message: "NOTION_TOKEN not set",
    cause: "The Notion integration token is not configured.",
    fix: "Add NOTION_TOKEN to your .env file or GitHub Actions secrets.\n  → Get a token at https://notion.so/my-integrations",
  },
  NOTION_PAGE_ID_MISSING: {
    message: "NOTION_PARENT_PAGE_ID not set",
    cause: "The Notion parent page ID is not configured.",
    fix: "Add NOTION_PARENT_PAGE_ID to your .env file or GitHub Actions secrets.\n  → Open your Notion page, copy the 32-char ID from the URL.",
  },
  NOTION_API_ERROR: {
    message: "Notion API request failed",
    cause: "The Notion API returned an error. Common causes: invalid token, page not shared with integration, rate limit hit.",
    fix: "1. Verify NOTION_TOKEN is correct\n  2. Ensure the parent page is shared with your RepoLens integration\n  3. Check https://status.notion.so for API outages",
  },
  CONFLUENCE_SECRETS_MISSING: {
    message: "Confluence credentials not configured",
    cause: "One or more required Confluence environment variables are missing.",
    fix: "Set these environment variables: CONFLUENCE_URL, CONFLUENCE_EMAIL, CONFLUENCE_API_TOKEN, CONFLUENCE_SPACE_KEY\n  → Generate a token at https://id.atlassian.com/manage-profile/security/api-tokens",
  },
  CONFLUENCE_API_ERROR: {
    message: "Confluence API request failed",
    cause: "The Confluence API returned an error. Common causes: invalid credentials, wrong space key, permission denied.",
    fix: "1. Verify CONFLUENCE_EMAIL and CONFLUENCE_API_TOKEN are correct\n  2. Confirm the space key exists\n  3. Check that your account has write access to the space",
  },
  SCAN_NO_FILES: {
    message: "No files matched scan patterns",
    cause: "The scan.include patterns in .repolens.yml didn't match any files.",
    fix: "1. Check that scan.include patterns match your project structure\n  2. Ensure scan.ignore isn't excluding everything\n  3. Run 'repolens doctor' to validate your config",
  },
  SCAN_TOO_MANY_FILES: {
    message: "Repository exceeds file limit (50,000 files)",
    cause: "The scan patterns matched too many files, which would cause performance issues.",
    fix: "Narrow your scan.include patterns or add more entries to scan.ignore.",
  },
  AI_API_KEY_MISSING: {
    message: "AI API key not set",
    cause: "REPOLENS_AI_ENABLED is true but no API key is configured.",
    fix: "Add REPOLENS_AI_API_KEY to your .env file, or disable AI with REPOLENS_AI_ENABLED=false",
  },
  AI_API_ERROR: {
    message: "AI provider returned an error",
    cause: "The AI API request failed. Common causes: invalid key, quota exceeded, model unavailable.",
    fix: "1. Verify your API key is valid and has credits\n  2. Check that the model name is correct\n  3. AI docs will fall back to deterministic mode automatically",
  },
  DISCORD_WEBHOOK_INVALID: {
    message: "Discord webhook URL is invalid",
    cause: "The DISCORD_WEBHOOK_URL environment variable doesn't contain a valid Discord webhook URL.",
    fix: "Set DISCORD_WEBHOOK_URL to a valid webhook URL from Discord (Server Settings → Integrations → Webhooks).",
  },
  FILE_PERMISSION_DENIED: {
    message: "Permission denied",
    cause: "RepoLens doesn't have permission to read or write the specified file.",
    fix: "Check file permissions and ensure the current user has read/write access.",
  },
  FILE_NOT_FOUND: {
    message: "File not found",
    cause: "A required file doesn't exist at the expected path.",
    fix: "Check that all required files exist. Run 'repolens init' to recreate missing files.",
  },
};

/**
 * Create an enhanced error with actionable guidance.
 * @param {string} code - Error code from ERROR_CATALOG
 * @param {string} [detail] - Additional detail/context
 * @returns {Error}
 */
export function createRepoLensError(code, detail) {
  const entry = ERROR_CATALOG[code];
  if (!entry) {
    const err = new Error(detail || code);
    err.code = code;
    return err;
  }

  const parts = [entry.message];
  if (detail) parts.push(`  ${detail}`);
  parts.push(`  → Cause: ${entry.cause}`);
  parts.push(`  → Fix: ${entry.fix}`);

  const err = new Error(parts.join("\n"));
  err.code = code;
  return err;
}

/**
 * Format an error with guidance for display.
 * Falls back to the raw message if the error code isn't recognized.
 * @param {string} code - Error code from ERROR_CATALOG
 * @param {Error|string} [originalError] - The original error or context
 * @returns {string} Formatted error string
 */
export function formatError(code, originalError) {
  const entry = ERROR_CATALOG[code];
  if (!entry) {
    return typeof originalError === "string" ? originalError : originalError?.message || code;
  }

  const detail = typeof originalError === "string"
    ? originalError
    : originalError?.message;

  const lines = [`Error: ${entry.message}`];
  if (detail) lines.push(`  ${detail}`);
  lines.push(`  → Cause: ${entry.cause}`);
  lines.push(`  → Fix: ${entry.fix}`);
  return lines.join("\n");
}

export { ERROR_CATALOG };
