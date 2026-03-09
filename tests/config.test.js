import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { loadConfig } from "../src/core/config.js";

describe("loadConfig", () => {
  let tempDir;

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it("loads a valid .repolens.yml file", async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-config-"));
    const configPath = path.join(tempDir, ".repolens.yml");

    await fs.writeFile(
      configPath,
      `
configVersion: 1

project:
  name: "test-project"
publishers:
  - notion
scan:
  include:
    - "src/**/*.ts"
  ignore:
    - "node_modules/**"
module_roots:
  - "src/app"
outputs:
  pages:
    - key: "system_overview"
      title: "System Overview"
`,
      "utf8"
    );

    const cfg = await loadConfig(configPath);

    expect(cfg.project.name).toBe("test-project");
    expect(cfg.publishers).toContain("notion");
    expect(cfg.module_roots).toContain("src/app");
    expect(cfg.__repoRoot).toBe(tempDir);
  });
});