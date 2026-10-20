#!/usr/bin/env node
/**
 * Runner for the RepoLens composite GitHub Action.
 *
 * Inputs arrive as environment variables so action.yml does not interpolate
 * them into a shell script. npx is spawned with an argument array.
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const DEFAULT_PACKAGE_VERSION = "1.14.2";
const ALLOWED_COMMANDS = new Set(["publish", "demo", "doctor"]);

export function isSafeConfigPath(config) {
  if (typeof config !== "string" || config.length === 0 || config.length > 500) return false;
  if (config.includes("\0") || config.includes("\n") || config.includes("\r")) return false;
  if (config.startsWith("-")) return false;
  return true;
}

export function resolveActionInputs(env = process.env) {
  const command = env.REPOLENS_COMMAND || "publish";
  if (!ALLOWED_COMMANDS.has(command)) {
    throw new Error("command must be publish, demo, or doctor");
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

  return {
    command,
    config,
    version,
    prComment,
    nodeVersion,
    args: ["--yes", `@chappibunny/repolens@${version}`, command, "--config", config],
  };
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

  const result = spawnSync("npx", inputs.args, {
    stdio: "inherit",
    env: {
      ...process.env,
      REPOLENS_PR_COMMENT: inputs.prComment,
    },
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  process.exit(result.status == null ? 1 : result.status);
}

const entryArg = process.argv[1];
const isEntry = entryArg && pathToFileURL(path.resolve(entryArg)).href === import.meta.url;
if (isEntry) {
  main();
}
