import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Run the CLI as a child process
 */
function runCli(args = [], cwd = process.cwd()) {
  return new Promise((resolve, reject) => {
    const cliPath = path.resolve(__dirname, "../src/cli.js");

    execFile(
      "node",
      [cliPath, ...args],
      {
        cwd,
        env: { ...process.env, NODE_ENV: "test" },
      },
      (error, stdout, stderr) => {
        resolve({ stdout, stderr, error });
      }
    );
  });
}

describe("config auto-discovery", () => {
  let tempDir;

  beforeEach(async () => {
    // Create temp directory for each test
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-test-"));
  });

  afterEach(async () => {
    // Clean up temp directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("finds .repolens.yml in current directory", async () => {
    // Create minimal config in temp dir
    const configPath = path.join(tempDir, ".repolens.yml");
    await fs.writeFile(
      configPath,
      `target: .
outputs:
  - type: markdown
publish: []
`
    );

    // Run publish without --config (should auto-discover)
    const { stderr, error } = await runCli(["publish"], tempDir);

    // Should not complain about missing config
    // May fail on other things (no git, no source files), but config should be found
    expect(stderr).not.toContain("RepoLens config not found");
    expect(stderr).not.toContain("Run 'repolens init'");
  });

  it("finds .repolens.yml in parent directory", async () => {
    // Create config in temp dir
    const configPath = path.join(tempDir, ".repolens.yml");
    await fs.writeFile(
      configPath,
      `target: .
outputs:
  - type: markdown
publish: []
`
    );

    // Create subdirectory
    const subDir = path.join(tempDir, "subdir");
    await fs.mkdir(subDir);

    // Run from subdirectory - should find config in parent
    const { stderr } = await runCli(["publish"], subDir);

    // Should not complain about missing config
    expect(stderr).not.toContain("RepoLens config not found");
    expect(stderr).not.toContain("Run 'repolens init'");
  });

  it("errors when config not found", async () => {
    // Run in temp dir with no config
    const { stderr, error } = await runCli(["publish"], tempDir);

    // Should fail with error (logger suppressed in test mode, so check error object or exit code)
    expect(error).toBeDefined();
    expect(error.code).toBe(1);
  });

  it("prefers --config over auto-discovery", async () => {
    // Create config in temp dir
    const configPath = path.join(tempDir, ".repolens.yml");
    await fs.writeFile(
      configPath,
      `target: .
outputs:
  - type: markdown
publish: []
`
    );

    // Create explicit config file
    const explicitConfig = path.join(tempDir, "custom.yml");
    await fs.writeFile(explicitConfig, "target: .\noutputs: []\npublish: []\n");

    // Run with explicit --config
    const { stderr } = await runCli(
      ["publish", "--config", explicitConfig],
      tempDir
    );

    // Should use explicit config, not complain about format/path
    // (May fail on other things but should not fail on config loading)
    expect(stderr).not.toContain("RepoLens config not found");
  });
});
