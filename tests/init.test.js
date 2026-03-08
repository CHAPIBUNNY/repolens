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
});