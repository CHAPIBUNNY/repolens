import { describe, it, expect } from "vitest";
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

function runNode(args = []) {
  return new Promise((resolve, reject) => {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
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

describe("cli", () => {
  it("prints version", async () => {
    const { stdout } = await runNode(["--version"]);
    expect(stdout.trim()).toBe("1.5.3");
  });

  it("prints help", async () => {
    const { stdout } = await runNode(["--help"]);
    expect(stdout).toContain("RepoLens — Repository Intelligence CLI");
    expect(stdout).toContain("init");
    expect(stdout).toContain("doctor");
    expect(stdout).toContain("publish");
    expect(stdout).toContain("demo");
    expect(stdout).toContain("watch");
    expect(stdout).toContain("feedback");
    expect(stdout).toContain("version");
    expect(stdout).toContain("--interactive");
  });
});
