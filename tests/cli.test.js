import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../package.json"), "utf8"));

function runNode(args = []) {
  return new Promise((resolve, reject) => {
    const cliPath = path.resolve(__dirname, "../src/cli.js");

    execFile("node", [cliPath, ...args], { env: { ...process.env, NODE_ENV: "test" } }, (error, stdout, stderr) => {
      if (error) {
        reject({ error, stdout, stderr });
        return;
      }

      resolve({ stdout, stderr });
    });
  });
}

function runNodeAny(args = [], env = {}) {
  return new Promise((resolve) => {
    const cliPath = path.resolve(__dirname, "../src/cli.js");

    execFile("node", [cliPath, ...args], { env: { ...process.env, NODE_ENV: "test", ...env } }, (error, stdout, stderr) => {
      resolve({ error, stdout: stdout || "", stderr: stderr || "", exitCode: error ? error.code : 0 });
    });
  });
}

describe("cli", () => {
  it("prints version", async () => {
    const { stdout } = await runNode(["--version"]);
    expect(stdout.trim()).toBe(pkg.version);
  });

  it("prints help", async () => {
    const { stdout } = await runNode(["--help"]);
    expect(stdout).toContain("RepoLens — Repository Intelligence CLI");
    expect(stdout).toContain("init");
    expect(stdout).toContain("doctor");
    expect(stdout).toContain("publish");
    expect(stdout).toContain("demo");
    expect(stdout).toContain("watch");
    expect(stdout).toContain("uninstall");
    expect(stdout).toContain("feedback");
    expect(stdout).toContain("mcp");
    expect(stdout).toContain("version");
    expect(stdout).toContain("--quick");  // Interactive is now the default
    expect(stdout).toContain("Exit codes:");
  });

  it("rejects an unknown flag with exit code 2", async () => {
    const result = await runNodeAny(["publish", "--not-a-flag"], { NODE_ENV: "" });
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("Unknown option: --not-a-flag");
  });

  it("rejects --config without a path", async () => {
    const result = await runNodeAny(["publish", "--config"], { NODE_ENV: "" });
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("--config requires a value");
  });

  it("exits 2 when feedback has no terminal", async () => {
    const result = await runNodeAny(["feedback"]);
    expect(result.exitCode).toBe(2);
  });

  it("demo --target does not reuse the config in the current directory", async () => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "repolens-demo-target-"));
    await fsp.mkdir(path.join(dir, "src"));
    await fsp.writeFile(path.join(dir, "src/app.js"), "export const n = 1;\n");
    try {
      const result = await runNodeAny(["demo", "--target", dir], {
        NODE_ENV: "",
        CI: "true",
        GITHUB_TOKEN: "",
        REPOLENS_AI_API_KEY: "",
        REPOLENS_AI_ENABLED: "",
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("No .repolens.yml found");
      expect(result.stdout).not.toContain(path.resolve(__dirname, "../.repolens.yml"));
    } finally {
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });

  it("prints the version from the published binary without loading the CLI", async () => {
    const binPath = path.resolve(__dirname, "../bin/repolens.js");
    const result = await new Promise((resolve) => {
      execFile("node", [binPath, "--version"], { env: { ...process.env, NODE_ENV: "test" } }, (error, stdout, stderr) => {
        resolve({ code: error ? error.code : 0, stdout: stdout || "", stderr: stderr || "" });
      });
    });
    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe(pkg.version);
    expect(result.stderr).not.toContain("Repository Intelligence");
  });

  it("prints help when invoked with no arguments", async () => {
    const result = await runNodeAny([]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Usage:");
    expect(result.stdout).toContain("With no command");
    expect(result.stdout).not.toContain("Scanning repository");
  });

  it("prints per-command help", async () => {
    const initHelp = await runNodeAny(["init", "--help"]);
    expect(initHelp.exitCode).toBe(0);
    expect(initHelp.stdout).toContain("repolens init");
    expect(initHelp.stdout).toContain("--quick");
    expect(initHelp.stdout).toContain("Exit codes:");
    expect(initHelp.stdout).not.toContain("\nCommands:\n");

    const publishHelp = await runNodeAny(["publish", "--help"]);
    expect(publishHelp.stdout).toContain("--strict");
    expect(publishHelp.stdout).toContain("--config");

    const doctorHelp = await runNodeAny(["doctor", "--help"]);
    expect(doctorHelp.stdout).toContain("0 files");

    const watchHelp = await runNodeAny(["watch", "--help"]);
    expect(watchHelp.stdout).toContain("nothing to watch");

    const demoHelp = await runNodeAny(["demo", "--help"]);
    expect(demoHelp.stdout).toContain("0 files");

    for (const command of ["migrate", "uninstall", "feedback", "mcp"]) {
      const help = await runNodeAny([command, "--help"]);
      expect(help.exitCode).toBe(0);
      expect(help.stdout).toContain(`repolens ${command}`);
      expect(help.stdout).toContain("Exit codes:");
    }
  });

  it("exits 2 when --target does not exist", async () => {
    const missing = path.join(os.tmpdir(), `repolens-missing-${Date.now()}`);
    const result = await runNodeAny(["init", "--quick", "--target", missing], { NODE_ENV: "" });
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain(`Target directory not found: ${missing}`);
    expect(fs.existsSync(missing)).toBe(false);
  });

  it("hides the ASCII banner when CI is set", async () => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "repolens-banner-"));
    try {
      const result = await runNodeAny(["init", "--quick", "--target", dir], { NODE_ENV: "", CI: "true" });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).not.toContain("██████");
    } finally {
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });
});

describe("uninstall", () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "repolens-uninstall-"));
  });

  afterEach(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  });

  // Run uninstall without NODE_ENV=test so logger output is visible
  function runUninstall(args = []) {
    return runNodeAny(["uninstall", "--target", tmpDir, ...args], { NODE_ENV: "" });
  }

  it("reports nothing to remove when no RepoLens files exist", async () => {
    const { stdout } = await runUninstall(["--force"]);
    expect(stdout).toContain("No RepoLens files found");
  });

  it("removes .repolens/ output directory", async () => {
    const docsDir = path.join(tmpDir, ".repolens");
    await fsp.mkdir(docsDir, { recursive: true });
    await fsp.writeFile(path.join(docsDir, "test.md"), "# Test");

    const { stdout } = await runUninstall(["--force"]);
    expect(stdout).toContain("Removed .repolens/");
    expect(fs.existsSync(docsDir)).toBe(false);
  });

  it("removes config and init files", async () => {
    await fsp.writeFile(path.join(tmpDir, ".repolens.yml"), "configVersion: 1");
    await fsp.writeFile(path.join(tmpDir, ".env.example"), "# env");
    await fsp.writeFile(path.join(tmpDir, "README.repolens.md"), "# readme");
    const wfDir = path.join(tmpDir, ".github", "workflows");
    await fsp.mkdir(wfDir, { recursive: true });
    await fsp.writeFile(path.join(wfDir, "repolens.yml"), "name: RepoLens");

    const { stdout } = await runUninstall(["--force"]);
    expect(stdout).toContain("Removed .repolens.yml");
    expect(stdout).toContain("Removed .github/workflows/repolens.yml");
    expect(stdout).toContain("Removed .env.example");
    expect(stdout).toContain("Removed README.repolens.md");
    expect(stdout).toContain("Removed 4/4");

    expect(fs.existsSync(path.join(tmpDir, ".repolens.yml"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, ".env.example"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, "README.repolens.md"))).toBe(false);
    expect(fs.existsSync(path.join(wfDir, "repolens.yml"))).toBe(false);
  });

  it("removes all files from full init + demo setup", async () => {
    // Simulate full init output
    await fsp.writeFile(path.join(tmpDir, ".repolens.yml"), "configVersion: 1");
    await fsp.writeFile(path.join(tmpDir, ".env.example"), "# env");
    await fsp.writeFile(path.join(tmpDir, "README.repolens.md"), "# readme");
    const wfDir = path.join(tmpDir, ".github", "workflows");
    await fsp.mkdir(wfDir, { recursive: true });
    await fsp.writeFile(path.join(wfDir, "repolens.yml"), "name: RepoLens");
    // Simulate demo output
    const docsDir = path.join(tmpDir, ".repolens");
    await fsp.mkdir(path.join(docsDir, "artifacts"), { recursive: true });
    await fsp.writeFile(path.join(docsDir, "00-executive-summary.md"), "# Summary");
    await fsp.writeFile(path.join(docsDir, "artifacts", "ai-context.json"), "{}");

    const { stdout } = await runUninstall(["--force"]);
    expect(stdout).toContain("Removed 5/5");
    expect(fs.existsSync(docsDir)).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, ".repolens.yml"))).toBe(false);
  });

  it("shows reinstall hint after removal", async () => {
    await fsp.writeFile(path.join(tmpDir, ".repolens.yml"), "configVersion: 1");
    const { stdout } = await runUninstall(["--force"]);
    expect(stdout).toContain("repolens init");
    expect(stdout).toContain("npm uninstall");
  });
});
