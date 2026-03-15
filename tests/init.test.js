import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { runInit } from "../src/init.js";

describe("runInit", () => {
  let tempDir;

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it("creates RepoLens setup files", async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-init-"));

    await runInit(tempDir);

    const files = await fs.readdir(tempDir);

    expect(files).toContain(".repolens.yml");
    expect(files).toContain(".env.example");
    expect(files).toContain("README.repolens.md");

    const workflowDir = path.join(tempDir, ".github", "workflows");
    const workflows = await fs.readdir(workflowDir);

    expect(workflows).toContain("repolens.yml");
  });

  it(".env.example contains GitHub Models section", async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-init-env-"));
    await runInit(tempDir);

    const env = await fs.readFile(path.join(tempDir, ".env.example"), "utf8");
    expect(env).toContain("GitHub Models");
    expect(env).toContain("REPOLENS_AI_PROVIDER=github");
    expect(env).toContain("GITHUB_TOKEN");
    expect(env).toContain("gpt-4o-mini");
  });

  it("workflow template contains commented GitHub Models env vars", async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-init-wf-"));
    await runInit(tempDir);

    const wf = await fs.readFile(
      path.join(tempDir, ".github", "workflows", "repolens.yml"),
      "utf8"
    );
    expect(wf).toContain("REPOLENS_AI_PROVIDER: github");
    expect(wf).toContain("REPOLENS_AI_ENABLED: true");
    expect(wf).toContain("GITHUB_TOKEN");
    // Should be commented out by default
    expect(wf).toContain("# REPOLENS_AI_ENABLED: true");
  });

  it("README contains GitHub Models as Option A", async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-init-readme-"));
    await runInit(tempDir);

    const readme = await fs.readFile(path.join(tempDir, "README.repolens.md"), "utf8");
    expect(readme).toContain("GitHub Models");
    expect(readme).toContain("Option A");
    expect(readme).toContain("Free");
    expect(readme).toContain("REPOLENS_AI_PROVIDER: github");
    expect(readme).toContain("free with GitHub Models");
  });

  it(".env.example contains standard AI config section", async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-init-ai-"));
    await runInit(tempDir);

    const env = await fs.readFile(path.join(tempDir, ".env.example"), "utf8");
    expect(env).toContain("REPOLENS_AI_ENABLED=true");
    expect(env).toContain("REPOLENS_AI_API_KEY");
    expect(env).toContain("REPOLENS_AI_MODEL");
  });

  it("does not overwrite existing files", async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-init-skip-"));
    const configPath = path.join(tempDir, ".repolens.yml");
    await fs.writeFile(configPath, "# custom config", "utf8");

    await runInit(tempDir);

    const content = await fs.readFile(configPath, "utf8");
    expect(content).toBe("# custom config");
  });
});