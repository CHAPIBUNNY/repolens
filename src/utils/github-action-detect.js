// GitHub Action detection: an `action.yml` / `action.yaml` at the repository root whose
// `runs.using` is a JavaScript runtime (`node20`, `node24`), `composite`, or `docker`.
// Line parsing, not a YAML library: only the top-level `runs:` block is read.

import fs from "node:fs";
import path from "node:path";

const RUNTIME = /^(node\d+|composite|docker)$/;

function readSmall(file) {
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > 256 * 1024) return null;
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

function scalar(value) {
  let text = value;
  const hash = text.indexOf(" #");
  if (hash !== -1) text = text.slice(0, hash);
  text = text.trim();
  if (text.length >= 2 && (text[0] === "'" || text[0] === '"') && text[text.length - 1] === text[0]) {
    text = text.slice(1, -1).trim();
  }
  return text;
}

/** `{ file, using, main, name }` for a root action, or null. */
export function parseActionManifest(text) {
  const lines = String(text || "").split(/\r?\n/);
  let name = null;
  let inRuns = false;
  let using = null;
  let main = null;
  for (const line of lines) {
    if (/^\S/.test(line)) {
      inRuns = /^runs\s*:\s*(#.*)?$/.test(line);
      const nameMatch = line.match(/^name\s*:(.*)$/);
      if (nameMatch) name = scalar(nameMatch[1]) || null;
      continue;
    }
    if (!inRuns) continue;
    const match = line.match(/^\s+(using|main|image)\s*:(.*)$/);
    if (!match) continue;
    if (match[1] === "using" && using == null) using = scalar(match[2]).toLowerCase();
    else if (match[1] === "main" && main == null) main = scalar(match[2]);
  }
  if (!using || !RUNTIME.test(using)) return null;
  return { using, main, name };
}

export function detectGitHubAction(repoRoot) {
  for (const file of ["action.yml", "action.yaml"]) {
    const text = readSmall(path.join(repoRoot, file));
    if (text == null) continue;
    const parsed = parseActionManifest(text);
    if (parsed) return { file, ...parsed };
  }
  return null;
}
