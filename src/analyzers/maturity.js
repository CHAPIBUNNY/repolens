// Project maturity from observable signals (release version, history, tests, CI, docs, dependency health)

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

function exists(root, rel) {
  try {
    return fs.existsSync(path.join(root, rel));
  } catch {
    return false;
  }
}

function readText(root, rel) {
  try {
    return fs.readFileSync(path.join(root, rel), "utf8");
  } catch {
    return null;
  }
}

/** Declared project version from package.json, Cargo.toml, or pyproject.toml. */
export function detectDeclaredVersion(root) {
  const pkg = readText(root, "package.json");
  if (pkg) {
    try {
      const version = JSON.parse(pkg)?.version;
      if (typeof version === "string") return version;
    } catch {
      // ignore invalid JSON
    }
  }
  for (const file of ["Cargo.toml", "pyproject.toml"]) {
    const text = readText(root, file);
    const match = text && text.match(/^\s*version\s*=\s*["']([^"']+)["']/m);
    if (match) return match[1];
  }
  return null;
}

export function majorVersion(version) {
  const match = String(version || "").match(/^v?(\d+)\./);
  return match ? Number(match[1]) : null;
}

function git(root, args) {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 5000 }).trim();
  } catch {
    return null;
  }
}

/** Git facts, or null when `root` is not a git checkout. Shallow clones report `shallow: true`. */
export function detectGitHistory(root) {
  if (git(root, ["rev-parse", "--is-inside-work-tree"]) !== "true") return null;
  const shallow = git(root, ["rev-parse", "--is-shallow-repository"]) === "true";
  const tagOutput = git(root, ["tag", "--list"]);
  const tags = tagOutput ? tagOutput.split("\n").filter(Boolean).length : 0;
  let firstCommitMs = null;
  if (!shallow) {
    const roots = git(root, ["log", "--max-parents=0", "--format=%ct", "HEAD"]);
    const stamps = (roots || "").split("\n").map(Number).filter((n) => Number.isFinite(n) && n > 0);
    if (stamps.length) firstCommitMs = Math.min(...stamps) * 1000;
  }
  return { shallow, tags, firstCommitMs };
}

function detectCI(root) {
  if (exists(root, ".github/workflows")) {
    try {
      if (fs.readdirSync(path.join(root, ".github/workflows")).some((f) => /\.ya?ml$/.test(f))) return true;
    } catch {
      // fall through
    }
  }
  return [".gitlab-ci.yml", ".travis.yml", "appveyor.yml", ".circleci/config.yml", "azure-pipelines.yml", "Jenkinsfile", ".drone.yml", "bitbucket-pipelines.yml"]
    .some((file) => exists(root, file));
}

function detectDocs(root) {
  const hasReadme = ["README.md", "README.rst", "README.txt", "README"].some((f) => exists(root, f));
  const hasDocsDir = ["docs", "doc"].some((d) => exists(root, d));
  const hasContributing = exists(root, "CONTRIBUTING.md");
  return hasReadme && (hasDocsDir || hasContributing);
}

/**
 * Build maturity signals. A signal with `met: null` could not be measured
 * (for example commit age in a shallow clone) and is left out of the total.
 */
export function collectMaturitySignals(root, { hasTests = false, cycles = null, now = Date.now(), version, git: gitInfo } = {}) {
  const declared = version === undefined ? detectDeclaredVersion(root) : version;
  const major = majorVersion(declared);
  const history = gitInfo === undefined ? detectGitHistory(root) : gitInfo;

  const signals = [];
  signals.push({
    key: "version",
    label: "Stable release version",
    met: major === null ? null : major >= 1,
    detail: declared ? `v${declared}` : "no version declared",
  });

  const tags = history?.tags ?? 0;
  signals.push({
    key: "releases",
    label: "Release history",
    met: major === null && !history ? null : tags >= 5 || (major !== null && major >= 5),
    detail: tags ? `${tags} tags` : major !== null ? `major version ${major}` : "no tags",
  });

  let ageMet = null;
  let ageDetail = history?.shallow ? "shallow clone, history unavailable" : "no git history";
  if (history?.firstCommitMs) {
    const years = (now - history.firstCommitMs) / (365.25 * 24 * 3600 * 1000);
    ageMet = years >= 1;
    ageDetail = `${years.toFixed(1)} years of history`;
  }
  signals.push({ key: "history", label: "Commit history over a year", met: ageMet, detail: ageDetail });

  signals.push({ key: "tests", label: "Automated tests", met: Boolean(hasTests), detail: hasTests ? "test framework detected" : "none detected" });
  const ci = detectCI(root);
  signals.push({ key: "ci", label: "Continuous integration", met: ci, detail: ci ? "CI config found" : "none found" });
  const docs = detectDocs(root);
  signals.push({ key: "docs", label: "Documentation", met: docs, detail: docs ? "README plus docs" : "README only or missing" });
  signals.push({
    key: "deps",
    label: "No circular dependencies",
    met: cycles === null || cycles === undefined ? null : cycles === 0,
    detail: cycles ? `${cycles} cycle${cycles === 1 ? "" : "s"}` : "none",
  });
  return signals;
}

export function scoreMaturity(signals) {
  const measured = signals.filter((s) => s.met !== null);
  const score = measured.filter((s) => s.met).length;
  const max = measured.length;
  const ratio = max ? score / max : 0;
  const declaredVersion = signals.find((s) => s.key === "version");
  let label = ratio >= 0.7 ? "Production-grade" : ratio >= 0.45 ? "Well-structured" : "Early-stage";
  // A project with a stable major version and several release signals is never "early-stage".
  if (label === "Early-stage" && declaredVersion?.met && score >= 3) label = "Well-structured";
  return { score, max, label, signals };
}

export function detectMaturity(root, options = {}) {
  return scoreMaturity(collectMaturitySignals(root, options));
}
