/**
 * Runtime checks for Node.js 18.
 *
 * Vitest 4 pulls in rolldown, which imports `styleText` from `node:util`.
 * That export does not exist before Node.js 20.12, so `npm test` cannot
 * start on Node 18. The library itself still supports `engines.node >= 18`.
 * This file is what CI runs on the Node 18 job.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../src/core/config.js";
import { resolveOutputDir } from "../src/utils/safe-path.js";
import { getGitDiff } from "../src/core/diff.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bin = path.join(root, "bin/repolens.js");

function runBin(args, options = {}) {
  return spawnSync(process.execPath, [bin, ...args], {
    encoding: "utf8",
    cwd: options.cwd || root,
    env: {
      ...process.env,
      CI: "true",
      NODE_ENV: "production",
      GITHUB_TOKEN: "",
      REPOLENS_AI_API_KEY: "",
      REPOLENS_AI_ENABLED: "",
      ...(options.env || {}),
    },
    timeout: options.timeout || 60_000,
  });
}

test("version and help do not load the scanner", () => {
  const version = runBin(["--version"]);
  assert.equal(version.status, 0, version.stderr);
  assert.match(version.stdout, /^\d+\.\d+\.\d+\n$/);
  assert.equal(version.stderr, "");

  const help = runBin(["--help"]);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /Repository Intelligence CLI/);
  assert.match(help.stdout, /Exit codes:/);
});

test("loads the repository config", async () => {
  const cfg = await loadConfig(path.join(root, ".repolens.yml"));
  assert.equal(cfg.configVersion, 1);
  assert.equal(cfg.project.name, "RepoLens");
});

test("rejects an output directory outside the repository", () => {
  assert.throws(() => resolveOutputDir(root, "../outside"), /escapes/);
});

test("ignores an unsafe git diff ref", () => {
  assert.deepEqual(getGitDiff("origin/main; id"), { added: [], removed: [], modified: [] });
});

test("demo of another directory does not publish this repository's config", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-node18-"));
  await fs.mkdir(path.join(dir, "src"));
  await fs.writeFile(path.join(dir, "src/index.js"), "export const hello = 'world';\n");
  try {
    const demo = runBin(["demo", "--target", dir], { cwd: root });
    assert.equal(demo.status, 0, `${demo.stdout}\n${demo.stderr}`);
    assert.match(demo.stdout, /No \.repolens\.yml found/);
    const summary = await fs.readFile(path.join(dir, ".repolens", "00-executive-summary.md"), "utf8");
    assert.match(summary, /^# /);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
