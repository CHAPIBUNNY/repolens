import { sanitizeSecrets } from "./secrets.js";

const isVerbose = process.argv.includes("--verbose");
const isTest = process.env.NODE_ENV === "test";

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