import { describe, it, expect } from "vitest";
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function runNode(args) {
  return new Promise((resolve) => {
    execFile(
      "node",
      args,
      { env: { ...process.env, NODE_ENV: "test" } },
      (error, stdout, stderr) => {
        resolve({
          error,
          stdout: stdout || "",
          stderr: stderr || "",
          code: error ? error.code : 0,
        });
      }
    );
  });
}

describe("package entry", () => {
  it("importing the package does not execute the CLI", async () => {
    const entry = pathToFileURL(path.resolve(__dirname, "../src/index.js")).href;
    const { stdout, stderr, code } = await runNode([
      "--input-type=module",
      "-e",
      `const mod = await import(${JSON.stringify(entry)});
       if (typeof mod.scanRepo !== "function") process.exit(2);
       if (typeof mod.loadConfig !== "function") process.exit(3);`,
    ]);

    expect(code).toBe(0);
    expect(stdout).not.toContain("Repository Intelligence");
    expect(stdout).not.toContain("Usage:");
    expect(stderr).not.toContain("Unknown command");
  });

  it("importing the CLI module does not execute it", async () => {
    const entry = pathToFileURL(path.resolve(__dirname, "../src/cli.js")).href;
    const { stdout, stderr, code } = await runNode([
      "--input-type=module",
      "-e",
      `const mod = await import(${JSON.stringify(entry)});
       if (typeof mod.runCli !== "function") process.exit(2);`,
    ]);

    expect(code).toBe(0);
    expect(stdout).not.toContain("Repository Intelligence");
    expect(stderr).not.toContain("Unknown command");
  });
});
