/**
 * Runtime checks for Node.js 18.
 *
 * Vitest 5 pulls in rolldown, which imports `styleText` from `node:util`.
 * That export does not exist before Node.js 20.12, so `npm test` cannot
 * start on Node 18. Vitest 5 declares engines `^22.12 || ^24 || >=26` and
 * still runs the suite on Node 20. The library supports `engines.node >= 18`.
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
import { getGitDiff, isSafeGitRef } from "../src/core/diff.js";
import { applyBrandingFooter, brandingEnabled } from "../src/docs/branding.js";
import { resolveInsideWorkspace } from "../src/mcp/workspace.js";
import { replaceBracketParams } from "../src/utils/route-params.js";
import { GITHUB_APP_MANIFEST } from "../src/github-app/manifest.js";
import { signHubBody, verifyHubSignature256 } from "../src/github-app/signature.js";

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
  assert.equal(isSafeGitRef("origin/main; id"), false);
  assert.deepEqual(getGitDiff("origin/main; id"), { added: [], removed: [], modified: [] });
  assert.deepEqual(getGitDiff("HEAD", root, "HEAD; id"), { added: [], removed: [], modified: [] });
});

test("route params stay linear and the GitHub App manifest is minimal", () => {
  const started = Date.now();
  const replaced = replaceBracketParams(`[${"[".repeat(50_000)}`);
  assert.ok(Date.now() - started < 500);
  assert.equal(replaced.includes("]"), false);
  assert.equal(GITHUB_APP_MANIFEST.default_permissions.checks, "write");
  assert.equal(GITHUB_APP_MANIFEST.default_permissions.metadata, "read");
  const body = Buffer.from("{\"ok\":true}");
  const signature = signHubBody(body, "secret");
  assert.equal(verifyHubSignature256(body, signature, "secret"), true);
  assert.equal(verifyHubSignature256(body, signature, "nope"), false);
});

test("app --manifest prints JSON and a bare app exits 2 without credentials", () => {
  const manifest = runBin(["app", "--manifest"], {
    env: { REPOLENS_APP_ID: "", REPOLENS_WEBHOOK_SECRET: "", REPOLENS_APP_PRIVATE_KEY: "" },
  });
  assert.equal(manifest.status, 0, manifest.stderr);
  assert.match(manifest.stdout, /"checks": "write"/);

  const missing = runBin(["app"], {
    env: { REPOLENS_APP_ID: "", REPOLENS_WEBHOOK_SECRET: "", REPOLENS_APP_PRIVATE_KEY: "", REPOLENS_APP_PRIVATE_KEY_PATH: "" },
  });
  assert.equal(missing.status, 2, missing.stdout);
  assert.match(missing.stderr, /REPOLENS_APP_ID/);
});

test("docs badge and workspace paths stay inside the repository", () => {
  assert.equal(brandingEnabled({}), true);
  assert.equal(brandingEnabled({ branding: false }), false);
  const branded = applyBrandingFooter("# Doc\n", {});
  assert.match(branded, /Docs by RepoLens/);
  assert.match(branded, /https:\/\/github\.com\/CHAPIBUNNY\/repolens/);
  assert.throws(() => resolveInsideWorkspace(root, "../outside"), /escapes/);
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
