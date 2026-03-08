const isVerbose = process.argv.includes("--verbose");
const isTest = process.env.NODE_ENV === "test";

export function log(...args) {
  if (!isTest && isVerbose) {
    console.log("[RepoLens]", ...args);
  }
}

export function info(...args) {
  if (!isTest) {
    console.log("[RepoLens]", ...args);
  }
}

export function warn(...args) {
  if (!isTest) {
    console.warn("[RepoLens]", ...args);
  }
}

export function error(...args) {
  if (!isTest) {
    console.error("[RepoLens]", ...args);
  }
}