import { execFileSync } from "node:child_process";
import { warn } from "../utils/logger.js";

const SAFE_REF = /^[A-Za-z0-9._~^/@+-]+$/;

function emptyDiff() {
  return { added: [], removed: [], modified: [] };
}

/**
 * True when `ref` can be passed as one git argument.
 * Rejects flag-like values and shell metacharacters.
 */
export function isSafeGitRef(ref) {
  return typeof ref === "string" && ref.length > 0 && !ref.startsWith("-") && SAFE_REF.test(ref);
}

/**
 * Classify one `git diff --name-status` line.
 * Renames and copies (`R100`, `C75`) record the destination path.
 */
export function classifyDiffLine(line) {
  const parts = String(line || "").split("\t");
  const status = parts[0];
  if (!status) return null;

  const file = status.startsWith("R") || status.startsWith("C")
    ? parts[2] || parts[1]
    : parts[1];
  if (!file) return null;

  if (status === "A") return { bucket: "added", file };
  if (status === "D") return { bucket: "removed", file };
  return { bucket: "modified", file };
}

/**
 * Plain message for a failed git diff.
 * A directory that is not a repository says so. The old internal
 * "git diff failed, returning empty diff" line is not used.
 */
export function gitDiffFailureMessage(stderr = "", message = "") {
  const text = `${stderr}\n${message}`;
  if (/not a git repository/i.test(text)) {
    return "not a git repository";
  }
  return "git diff could not be read; continuing with an empty diff.";
}

export function getGitDiff(baseRef = "origin/main", cwd = process.cwd(), headRef) {
  if (!isSafeGitRef(baseRef)) {
    warn("git diff skipped: base ref contains unsupported characters.");
    return emptyDiff();
  }

  const args = ["diff", "--name-status", baseRef];
  if (headRef != null && headRef !== "") {
    if (!isSafeGitRef(headRef)) {
      warn("git diff skipped: head ref contains unsupported characters.");
      return emptyDiff();
    }
    args.push(headRef);
  }

  let output = "";

  try {
    // Pipe stderr so a missing repo or ref does not dump git's usage text.
    // Arguments stay in an array. Refs are checked by isSafeGitRef first.
    output = execFileSync("git", args, {
      encoding: "utf8",
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const stderr = typeof error.stderr === "string" ? error.stderr : "";
    warn(gitDiffFailureMessage(stderr, error.message));
    return emptyDiff();
  }

  const lines = output.split("\n").filter(Boolean);

  const added = [];
  const removed = [];
  const modified = [];

  for (const line of lines) {
    const classified = classifyDiffLine(line);
    if (!classified) continue;
    if (classified.bucket === "added") added.push(classified.file);
    else if (classified.bucket === "removed") removed.push(classified.file);
    else modified.push(classified.file);
  }

  return {
    added,
    removed,
    modified
  };
}