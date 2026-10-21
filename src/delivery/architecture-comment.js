import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { classifyDiffLine, isSafeGitRef } from "../core/diff.js";
import { buildArchitectureDiffData } from "../renderers/renderDiff.js";
import { fetchWithRetry } from "../utils/retry.js";
import { assertGitHubRepo } from "../utils/github-repo.js";
import { sanitizeSecrets } from "../utils/secrets.js";
import { scoreRepository } from "../badge.js";
import {
  ARCHITECTURE_COMMENT_MARKER,
  COMMENT_FOOTER,
  isArchitectureComment,
} from "./comment-constants.js";

const SHA = /^[0-9a-f]{40}$/i;

function emptyDiff() {
  return { added: [], removed: [], modified: [] };
}

function parseNameStatus(output) {
  const added = [];
  const removed = [];
  const modified = [];
  for (const line of String(output || "").split("\n")) {
    if (!line) continue;
    const classified = classifyDiffLine(line);
    if (!classified) continue;
    if (classified.bucket === "added") added.push(classified.file);
    else if (classified.bucket === "removed") removed.push(classified.file);
    else modified.push(classified.file);
  }
  return { added, removed, modified };
}

function gitDiff(cwd, specArgs) {
  try {
    const output = execFileSync(
      "git",
      ["-c", "safe.directory=*", "diff", "--name-status", ...specArgs],
      { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 10 * 1024 * 1024 },
    );
    return parseNameStatus(output);
  } catch {
    return null;
  }
}

export function diffBetweenRefs(cwd, base, head) {
  if (!isSafeGitRef(base) || !isSafeGitRef(head)) return emptyDiff();
  const triple = `${base}...${head}`;
  if (isSafeGitRef(triple)) {
    const ranged = gitDiff(cwd, [triple]);
    if (ranged) return ranged;
  }
  return gitDiff(cwd, [base, head]) || emptyDiff();
}

export async function withGitWorktree(repo, ref, fn) {
  if (!isSafeGitRef(ref)) {
    throw new Error("git ref contains unsupported characters");
  }
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-wt-"));
  const dir = path.join(parent, "tree");
  try {
    execFileSync(
      "git",
      ["-c", "safe.directory=*", "worktree", "add", "--detach", "--quiet", dir, ref],
      { cwd: repo, stdio: ["ignore", "pipe", "pipe"] },
    );
    return await fn(dir);
  } finally {
    try {
      execFileSync(
        "git",
        ["-c", "safe.directory=*", "worktree", "remove", "--force", dir],
        { cwd: repo, stdio: "ignore" },
      );
    } catch {
      // The temp directory is removed below when git cannot detach the worktree.
    }
    await fs.rm(parent, { recursive: true, force: true });
  }
}

async function scoreRef(repo, ref) {
  try {
    const scored = await withGitWorktree(repo, ref, (dir) => scoreRepository(dir));
    return { ok: true, ...scored };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
}

function edgeKey(edge) {
  return `${edge.from} -> ${edge.to}`;
}

function fileKey(file) {
  return String(file || "").replace(/\\/g, "/").replace(/\.(js|ts|jsx|tsx|mjs|cjs|py|pyw|go)$/, "");
}

export function diffGraphs(baseGraph, headGraph, changedFiles = []) {
  const baseExt = new Set(baseGraph?.externalDeps || []);
  const headExt = new Set(headGraph?.externalDeps || []);
  const addedDeps = [...headExt].filter((item) => !baseExt.has(item)).sort();
  const removedDeps = [...baseExt].filter((item) => !headExt.has(item)).sort();

  const baseEdges = new Map((baseGraph?.edges || []).map((edge) => [edgeKey(edge), edge]));
  const headEdges = new Map((headGraph?.edges || []).map((edge) => [edgeKey(edge), edge]));
  const addedEdges = [...headEdges.keys()].filter((key) => !baseEdges.has(key)).sort();
  const removedEdges = [...baseEdges.keys()].filter((key) => !headEdges.has(key)).sort();

  const changed = new Set(changedFiles.map(fileKey));
  const touchesChange = (key) => {
    if (changed.size === 0) return true;
    const [from, to] = key.split(" -> ");
    return changed.has(from) || changed.has(to);
  };

  return {
    addedDeps,
    removedDeps,
    addedEdges: addedEdges.filter(touchesChange),
    removedEdges: removedEdges.filter(touchesChange),
    addedEdgeCount: addedEdges.length,
    removedEdgeCount: removedEdges.length,
  };
}

export function newHotspots(baseHealth, headHealth) {
  const previous = new Set((baseHealth?.hotspots || []).map((item) => item.file));
  return (headHealth?.hotspots || []).filter((item) => !previous.has(item.file));
}

function shortRef(ref) {
  return SHA.test(ref) ? ref.slice(0, 7) : ref;
}

function bulletFiles(lines, files, verb, limit = 20) {
  const shown = files.slice(0, limit);
  for (const file of shown) {
    lines.push(`- \`${String(file).replace(/`/g, "")}\` (${verb})`);
  }
  if (files.length > limit) {
    lines.push(`- ${files.length - limit} more ${verb}`);
  }
}

function scoreCell(health) {
  if (!health?.ok) return "unavailable";
  const score = health.health?.stats?.avgScore;
  return score == null ? "n/a" : String(score);
}

function countCell(health, field) {
  if (!health?.ok) return "unavailable";
  if (field === "files") return String(health.health?.stats?.totalFiles ?? 0);
  if (field === "hotspots") return String(health.health?.hotspots?.length ?? 0);
  return "n/a";
}

export function renderArchitectureComment(report) {
  const diff = report.diffData;
  const lines = [
    ARCHITECTURE_COMMENT_MARKER,
    "## RepoLens — Architecture diff",
    "",
    `Compared \`${shortRef(report.base)}\`...\`${shortRef(report.head)}\`.`,
    "",
    "### Files",
    "",
    `Added: ${diff.added.length}`,
    `Removed: ${diff.removed.length}`,
    `Modified: ${diff.modified.length}`,
    "",
  ];

  bulletFiles(lines, diff.added, "added");
  bulletFiles(lines, diff.removed, "removed");
  bulletFiles(lines, diff.modified, "modified");
  if (!diff.added.length && !diff.removed.length && !diff.modified.length) {
    lines.push("No architecture-relevant file changes detected.");
  }
  lines.push("");

  lines.push("### Modules", "");
  if (diff.impactedModules.length) {
    for (const module of diff.impactedModules.slice(0, 30)) {
      lines.push(`- \`${String(module).replace(/`/g, "")}\``);
    }
    if (diff.impactedModules.length > 30) {
      lines.push(`- ${diff.impactedModules.length - 30} more modules`);
    }
  } else {
    lines.push("No modules changed.");
  }
  lines.push("");

  const deps = report.deps;
  lines.push("### Dependencies", "");
  if (!report.baseScore?.ok || !report.headScore?.ok) {
    lines.push("Dependency delta needs both commits checked out. Fetch the base and head SHAs (`actions/checkout` with `fetch-depth: 0`).");
  } else {
    lines.push(`Added: ${deps.addedDeps.length ? deps.addedDeps.slice(0, 20).map((item) => `\`${item}\``).join(", ") : "none"}`);
    lines.push(`Removed: ${deps.removedDeps.length ? deps.removedDeps.slice(0, 20).map((item) => `\`${item}\``).join(", ") : "none"}`);
    lines.push(`Internal import edges added: ${deps.addedEdgeCount}`);
    lines.push(`Internal import edges removed: ${deps.removedEdgeCount}`);
    const edgeLines = [
      ...deps.addedEdges.slice(0, 12).map((item) => `- \`${item}\` (added)`),
      ...deps.removedEdges.slice(0, 12).map((item) => `- \`${item}\` (removed)`),
    ];
    if (edgeLines.length) {
      lines.push("");
      lines.push(...edgeLines);
    }
  }
  lines.push("");

  const baseAvg = report.baseScore?.ok ? report.baseScore.health?.stats?.avgScore : null;
  const headAvg = report.headScore?.ok ? report.headScore.health?.stats?.avgScore : null;
  let delta = "unavailable";
  if (baseAvg != null && headAvg != null) {
    const value = headAvg - baseAvg;
    delta = `${value > 0 ? "+" : ""}${value}`;
  }
  lines.push("### Code health", "");
  lines.push("| | Base | Head |");
  lines.push("| --- | --- | --- |");
  lines.push(`| Score | ${scoreCell(report.baseScore)} | ${scoreCell(report.headScore)} |`);
  lines.push(`| Delta | ${delta} | |`);
  lines.push(`| Files scored | ${countCell(report.baseScore, "files")} | ${countCell(report.headScore, "files")} |`);
  lines.push(`| Hotspots | ${countCell(report.baseScore, "hotspots")} | ${countCell(report.headScore, "hotspots")} |`);
  if (report.baseScore?.capped || report.headScore?.capped) {
    lines.push("");
    lines.push("Scoring stopped at 2500 source files on at least one side.");
  }
  if (report.baseScore?.error || report.headScore?.error) {
    lines.push("");
    lines.push("Code health delta needs both commits. Fetch the base ref (`actions/checkout` with `fetch-depth: 0`).");
  }
  lines.push("");

  lines.push("### New hotspots", "");
  const fresh = report.hotspots || [];
  if (!report.baseScore?.ok || !report.headScore?.ok) {
    lines.push("New hotspots need a score for both commits.");
  } else if (!fresh.length) {
    lines.push("No new hotspots (files newly under 60).");
  } else {
    for (const item of fresh.slice(0, 20)) {
      lines.push(`- \`${String(item.file).replace(/`/g, "")}\` — ${item.score} (${item.grade})`);
    }
  }
  lines.push("");
  lines.push(COMMENT_FOOTER);
  const body = lines.join("\n");
  if (body.length <= 60000) return body;
  return `${body.slice(0, 59000)}\n\n${COMMENT_FOOTER}`;
}

export async function compareArchitecture(repo, base, head) {
  const raw = diffBetweenRefs(repo, base, head);
  const diffData = buildArchitectureDiffData(raw);
  const changed = [...diffData.added, ...diffData.removed, ...diffData.modified];
  // Worktrees on one repository lock .git, so the two trees are scored in order.
  const baseScore = await scoreRef(repo, base);
  const headScore = await scoreRef(repo, head);
  const deps = diffGraphs(baseScore.depGraph, headScore.depGraph, changed);
  const hotspots = newHotspots(baseScore.health, headScore.health);
  return {
    base,
    head,
    diffData,
    baseScore,
    headScore,
    deps,
    hotspots,
  };
}

export function isForkPullRequest(event) {
  const pull = event?.pull_request;
  if (!pull) return false;
  const headRepo = pull.head?.repo;
  const baseRepo = pull.base?.repo;
  if (!headRepo || headRepo.fork === true) return true;
  if (headRepo.full_name && baseRepo?.full_name && headRepo.full_name !== baseRepo.full_name) {
    return true;
  }
  return false;
}

export async function writeJobSummary(markdown, file) {
  if (!file) {
    console.error(markdown);
    return false;
  }
  const text = markdown.endsWith("\n") ? markdown : `${markdown}\n`;
  await fs.appendFile(file, text);
  return true;
}

async function defaultGitHubRequest(method, urlPath, body, env) {
  const token = env.GITHUB_TOKEN;
  if (!token) throw Object.assign(new Error("Missing GITHUB_TOKEN"), { status: 401 });
  const response = await fetchWithRetry(`https://api.github.com${urlPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "RepoLens",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: body ? JSON.stringify(body) : undefined,
  }, {
    retries: 2,
    baseDelayMs: 400,
    maxDelayMs: 2000,
    label: `GitHub ${method}`,
  });
  const text = await response.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  if (!response.ok) {
    const clipped = sanitizeSecrets(String(text || "").replace(/\s+/g, " ").slice(0, 300));
    throw Object.assign(new Error(`GitHub API error ${response.status}: ${clipped}`), { status: response.status });
  }
  return json;
}

export async function upsertArchitectureComment({ owner, repo, issueNumber, body, request }) {
  assertGitHubRepo(`${owner}/${repo}`);
  const comments = [];
  for (let page = 1; page <= 10; page += 1) {
    const batch = await request(
      "GET",
      `/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=100&page=${page}`,
    );
    if (!Array.isArray(batch) || batch.length === 0) break;
    comments.push(...batch);
    if (batch.length < 100) break;
  }
  const existing = comments.find((comment) => isArchitectureComment(comment?.body));
  if (existing?.id != null) {
    await request("PATCH", `/repos/${owner}/${repo}/issues/comments/${existing.id}`, { body });
    return { action: "updated", id: existing.id };
  }
  const created = await request(
    "POST",
    `/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
    { body },
  );
  return { action: "created", id: created?.id };
}

async function loadEvent(env, event) {
  if (event !== undefined) return event;
  if (!env.GITHUB_EVENT_PATH) return null;
  try {
    const raw = await fs.readFile(env.GITHUB_EVENT_PATH, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Could not read GITHUB_EVENT_PATH: ${error.message}`);
  }
}

function forkNote() {
  return [
    "Fork pull request: RepoLens skipped the pull request comment and wrote this job summary instead.",
    "`GITHUB_TOKEN` on a fork pull request cannot write comments (`pull-requests: write` is downgraded to read).",
    "",
  ].join("\n");
}

/**
 * Compute the architecture diff and post one sticky comment.
 * Fork pull requests skip the API and append the same body to the job summary.
 * Returns a process exit code.
 */
export async function runPullRequestComment({
  repo = process.cwd(),
  base,
  head,
  env = process.env,
  event,
  request,
  summaryFile,
  stdout = console.log,
} = {}) {
  process.env.REPOLENS_LOG_STDERR = "1";
  let payload;
  try {
    payload = await loadEvent(env, event);
  } catch (error) {
    console.error(error.message);
    return 1;
  }

  const pull = payload?.pull_request;
  const baseRef = base || pull?.base?.sha;
  const headRef = head || pull?.head?.sha;
  if (!baseRef || !headRef) {
    const namedEvent = env.GITHUB_EVENT_NAME;
    if (!base && !head && namedEvent && namedEvent !== "pull_request") {
      console.error(`Architecture comment runs on pull_request (this event is ${namedEvent}). Nothing was posted.`);
      return 0;
    }
    console.error("Architecture comment needs a base and head commit. On pull_request these come from the event. Locally pass --base and --head.");
    return 2;
  }
  if (!isSafeGitRef(baseRef) || !isSafeGitRef(headRef)) {
    console.error("base and head refs contain unsupported characters.");
    return 2;
  }

  let report;
  try {
    report = await compareArchitecture(repo, baseRef, headRef);
  } catch (error) {
    console.error(error.message || String(error));
    return 1;
  }
  const body = renderArchitectureComment(report);
  const fork = isForkPullRequest(payload);

  if (fork) {
    const summary = `${forkNote()}\n${body}`;
    await writeJobSummary(summary, summaryFile || env.GITHUB_STEP_SUMMARY);
    console.error("Fork pull request: skipped the comment and wrote the job summary.");
    return 0;
  }

  const token = env.GITHUB_TOKEN;
  const repository = env.GITHUB_REPOSITORY;
  const issueNumber = pull?.number;
  const shouldPost = Boolean(request || (token && repository && issueNumber));
  if (!shouldPost) {
    stdout(body);
    return 0;
  }

  const call = request || ((method, urlPath, payloadBody) => defaultGitHubRequest(method, urlPath, payloadBody, env));
  try {
    assertGitHubRepo(repository);
    const [owner, name] = repository.split("/");
    const result = await upsertArchitectureComment({
      owner,
      repo: name,
      issueNumber,
      body,
      request: call,
    });
    console.error(`Architecture comment ${result.action}${result.id != null ? ` (${result.id})` : ""}.`);
    return 0;
  } catch (error) {
    if (error.status === 403 || error.status === 401) {
      const summary = [
        "RepoLens could not post the pull request comment (GitHub returned " + error.status + ").",
        "The job summary has the architecture diff instead.",
        "",
        body,
      ].join("\n");
      await writeJobSummary(summary, summaryFile || env.GITHUB_STEP_SUMMARY);
      console.error(error.message);
      return 0;
    }
    console.error(error.message || String(error));
    return 1;
  }
}
