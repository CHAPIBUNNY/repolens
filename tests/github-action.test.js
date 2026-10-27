import { describe, it, expect, afterEach } from "vitest";
import { upsertPrComment } from "../src/delivery/comment.js";
import { DEFAULT_PACKAGE_VERSION, resolveActionInputs } from "../scripts/github-action.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

const envKeys = [
  "REPOLENS_COMMAND",
  "REPOLENS_CONFIG",
  "REPOLENS_VERSION",
  "REPOLENS_PR_COMMENT",
  "REPOLENS_NODE_VERSION",
  "GITHUB_EVENT_NAME",
  "GITHUB_EVENT_PATH",
];
const saved = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of envKeys) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

function setInputs(values) {
  for (const key of envKeys) delete process.env[key];
  Object.assign(process.env, values);
}

describe("github action inputs", () => {
  it("builds an npx argument list for the published package", () => {
    setInputs({});
    const inputs = resolveActionInputs();
    expect(inputs.command).toBe("publish");
    expect(inputs.version).toBe(DEFAULT_PACKAGE_VERSION);
    expect(inputs.version).toBe(pkg.version);
    expect(inputs.args).toEqual([
      "--force",
      "--yes",
      `@chappibunny/repolens@${pkg.version}`,
      "publish",
      "--config",
      ".repolens.yml",
    ]);
    expect(inputs.prComment).toBe("false");
  });

  it("accepts publish, demo, and doctor and rejects shell metacharacters", () => {
    setInputs({
      REPOLENS_COMMAND: "doctor",
      REPOLENS_CONFIG: "config/app.yml",
      REPOLENS_VERSION: "1.14.0",
      REPOLENS_PR_COMMENT: "true",
      REPOLENS_NODE_VERSION: "22.14.0",
    });
    const inputs = resolveActionInputs();
    expect(inputs.command).toBe("doctor");
    expect(inputs.args[3]).toBe("doctor");
    expect(inputs.prComment).toBe("true");

    setInputs({ REPOLENS_COMMAND: "publish; id" });
    expect(() => resolveActionInputs()).toThrow(/command/);
    setInputs({ REPOLENS_CONFIG: "--evil" });
    expect(() => resolveActionInputs()).toThrow(/config/);
    setInputs({ REPOLENS_VERSION: "1.14.0; curl" });
    expect(() => resolveActionInputs()).toThrow(/version/);
    setInputs({ REPOLENS_PR_COMMENT: "yes" });
    expect(() => resolveActionInputs()).toThrow(/pr-comment/);
    setInputs({ REPOLENS_NODE_VERSION: "20; curl" });
    expect(() => resolveActionInputs()).toThrow(/node-version/);
  });

  it("skips the pull request comment when the action disables it", async () => {
    process.env.GITHUB_EVENT_NAME = "pull_request";
    process.env.REPOLENS_PR_COMMENT = "false";
    delete process.env.GITHUB_EVENT_PATH;
    await expect(upsertPrComment({
      added: [],
      removed: [],
      modified: [],
      addedRoutes: [],
      removedRoutes: [],
      impactedModules: [],
    })).resolves.toBeUndefined();
  });
});
