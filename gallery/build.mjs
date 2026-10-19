#!/usr/bin/env node
// Build the static RepoLens gallery.
//
// Shallow-clones the curated public repos in repos.json, runs RepoLens with
// AI switched off, and writes HTML under gallery/dist. A repository that
// fails to clone, fails the license check, or fails the scan is skipped.
//
//   node gallery/build.mjs
//   GALLERY_ONLY=express,flask node gallery/build.mjs
//
// Deterministic mode: this process never reads an API key into the scanner.
// GitHub Pages expects the site at https://chapibunny.github.io/repolens/.

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  pageUrl,
  renderIndex,
  renderNotFound,
  renderRepo,
  renderRobots,
  renderSitemap,
  selfTest,
} from "./render.mjs";

const GALLERY_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(GALLERY_DIR, "..");
const DIST = path.join(GALLERY_DIR, "dist");
const CACHE = path.join(GALLERY_DIR, ".cache", "repos");
const JOBS = path.join(GALLERY_DIR, ".cache", "jobs");

const SITE_ORIGIN = process.env.GALLERY_SITE_ORIGIN || "https://chapibunny.github.io";
const BASE_PATH = process.env.GALLERY_BASE_PATH ?? "/repolens";
const MAX_FILES = Number(process.env.GALLERY_MAX_FILES || 1600);
const CLONE_TIMEOUT_MS = Number(process.env.GALLERY_CLONE_TIMEOUT_MS || 180_000);
const SCAN_TIMEOUT_MS = Number(process.env.GALLERY_SCAN_TIMEOUT_MS || 120_000);
const MIN_PAGES = process.env.GALLERY_ONLY ? 1 : Number(process.env.GALLERY_MIN_PAGES || 8);

const LICENSE_MARKERS = {
  MIT: [/permission is hereby granted/i, /\bMIT License\b/i, /\(The MIT License\)/i],
  "Apache-2.0": [/apache license/i],
  "BSD-3-Clause": [/redistribution and use in source and binary forms/i],
  "BSD-2-Clause": [/redistribution and use in source and binary forms/i],
  "MPL-2.0": [/mozilla public license/i],
  ISC: [/permission to use, copy, modify, and\/or distribute/i],
};

function log(message) {
  console.log(`[gallery] ${message}`);
}

function run(cmd, args, { cwd, timeoutMs, env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      env: env || process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      fail(new Error(`${cmd} timed out after ${timeoutMs}ms`));
    }, timeoutMs || 60_000);
    const ok = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const fail = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    };
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", fail);
    child.on("close", (code) => {
      if (code === 0) ok({ stdout, stderr });
      else {
        const detail = (stderr || stdout).trim().slice(0, 400);
        fail(new Error(`${cmd} exited ${code}${detail ? `: ${detail}` : ""}`));
      }
    });
  });
}

function git(args, cwd, timeoutMs = CLONE_TIMEOUT_MS) {
  return run("git", ["-c", "credential.helper=", "-c", "safe.directory=*", ...args], {
    cwd,
    timeoutMs,
  });
}

async function exists(file) {
  try {
    await fs.stat(file);
    return true;
  } catch {
    return false;
  }
}

async function readLicense(dir, names) {
  for (const name of names) {
    try {
      const text = await fs.readFile(path.join(dir, name), "utf8");
      return text.slice(0, 65_536);
    } catch {
      // Try the next known license filename.
    }
  }
  return "";
}

function licenseOk(text, spdx) {
  const markers = LICENSE_MARKERS[spdx];
  if (!markers) return `license ${spdx} is outside the permissive allowlist`;
  if (!text) return "license file was not in the checkout";
  // MPL 2.0 names the GPL as a secondary license. Only reject a file whose
  // opening text is the GPL itself.
  const opening = text.slice(0, 500);
  if (/gnu general public license/i.test(opening) && !/mozilla public license/i.test(opening)) {
    return "license file is GPL";
  }
  if (!markers.some((pattern) => pattern.test(text))) {
    return `license file does not match ${spdx}`;
  }
  return "";
}

async function ensureClone(repo) {
  const dest = path.join(CACHE, repo.slug);
  const url = `https://github.com/${repo.owner}/${repo.repo}.git`;
  const remote = await git(["ls-remote", "--heads", url, `refs/heads/${repo.branch}`], ROOT, 60_000);
  const head = remote.stdout.split(/\s+/)[0];
  if (!head || head.length < 7) throw new Error(`branch ${repo.branch} was not found`);

  let local = "";
  if (await exists(path.join(dest, ".git"))) {
    try {
      local = (await git(["rev-parse", "HEAD"], dest, 20_000)).stdout.trim();
    } catch {
      local = "";
    }
  }

  if (local !== head) {
    await fs.mkdir(CACHE, { recursive: true });
    const cloneAt = async (useFilter) => {
      await fs.rm(dest, { recursive: true, force: true });
      const args = ["clone", "--depth", "1"];
      if (useFilter) args.push("--filter=blob:none");
      if (repo.sparse?.length) args.push("--sparse");
      args.push("--branch", repo.branch, url, dest);
      await git(args, ROOT);
    };
    try {
      await cloneAt(true);
    } catch (error) {
      log(`${repo.slug} partial clone failed (${error.message.slice(0, 120)}); retrying`);
      await cloneAt(false);
    }
    log(`${repo.slug} cloned ${head.slice(0, 7)}`);
  } else {
    log(`${repo.slug} cache hit ${head.slice(0, 7)}`);
  }

  if (repo.sparse?.length) {
    await git(["sparse-checkout", "set", ...repo.sparse], dest);
  }

  const reason = licenseOk(await readLicense(dest, repo.licenseFiles || ["LICENSE"]), repo.license);
  if (reason) {
    const error = new Error(reason);
    error.license = true;
    throw error;
  }

  return { dest, commit: head };
}

function scanEnv() {
  const env = { ...process.env };
  for (const key of [
    "REPOLENS_AI_API_KEY",
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "GOOGLE_API_KEY",
    "AZURE_OPENAI_API_KEY",
    "REPOLENS_AI_BASE_URL",
    "REPOLENS_AI_PROVIDER",
    "REPOLENS_AI_PRESET",
  ]) {
    delete env[key];
  }
  env.REPOLENS_AI_ENABLED = "false";
  env.REPOLENS_TELEMETRY_ENABLED = "false";
  env.NO_COLOR = "1";
  return env;
}

async function scanRepo(repo, dest) {
  await fs.mkdir(JOBS, { recursive: true });
  const jobPath = path.join(JOBS, `${repo.slug}.json`);
  const outPath = path.join(JOBS, `${repo.slug}.result.json`);
  await fs.rm(outPath, { force: true });
  await fs.writeFile(jobPath, JSON.stringify({ repo, dest, maxFiles: MAX_FILES }));
  try {
    await run(process.execPath, ["--max-old-space-size=2048", path.join(GALLERY_DIR, "scan-repo.mjs"), "--job", jobPath, "--out", outPath], {
      cwd: ROOT,
      timeoutMs: SCAN_TIMEOUT_MS,
      env: scanEnv(),
    });
  } catch (error) {
    if (await exists(outPath)) {
      const body = JSON.parse(await fs.readFile(outPath, "utf8"));
      if (body.error) throw new Error(body.error);
    }
    if (/timed out/i.test(error.message)) {
      throw new Error(`scan exceeded ${Math.round(SCAN_TIMEOUT_MS / 1000)}s`);
    }
    throw error;
  }
  const body = JSON.parse(await fs.readFile(outPath, "utf8"));
  if (!body.ok) throw new Error(body.error || "scan failed");
  return body;
}

async function loadRepos() {
  const repos = JSON.parse(await fs.readFile(path.join(GALLERY_DIR, "repos.json"), "utf8"));
  const only = (process.env.GALLERY_ONLY || "").split(",").map((item) => item.trim()).filter(Boolean);
  if (only.length === 0) return repos;
  const known = new Set(repos.map((repo) => repo.slug));
  const missing = only.filter((slug) => !known.has(slug));
  if (missing.length) throw new Error(`Unknown GALLERY_ONLY slug: ${missing.join(", ")}`);
  return repos.filter((repo) => only.includes(repo.slug));
}

async function copyAssets() {
  const assets = path.join(DIST, "assets");
  await fs.mkdir(assets, { recursive: true });
  await fs.copyFile(path.join(GALLERY_DIR, "assets", "logo.png"), path.join(assets, "logo.png"));
  await fs.copyFile(path.join(GALLERY_DIR, "site.css"), path.join(assets, "site.css"));
}

async function main() {
  selfTest();
  const repos = await loadRepos();
  const pkg = JSON.parse(await fs.readFile(path.join(ROOT, "package.json"), "utf8"));
  const generatedOn = new Date().toISOString().slice(0, 10);
  await fs.rm(DIST, { recursive: true, force: true });
  await fs.mkdir(DIST, { recursive: true });

  const pages = [];
  const skipped = [];

  for (const repo of repos) {
    const started = Date.now();
    try {
      const clone = await ensureClone(repo);
      const scanned = await scanRepo(repo, clone.dest);
      pages.push({
        ...repo,
        commit: clone.commit,
        shortSha: clone.commit.slice(0, 7),
        stats: scanned.stats,
        documents: scanned.documents,
      });
      const seconds = ((Date.now() - started) / 1000).toFixed(1);
      log(`${repo.slug} ok ${scanned.stats.files} files, ${scanned.stats.modules} modules, ${scanned.documents.length} docs in ${seconds}s`);
    } catch (error) {
      const reason = (error.message || "failed").replace(/\s+/g, " ").slice(0, 220);
      skipped.push({ slug: repo.slug, reason });
      log(`${repo.slug} skipped: ${reason}`);
    }
  }

  if (pages.length < MIN_PAGES) {
    throw new Error(`only ${pages.length} repositories succeeded (need ${MIN_PAGES}). Refusing to publish a thin gallery.`);
  }

  const site = { origin: SITE_ORIGIN, basePath: BASE_PATH, generatedOn, version: pkg.version || "" };
  await fs.writeFile(path.join(DIST, "index.html"), renderIndex({
    ...site,
    pages,
    skipped,
    curatedCount: repos.length,
  }));
  for (const page of pages) {
    const dir = path.join(DIST, page.slug);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "index.html"), renderRepo(page, site));
  }
  await fs.writeFile(path.join(DIST, "404.html"), renderNotFound(site));

  const lastmod = generatedOn;
  const urls = [
    { loc: pageUrl(SITE_ORIGIN, BASE_PATH, ""), lastmod },
    ...pages.map((page) => ({ loc: pageUrl(SITE_ORIGIN, BASE_PATH, `${page.slug}/`), lastmod })),
  ];
  await fs.writeFile(path.join(DIST, "sitemap.xml"), renderSitemap(urls));
  await fs.writeFile(
    path.join(DIST, "robots.txt"),
    renderRobots(pageUrl(SITE_ORIGIN, BASE_PATH, "sitemap.xml"))
  );
  await copyAssets();
  log(`wrote ${pages.length} pages to ${path.relative(ROOT, DIST)} (${skipped.length} skipped)`);
}

main().catch((error) => {
  console.error(`[gallery] ${error.message || error}`);
  process.exit(1);
});
