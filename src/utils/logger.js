import { sanitizeSecrets } from "./secrets.js";

export const isVerbose = process.argv.includes("--verbose");
const isTest = process.env.NODE_ENV === "test";

// Terminal color support detection
const supportsColor = !process.env.NO_COLOR && 
  (process.env.FORCE_COLOR || 
   (process.stdout.isTTY && process.env.TERM !== "dumb"));

// ANSI color codes
const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  brightGreen: "\x1b[92m",
  brightCyan: "\x1b[96m",
  brightYellow: "\x1b[93m",
};

/**
 * Apply color formatting to text (respects NO_COLOR)
 */
export function colorize(text, ...styles) {
  if (!supportsColor) return text;
  const codes = styles.map(s => colors[s] || "").join("");
  return `${codes}${text}${colors.reset}`;
}

/**
 * Shorthand color helpers
 */
export const fmt = {
  bold: (text) => colorize(text, "bold"),
  green: (text) => colorize(text, "green"),
  brightGreen: (text) => colorize(text, "brightGreen"),
  cyan: (text) => colorize(text, "cyan"),
  brightCyan: (text) => colorize(text, "brightCyan"),
  yellow: (text) => colorize(text, "yellow"),
  brightYellow: (text) => colorize(text, "brightYellow"),
  magenta: (text) => colorize(text, "magenta"),
  dim: (text) => colorize(text, "dim"),
  // Combined styles
  boldGreen: (text) => colorize(text, "bold", "brightGreen"),
  boldCyan: (text) => colorize(text, "bold", "brightCyan"),
  boldYellow: (text) => colorize(text, "bold", "brightYellow"),
};

/**
 * Sanitize arguments for logging
 */
function sanitizeArgs(args) {
  return args.map(arg => {
    if (typeof arg === "string") {
      return sanitizeSecrets(arg);
    }
    if (typeof arg === "object" && arg !== null) {
      return JSON.parse(sanitizeSecrets(JSON.stringify(arg)));
    }
    return arg;
  });
}

export function log(...args) {
  if (!isTest && isVerbose) {
    console.log("[RepoLens]", ...sanitizeArgs(args));
  }
}

/**
 * Verbose-only logging (alias for log, for semantic clarity).
 * Only outputs when --verbose flag is present.
 */
export function verbose(...args) {
  if (!isTest && isVerbose) {
    console.log("[RepoLens]", ...sanitizeArgs(args));
  }
}

export function info(...args) {
  if (!isTest) {
    console.log("[RepoLens]", ...sanitizeArgs(args));
  }
}

export function warn(...args) {
  if (!isTest) {
    console.warn("[RepoLens]", ...sanitizeArgs(args));
  }
}

export function error(...args) {
  if (!isTest) {
    console.error("[RepoLens]", ...sanitizeArgs(args));
  }
}