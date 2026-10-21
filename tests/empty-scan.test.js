import { describe, it, expect, afterEach } from "vitest";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gitDiffFailureMessage } from "../src/core/diff.js";
import { missingPublisherCredentials } from "../src/publishers/index.js";

const cliPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/cli.js");

function runCli(args, env = {}, cwd) {
  return new Promise((resolve) => {
    execFile("node", [cliPath, ...args], {
      cwd,
      env: {
        ...process.env,
        NODE_ENV: "",
        CI: "true",
        GITHUB_TOKEN: "",
        NOTION_TOKEN: "",
        NOTION_PARENT_PAGE_ID: "",
        CONFLUENCE_URL: "",
        CONFLUENCE_EMAIL: "",
        CONFLUENCE_API_TOKEN: "",
        CONFLUENCE_SPACE_KEY: "",
        REPOLENS_AI_API_KEY: "",
        REPOLENS_AI_ENABLED: "",
        ...env,
      },
    }, (error, stdout, stderr) => {
      resolve({
        exitCode: error ? error.code : 0,
        stdout: stdout || "",
        stderr: stderr || "",
      });
    });
  });
}

const VALID_PAGES = `
outputs:
  pages:
    - key: "system_overview"
      title: "System Overview"
`;

describe("empty scans and strict publish", () => {
  const dirs = [];

  afterEach(async () => {
    for (const dir of dirs) await fs.rm(dir, { recursive: true, force: true });
    dirs.length = 0;
  });

  async function tempDir() {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-empty-"));
    dirs.push(dir);
    return dir;
  }

  it("demo exits 2 and writes nothing when 0 files match", async () => {
    const dir = await tempDir();
    await fs.writeFile(path.join(dir, "README.md"), "# empty\n");

    const result = await runCli(["demo", "--target", dir]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("WARNING: 0 files scanned.");
    expect(result.stderr).toContain("Empty documentation was not written.");
    await expect(fs.access(path.join(dir, ".repolens"))).rejects.toThrow();
  });

  it("publish exits 2 when the configured globs match nothing", async () => {
    const dir = await tempDir();
    await fs.writeFile(path.join(dir, ".repolens.yml"), `configVersion: 1
project:
  name: "py-only"
publishers:
  - markdown
scan:
  include:
    - "src/**/*.{ts,tsx,js,jsx,md}"
  ignore:
    - "node_modules/**"
module_roots:
  - "src"
${VALID_PAGES}
`);
    await fs.mkdir(path.join(dir, "requests"));
    await fs.writeFile(path.join(dir, "requests", "api.py"), "def get():\n    return 1\n");

    const result = await runCli(["publish", "--config", path.join(dir, ".repolens.yml")]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("WARNING: 0 files scanned.");
  });

  it("demo scans a Python tree when no config is present", async () => {
    const dir = await tempDir();
    await fs.writeFile(path.join(dir, "setup.py"), "from setuptools import setup\nsetup(name='demo')\n");
    await fs.mkdir(path.join(dir, "pkg"));
    await fs.writeFile(path.join(dir, "pkg", "mod.py"), "VALUE = 1\n");

    const result = await runCli(["demo", "--target", dir]);
    expect(result.exitCode).toBe(0);
    const output = `${result.stdout}\n${result.stderr}`;
    expect(output).toContain("Python");
    expect(output).toContain("Code health: avg");
    expect(output).not.toContain("no source files analyzed");
    const docs = await fs.readdir(path.join(dir, ".repolens"));
    expect(docs.length).toBeGreaterThan(0);
  }, 20000);

  it("publish --strict exits 2 when Notion credentials are missing", async () => {
    const dir = await tempDir();
    await fs.mkdir(path.join(dir, "src"));
    await fs.writeFile(path.join(dir, "src", "app.js"), "export const n = 1;\n");
    const configPath = path.join(dir, ".repolens.yml");
    await fs.writeFile(configPath, `configVersion: 1
project:
  name: "strict"
publishers:
  - notion
  - markdown
scan:
  include:
    - "src/**/*.js"
  ignore:
    - "node_modules/**"
module_roots:
  - "src"
${VALID_PAGES}
`);

    const result = await runCli(["publish", "--config", configPath, "--strict"]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("Missing publisher credentials (--strict):");
    expect(result.stderr).toContain("NOTION_TOKEN");
    expect(result.stderr).toContain("NOTION_PARENT_PAGE_ID");
  });

  it("watch exits 2 when module_roots do not exist", async () => {
    const dir = await tempDir();
    const configPath = path.join(dir, ".repolens.yml");
    await fs.writeFile(configPath, `configVersion: 1
project:
  name: "watch"
publishers:
  - markdown
scan:
  include:
    - "**/*.js"
  ignore:
    - "node_modules/**"
module_roots:
  - "does-not-exist"
${VALID_PAGES}
`);

    const result = await runCli(["watch", "--config", configPath]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("No directories to watch");
    expect(result.stderr).toContain("module_roots");
  }, 20000);

  it("watch exits 2 after init --quick when no source files match", async () => {
    const dir = await tempDir();
    await fs.writeFile(path.join(dir, "README.md"), "# empty\n");

    const init = await runCli(["init", "--quick", "--target", dir]);
    expect(init.exitCode).toBe(0);

    const result = await runCli(["watch", "--config", path.join(dir, ".repolens.yml")], {}, dir);
    expect(result.exitCode).toBe(2);
    const output = `${result.stdout}\n${result.stderr}`;
    expect(output).toContain("No files matched scan.include");
    expect(output).toContain("Nothing to watch");
    expect(output).not.toContain("Waiting for changes");
  }, 20000);

  it("demo reports code health for a Go package", async () => {
    const dir = await tempDir();
    await fs.writeFile(path.join(dir, "go.mod"), "module example.com/demo\n\ngo 1.22\n");
    await fs.mkdir(path.join(dir, "pkg"));
    await fs.writeFile(path.join(dir, "pkg", "sum.go"), "package pkg\n\nfunc Sum(n int) int {\n\tif n < 0 {\n\t\treturn 0\n\t}\n\ttotal := 0\n\tfor i := 0; i < n; i++ {\n\t\ttotal += i\n\t}\n\treturn total\n}\n");
    await fs.writeFile(path.join(dir, "pkg", "sum_test.go"), "package pkg\n\nfunc TestSum(t *testing.T) {}\n");

    const result = await runCli(["demo", "--target", dir]);
    expect(result.exitCode).toBe(0);
    const output = `${result.stdout}\n${result.stderr}`;
    expect(output).toContain("Code health: avg");
    expect(output).not.toContain("no source files analyzed");
  }, 20000);
});

describe("git diff wording", () => {
  it("says not a git repository and drops the internal failure line", () => {
    expect(gitDiffFailureMessage("fatal: not a git repository (or any of the parent directories): .git", "Command failed"))
      .toBe("not a git repository");
    const other = gitDiffFailureMessage("fatal: bad object", "Command failed");
    expect(other).not.toContain("git diff failed, returning empty diff");
  });
});

describe("missingPublisherCredentials", () => {
  it("lists notion and obsidian gaps and ignores markdown", () => {
    const previous = {
      NOTION_TOKEN: process.env.NOTION_TOKEN,
      NOTION_PARENT_PAGE_ID: process.env.NOTION_PARENT_PAGE_ID,
    };
    delete process.env.NOTION_TOKEN;
    delete process.env.NOTION_PARENT_PAGE_ID;
    try {
      expect(missingPublisherCredentials({ publishers: ["markdown"] })).toEqual([]);
      expect(missingPublisherCredentials({
        publishers: ["notion", "obsidian"],
        obsidian: {},
      })).toEqual([
        "NOTION_TOKEN (required for notion)",
        "NOTION_PARENT_PAGE_ID (required for notion)",
        "obsidian.vault (required for obsidian)",
      ]);
    } finally {
      if (previous.NOTION_TOKEN == null) delete process.env.NOTION_TOKEN;
      else process.env.NOTION_TOKEN = previous.NOTION_TOKEN;
      if (previous.NOTION_PARENT_PAGE_ID == null) delete process.env.NOTION_PARENT_PAGE_ID;
      else process.env.NOTION_PARENT_PAGE_ID = previous.NOTION_PARENT_PAGE_ID;
    }
  });
});
