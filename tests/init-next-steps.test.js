import { describe, it, expect, afterEach, vi } from "vitest";

vi.mock("../src/utils/logger.js", () => ({
  info: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("../src/utils/invocation.js", () => ({
  repolensCommand: (subcommand) => `repolens ${subcommand}`,
}));

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runInit } from "../src/init.js";
import { info } from "../src/utils/logger.js";

describe("init next steps", () => {
  let tempDir;

  afterEach(async () => {
    info.mockClear();
    if (tempDir) await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("names the global repolens command when that is how the CLI is installed", async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-next-"));
    await runInit(tempDir, { interactive: false });
    const lines = info.mock.calls.map((call) => String(call[0]));
    expect(lines.some((line) => line.includes("repolens publish"))).toBe(true);
    expect(lines.some((line) => line.includes("npx @chappibunny/repolens"))).toBe(false);
  });
});
