import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { detectRepoLanguages } from "../src/core/languages.js";
import { scanRepo } from "../src/core/scan.js";

describe("detectRepoLanguages", () => {
  const dirs = [];

  afterEach(async () => {
    for (const dir of dirs) await fs.rm(dir, { recursive: true, force: true });
    dirs.length = 0;
  });

  async function tempRepo() {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-lang-"));
    dirs.push(dir);
    return dir;
  }

  it("detects a Python package that is not under src/", async () => {
    const dir = await tempRepo();
    await fs.writeFile(path.join(dir, "setup.py"), "from setuptools import setup\nsetup(name='requests')\n");
    await fs.mkdir(path.join(dir, "requests"));
    await fs.writeFile(path.join(dir, "requests", "api.py"), "def get():\n    return 1\n");
    await fs.mkdir(path.join(dir, "tests"));
    await fs.writeFile(path.join(dir, "tests", "test_api.py"), "def test_get():\n    assert True\n");

    const detected = await detectRepoLanguages(dir);
    expect(detected.languages.map((lang) => lang.id)).toContain("python");
    expect(detected.include).toContain("**/*.py");
    expect(detected.include.some((pattern) => pattern.includes("tsx"))).toBe(false);
    expect(detected.moduleRoots).toContain("requests");
    expect(detected.moduleRoots).toContain("tests");
    expect(detected.moduleRoots.indexOf("requests")).toBeLessThan(detected.moduleRoots.indexOf("tests"));

    const scan = await scanRepo({
      __repoRoot: dir,
      scan: { include: detected.include, ignore: ["**/__pycache__/**"] },
      module_roots: detected.moduleRoots,
    });
    expect(scan.filesCount).toBeGreaterThan(0);
  });

  it("detects Go module roots", async () => {
    const dir = await tempRepo();
    await fs.writeFile(path.join(dir, "go.mod"), "module example.com/demo\n\ngo 1.22\n");
    await fs.mkdir(path.join(dir, "internal", "api"), { recursive: true });
    await fs.writeFile(path.join(dir, "internal", "api", "server.go"), "package api\n");

    const detected = await detectRepoLanguages(dir);
    expect(detected.languages.map((lang) => lang.id)).toEqual(["go"]);
    expect(detected.include).toEqual(["**/*.go"]);
    expect(detected.moduleRoots).toContain("internal");
  });

  it("keeps both languages in a polyglot repo", async () => {
    const dir = await tempRepo();
    await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}\n');
    await fs.writeFile(path.join(dir, "pyproject.toml"), "[project]\nname = 'demo'\n");
    await fs.mkdir(path.join(dir, "src"));
    await fs.writeFile(path.join(dir, "src", "app.ts"), "export const n = 1;\n");
    await fs.mkdir(path.join(dir, "app"));
    await fs.writeFile(path.join(dir, "app", "main.py"), "print('hi')\n");

    const detected = await detectRepoLanguages(dir);
    const ids = detected.languages.map((lang) => lang.id);
    expect(ids).toContain("python");
    expect(ids).toContain("javascript");
    expect(detected.moduleRoots).toEqual(expect.arrayContaining(["src", "app"]));
  });

  it("falls back to multi-language globs when nothing is recognized", async () => {
    const dir = await tempRepo();
    await fs.writeFile(path.join(dir, "README.md"), "# notes\n");

    const detected = await detectRepoLanguages(dir);
    expect(detected.languages).toEqual([]);
    expect(detected.include[0]).toContain("py");
    expect(detected.include[0]).toContain("go");
    expect(detected.include[0]).toContain("rs");
    expect(detected.moduleRoots.length).toBeGreaterThan(0);
  });
});
