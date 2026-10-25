#!/usr/bin/env node
/**
 * Runner for the RepoLens composite GitHub Action.
 *
 * Inputs arrive as environment variables so action.yml does not interpolate
 * them into a shell script. npx is spawned with an argument array.
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const DEFAULT_PACKAGE_VERSION = "1.15.4";
const ALLOWED_COMMANDS = new Set(["publish", "demo", "doctor", "comment", "badge"]);
const LOCAL_COMMANDS = new Set(["comment", "badge"]);
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

export function isSafePublicUrl(value) {
  if (value == null || value === "") return true;
  if (typeof value !== "string" || value.length > 500) return false;
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  if (url.username || url.password) return false;
  return true;
}

export function isSafeConfigPath(config) {
  if (typeof config !== "string" || config.length === 0 || config.length > 500) return false;
  if (config.includes("\0") || config.includes("\n") || config.includes("\r")) return false;
  if (config.startsWith("-")) return false;
  return true;
}

export function resolveActionInputs(env = process.env) {
  const command = env.REPOLENS_COMMAND || "publish";
  if (!ALLOWED_COMMANDS.has(command)) {
    throw new Error("command must be publish, demo, doctor, comment, or badge");
  }

  const config = env.REPOLENS_CONFIG || ".repolens.yml";
  if (!isSafeConfigPath(config)) {
    throw new Error("config must be a path without a leading dash or newline");
  }

  const version = env.REPOLENS_VERSION || DEFAULT_PACKAGE_VERSION;
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?$/.test(version)) {
    throw new Error("version must be a semver");
  }

  const prComment = env.REPOLENS_PR_COMMENT == null || env.REPOLENS_PR_COMMENT === ""
    ? "false"
    : env.REPOLENS_PR_COMMENT;
  if (prComment !== "true" && prComment !== "false") {
    throw new Error("pr-comment must be true or false");
  }

  const nodeVersion = env.REPOLENS_NODE_VERSION || "20";
  if (!/^\d+(?:\.\d+){0,2}$/.test(nodeVersion)) {
    throw new Error("node-version must look like 18, 20, or 20.18.0");
  }

  const badgeOut = env.REPOLENS_BADGE_OUT || "repolens-badge.json";
  if (!isSafeConfigPath(badgeOut)) {
    throw new Error("badge-out must be a path without a leading dash or newline");
  }
  const badgeUrl = env.REPOLENS_BADGE_URL || "";
  if (!isSafePublicUrl(badgeUrl)) {
    throw new Error("badge-url must be an http(s) URL without credentials");
  }
  const badgeLink = env.REPOLENS_BADGE_LINK || "";
  if (!isSafePublicUrl(badgeLink)) {
    throw new Error("badge-link must be an http(s) URL without credentials");
  }

  const local = LOCAL_COMMANDS.has(command);
  return {
    command,
    config,
    version,
    prComment,
    nodeVersion,
    badgeOut,
    badgeUrl,
    badgeLink,
    local,
    args: local ? null : ["--yes", `@chappibunny/repolens@${version}`, command, "--config", config],
  };
}

/**
 * publish, demo, and doctor run the published npm package.
 * comment and badge run this repository's source, so they work before the next npm release.
 * pr-comment: true posts the architecture comment from this source and turns the
 * package's older comment off, so the pull request gets one sticky comment.
 */
export function actionSteps(inputs) {
  if (inputs.command === "comment") {
    return [{
      kind: "local",
      script: "pr-comment-run.js",
      env: { REPOLENS_PR_COMMENT: "true" },
    }];
  }
  if (inputs.command === "badge") {
    return [{
      kind: "local",
      script: "badge-run.js",
      env: {
        REPOLENS_BADGE_OUT: inputs.badgeOut,
        REPOLENS_BADGE_URL: inputs.badgeUrl,
        REPOLENS_BADGE_LINK: inputs.badgeLink,
      },
    }];
  }
  const postComment = inputs.prComment === "true";
  const steps = [{
    kind: "npx",
    args: inputs.args,
    env: { REPOLENS_PR_COMMENT: postComment ? "false" : inputs.prComment },
  }];
  if (postComment) {
    steps.push({
      kind: "local",
      script: "pr-comment-run.js",
      env: { REPOLENS_PR_COMMENT: "true" },
    });
  }
  return steps;
}

export function main(argv = process.argv.slice(2)) {
  let inputs;
  try {
    inputs = resolveActionInputs(process.env);
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }

  if (argv.includes("--check")) {
    process.exit(0);
  }

  for (const step of actionSteps(inputs)) {
    const result = step.kind === "npx"
      ? spawnSync("npx", step.args, {
        stdio: "inherit",
        env: { ...process.env, ...step.env },
      })
      : spawnSync(process.execPath, [path.join(SCRIPT_DIR, step.script)], {
        stdio: "inherit",
        env: { ...process.env, ...step.env },
      });

    if (result.error) {
      console.error(result.error.message);
      process.exit(1);
    }
    if (result.status == null || result.status !== 0) {
      process.exit(result.status == null ? 1 : result.status);
    }
  }
  process.exit(0);
}

const entryArg = process.argv[1];
const isEntry = entryArg && pathToFileURL(path.resolve(entryArg)).href === import.meta.url;
if (isEntry) {
  main();
}
