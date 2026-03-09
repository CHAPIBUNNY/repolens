import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { runDoctor } from "../src/doctor.js";

describe("runDoctor", () => {
  const tempDirs = [];

  afterEach(async () => {
    for (const dir of tempDirs) {
      await fs.rm(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it("passes on a valid RepoLens repo", async () => {
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
`,
      "utf8"
    );

    await fs.mkdir(path.join(tempDir, ".github", "workflows"), { recursive: true });

    await fs.writeFile(
      path.join(tempDir, ".github", "workflows", "repolens.yml"),
      "name: RepoLens",
      "utf8"
    );

    const result = await runDoctor(tempDir);

    expect(result.ok).toBe(true);
  });

  it("fails when RepoLens config is missing", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-doctor-broken-"));
    tempDirs.push(tempDir);

    const result = await runDoctor(tempDir);

    expect(result.ok).toBe(false);
  });
});