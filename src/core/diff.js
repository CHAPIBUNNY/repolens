import { execSync } from "node:child_process";
import { warn } from "../utils/logger.js";

export function getGitDiff(baseRef = "origin/main") {
  let output = "";

  try {
    output = execSync(`git diff --name-status ${baseRef}`, {
      encoding: "utf8"
    });
  } catch (error) {
    warn("git diff failed, returning empty diff.");
    return {
      added: [],
      removed: [],
      modified: []
    };
  }

  const lines = output.split("\n").filter(Boolean);

  const added = [];
  const removed = [];
  const modified = [];

  for (const line of lines) {
    const [status, file] = line.split("\t");

    if (!file) continue;

    if (status === "A") {
      added.push(file);
    } else if (status === "D") {
      removed.push(file);
    } else {
      modified.push(file);
    }
  }

  return {
    added,
    removed,
    modified
  };
}