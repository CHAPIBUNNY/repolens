// Resolve a human project name for a directory (never "." or "..").
// Order: package.json name, Gradle rootProject.name, the git remote's repository
// name (only when the directory is the repository root), the Maven artifactId,
// a .NET solution name, then the folder name. A clone into `tk/` is still `terrakube`.

import fs from "node:fs";
import path from "node:path";
import { trimTrailingSlashes } from "./path-roles.js";

const MAX_NAME = 214;

function readText(file, limit = 512 * 1024) {
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > limit) return null;
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

function clean(name) {
  if (typeof name !== "string") return null;
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > MAX_NAME || trimmed === "." || trimmed === "..") return null;
  if (/[\r\n<>"`]/.test(trimmed)) return null;
  return trimmed;
}

function packageJsonName(dir) {
  const raw = readText(path.join(dir, "package.json"));
  if (!raw) return null;
  try {
    return clean(JSON.parse(raw)?.name);
  } catch {
    return null; // not valid JSON
  }
}

function gradleRootProjectName(dir) {
  for (const file of ["settings.gradle.kts", "settings.gradle"]) {
    const raw = readText(path.join(dir, file));
    if (!raw) continue;
    const source = raw.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
    const match = source.match(/rootProject\.name\s*=\s*(['"])([^'"\n]+)\1/);
    if (match) return clean(match[2]);
  }
  return null;
}

// The `.git` config of a repository rooted at `dir`. A worktree or submodule has
// a `.git` file pointing at its git dir; a worktree's config lives in the common dir.
function gitConfigPath(dir) {
  const dotGit = path.join(dir, ".git");
  let stat;
  try {
    stat = fs.statSync(dotGit);
  } catch {
    return null;
  }
  if (stat.isDirectory()) return path.join(dotGit, "config");
  const pointer = readText(dotGit, 4096);
  const line = pointer && pointer.split(/\r?\n/).find((text) => text.startsWith("gitdir:"));
  const target = line ? line.slice("gitdir:".length).trim() : "";
  if (!target) return null;
  const gitDir = path.resolve(dir, target);
  const common = readText(path.join(gitDir, "commondir"), 4096);
  const base = common ? path.resolve(gitDir, common.trim()) : gitDir;
  return path.join(base, "config");
}

/** Repository name from a git remote URL (`https://host/org/repo.git`, `git@host:org/repo`). */
export function repoNameFromRemoteUrl(url) {
  if (typeof url !== "string") return null;
  const trimmed = trimTrailingSlashes(url.trim().replace(/[?#].*$/, ""));
  if (!trimmed) return null;
  const last = trimmed.split(/[/:]/).pop() || "";
  return clean(last.replace(/\.git$/i, ""));
}

function gitRemoteName(dir) {
  const configFile = gitConfigPath(dir);
  if (!configFile) return null;
  const raw = readText(configFile);
  if (!raw) return null;
  const remotes = new Map();
  let current = null;
  for (const line of raw.split(/\r?\n/)) {
    const section = line.match(/^\s*\[\s*remote\s+"([^"]+)"\s*\]\s*$/);
    if (section) {
      current = section[1];
      continue;
    }
    if (/^\s*\[/.test(line)) {
      current = null;
      continue;
    }
    if (!current) continue;
    const eq = line.indexOf("=");
    if (eq === -1 || line.slice(0, eq).trim() !== "url") continue;
    const url = line.slice(eq + 1).trim();
    if (url && !remotes.has(current)) remotes.set(current, url);
  }
  const url = remotes.get("origin") || remotes.get("upstream") || [...remotes.values()][0];
  return repoNameFromRemoteUrl(url);
}

function mavenArtifactName(dir) {
  const raw = readText(path.join(dir, "pom.xml"));
  if (!raw) return null;
  // The project's own artifactId, not the <parent> one or a dependency's.
  const body = raw
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<parent>[\s\S]*?<\/parent>/g, " ")
    .replace(/<(dependencies|dependencyManagement|build|profiles|modules|plugins|reporting|distributionManagement)>[\s\S]*?<\/\1>/g, " ");
  const match = body.match(/<artifactId>\s*([^<\s]+)\s*<\/artifactId>/);
  if (!match) return null;
  const stripped = match[1].replace(/-(parent|root|aggregator|reactor|build|project|platform|all|bom)$/i, "");
  return clean(stripped || match[1]);
}

function dotnetSolutionName(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return null;
  }
  const solutions = entries.filter((name) => /\.slnx?$/i.test(name)).sort();
  if (solutions.length !== 1) return null;
  return clean(solutions[0].replace(/\.slnx?$/i, ""));
}

/**
 * Name for a project directory. `--target .` resolves to the real directory;
 * repository or build metadata wins over the folder name when there is one.
 */
export function detectProjectName(dir, fallback = "my-project") {
  const resolved = path.resolve(dir || ".");
  return packageJsonName(resolved)
    || gradleRootProjectName(resolved)
    || gitRemoteName(resolved)
    || mavenArtifactName(resolved)
    || dotnetSolutionName(resolved)
    || path.basename(resolved)
    || fallback;
}
