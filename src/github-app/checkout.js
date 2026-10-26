import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { isSafeGitRef } from "../core/diff.js";
import { assertGitHubRepo } from "../utils/github-repo.js";
import { redactToken } from "./auth.js";

function assertToken(token) {
  if (typeof token !== "string" || !/^[A-Za-z0-9_]+$/.test(token)) {
    throw new Error("Installation token has an unexpected shape");
  }
}

function git(args, cwd, token) {
  try {
    execFileSync("git", [
      "-c", "safe.directory=*",
      "-c", `http.extraheader=AUTHORIZATION: bearer ${token}`,
      ...args,
    ], {
      cwd,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (error) {
    const stderr = redactToken(error.stderr || error.message || error, token)
      .replace(/\s+/g, " ")
      .slice(0, 300);
    throw new Error(`git failed: ${stderr}`);
  }
}

/**
 * Clone the base repository and fetch the pull request head plus the base SHA.
 * The token is passed as an HTTP header, not in the remote URL, and is stripped
 * from git's error text. It can still appear in the process list on the host.
 */
export async function checkoutPullRequest({ token, owner, repo, pullNumber, baseSha, headSha }) {
  assertToken(token);
  assertGitHubRepo(`${owner}/${repo}`);
  if (!/^[0-9]+$/.test(String(pullNumber))) {
    throw new Error("Invalid pull request number");
  }
  if (!isSafeGitRef(baseSha) || !isSafeGitRef(headSha)) {
    throw new Error("Invalid base or head commit");
  }

  const parent = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-app-"));
  const dir = path.join(parent, "repo");
  const remote = `https://github.com/${owner}/${repo}.git`;
  try {
    await fs.mkdir(dir);
    git(["init", "--quiet"], dir, token);
    git(["remote", "add", "origin", remote], dir, token);
    git(["fetch", "--quiet", "--depth", "1", "origin", baseSha], dir, token);
    git(["fetch", "--quiet", "--depth", "1", "origin", `pull/${pullNumber}/head`], dir, token);
    git(["checkout", "--quiet", "--detach", headSha], dir, token);
    return {
      dir,
      async cleanup() {
        await fs.rm(parent, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await fs.rm(parent, { recursive: true, force: true });
    throw error;
  }
}
