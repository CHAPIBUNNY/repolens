import { describe, it, expect, afterEach } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bins = [];

afterEach(async () => {
  await Promise.all(bins.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function engineRepo() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-engines-"));
  bins.push(dir);
  await fs.writeFile(path.join(dir, "package.json"), JSON.stringify({
    name: "engine-host",
    private: true,
    devEngines: {
      runtime: { name: "node", version: ">=99.0.0", onFail: "error" },
    },
    engines: { node: ">=99.0.0" },
  }));
  return dir;
}

async function localBin() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-tiny-bin-"));
  bins.push(dir);
  await fs.writeFile(path.join(dir, "package.json"), JSON.stringify({
    name: "tiny-repolens-fixture",
    version: "1.0.0",
    bin: { "tiny-ok": "./ok.js" },
  }));
  await fs.writeFile(path.join(dir, "ok.js"), "#!/usr/bin/env node\nconsole.log('tiny-ok')\n");
  return dir;
}

function runNpx(cwd, args) {
  const result = spawnSync("npx", args, {
    cwd,
    encoding: "utf8",
    timeout: 30000,
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

describe("npx and the scanned repo's devEngines", () => {
  it("fails before the command starts, and --ignore-engines does not bypass it", async () => {
    const cwd = await engineRepo();
    const bin = await localBin();
    const plain = runNpx(cwd, ["--yes", "--package", bin, "tiny-ok"]);
    expect(plain.status).not.toBe(0);
    expect(plain.stderr).toContain("EBADDEVENGINES");
    expect(plain.stderr).toContain("devEngines");

    const ignored = runNpx(cwd, ["--ignore-engines", "--yes", "--package", bin, "tiny-ok"]);
    expect(ignored.status).not.toBe(0);
    expect(ignored.stderr).toContain("EBADDEVENGINES");
  });

  it("runs the command when npx is given --force", async () => {
    const cwd = await engineRepo();
    const bin = await localBin();
    const forced = runNpx(cwd, ["--force", "--yes", "--package", bin, "tiny-ok"]);
    expect(forced.status).toBe(0);
    expect(forced.stdout).toContain("tiny-ok");
    expect(forced.stderr).toContain("EBADDEVENGINES");
  });

  it("does not apply the scanned repo's engines once the CLI process has started", async () => {
    const cwd = await engineRepo();
    const stdout = execFileSync(process.execPath, [path.join(root, "bin/repolens.js"), "version"], {
      cwd,
      encoding: "utf8",
    });
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });
});
