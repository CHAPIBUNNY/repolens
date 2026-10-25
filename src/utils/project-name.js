// Resolve a human project name for a directory (never "." or "..")

import fs from "node:fs";
import path from "node:path";

function packageJsonName(dir) {
  try {
    const raw = fs.readFileSync(path.join(dir, "package.json"), "utf8");
    const name = JSON.parse(raw)?.name;
    if (typeof name === "string" && name.trim() && name.length <= 214) return name.trim();
  } catch {
    // no package.json or not valid JSON
  }
  return null;
}

/**
 * Name for a project directory. `--target .` resolves to the real directory,
 * and a package.json name wins over the folder name when there is one.
 */
export function detectProjectName(dir, fallback = "my-project") {
  const resolved = path.resolve(dir || ".");
  return packageJsonName(resolved) || path.basename(resolved) || fallback;
}
