import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { runDoctor } from "../src/doctor.js";

describe("runDoctor", () => {
  const tempDirs = [];
  const originalEnv = { ...process.env };

  afterEach(async () => {
    process.env = { ...originalEnv };
    for (const dir of tempDirs) {
      await fs.rm(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  async function createValidRepo(extraConfig = "") {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-doctor-"));
    tempDirs.push(tempDir);

    await fs.writeFile(
      path.join(tempDir, ".repolens.yml"),
      `
configVersion: 1

project:
  name: "doctor-test"

publishers:
  - markdown

scan:
  include:
    - "src/**/*.js"
  ignore:
    - "node_modules/**"

module_roots:
  - "src"

outputs:
  pages:
    - key: "system_overview"
      title: "System Overview"
${extraConfig}
`,
      "utf8"
    );

    await fs.mkdir(path.join(tempDir, ".github", "workflows"), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, ".github", "workflows", "repolens.yml"),
      "name: RepoLens",
      "utf8"
    );

    return tempDir;
  }

  it("passes on a valid RepoLens repo", async () => {
    const tempDir = await createValidRepo();
    const result = await runDoctor(tempDir);
    expect(result.ok).toBe(true);
  });

  it("fails when RepoLens config is missing", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-doctor-broken-"));
    tempDirs.push(tempDir);

    const result = await runDoctor(tempDir);
    expect(result.ok).toBe(false);
  });

  it("checks GITHUB_TOKEN for AI github provider", async () => {
    process.env.REPOLENS_AI_ENABLED = "true";
    process.env.REPOLENS_AI_PROVIDER = "github";
    process.env.GITHUB_TOKEN = "ghp_test";
    delete process.env.REPOLENS_AI_API_KEY;

    const tempDir = await createValidRepo(`
ai:
  enabled: true
`);
    const result = await runDoctor(tempDir);
    // Should pass — GITHUB_TOKEN is set for the github provider
    expect(result.ok).toBe(true);
  });

  it("checks REPOLENS_AI_API_KEY for non-github AI provider", async () => {
    process.env.REPOLENS_AI_ENABLED = "true";
    delete process.env.REPOLENS_AI_PROVIDER;
    delete process.env.REPOLENS_AI_API_KEY;

    const tempDir = await createValidRepo(`
ai:
  enabled: true
`);
    // Should still pass (env vars are warnings, not failures)
    const result = await runDoctor(tempDir);
    expect(result.ok).toBe(true);
  });
});