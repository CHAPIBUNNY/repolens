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
    expect(stdout).toContain("version");
    expect(stdout).toContain("--quick");  // Interactive is now the default
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
