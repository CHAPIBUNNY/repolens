/**
 * Watch Module Tests — Real Filesystem Events
 * 
 * Uses real temp directories and real fs.watch (no fake timers).
 * Pipeline modules (config, scan, render, write) remain mocked since
 * we're testing the watch/debounce/filter behaviour, not the pipeline.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// ── Pipeline mocks (these don't need real implementations) ──────────
vi.mock("../src/core/config.js", () => ({
  loadConfig: vi.fn(),
}));

vi.mock("../src/core/scan.js", () => ({
  scanRepo: vi.fn().mockResolvedValue({
    filesCount: 10, modules: [], api: [], pages: [], metadata: {},
  }),
}));

vi.mock("../src/docs/generate-doc-set.js", () => ({
  generateDocumentSet: vi.fn().mockResolvedValue({}),
}));

vi.mock("../src/docs/write-doc-set.js", () => ({
  writeDocumentSet: vi.fn().mockResolvedValue({ documentCount: 5 }),
}));

vi.mock("../src/core/diff.js", () => ({
  getGitDiff: vi.fn().mockReturnValue({ added: [], removed: [], modified: [] }),
}));

vi.mock("../src/utils/logger.js", () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

// ── Helpers ─────────────────────────────────────────────────────────
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

describe("watch module — real filesystem events", () => {
  let tmpDir;
  let liveWatchers;

  beforeEach(() => {
    vi.resetModules();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rl-watch-"));
    liveWatchers = [];

    // Wrap fs.watch so we can close watchers in cleanup
    const realWatch = fs.watch.bind(fs);
    vi.spyOn(fs, "watch").mockImplementation((...args) => {
      const watcher = realWatch(...args);
      liveWatchers.push(watcher);
      return watcher;
    });
  });

  afterEach(() => {
    for (const w of liveWatchers) {
      try { w.close(); } catch { /* already closed */ }
    }
    vi.restoreAllMocks();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ok */ }
  });

  // ── Helpers per-test ──────────────────────────────────────────────
  async function configureAndImport(moduleRoots) {
    const { loadConfig } = await import("../src/core/config.js");
    loadConfig.mockResolvedValue({
      __repoRoot: tmpDir,
      module_roots: moduleRoots,
      scan: { include: ["**/*.js"] },
      publishers: ["markdown"],
    });
    return {
      loadConfig,
      ...(await import("../src/utils/logger.js")),
      ...(await import("../src/core/scan.js")),
      ...(await import("../src/watch.js")),
    };
  }

  // ────────────────────────────────────────────────────────────────────
  it("warns and returns when no watchable directories exist", async () => {
    // tmpDir has no subdirectories matching module_roots
    const { runWatch, warn } = await configureAndImport(["nonexistent"]);

    // runWatch should resolve (not hang) when no dirs exist
    await runWatch(path.join(tmpDir, ".repolens.yml"));

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("No directories to watch"),
    );
  });

  it("sets up watchers for existing directories", async () => {
    fs.mkdirSync(path.join(tmpDir, "src"));

    const { runWatch, info } = await configureAndImport(["src", "nonexistent"]);

    // Don't await — hangs on `await new Promise(() => {})`
    runWatch(path.join(tmpDir, ".repolens.yml"));
    await wait(400);

    expect(fs.watch).toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith(expect.stringContaining("Watching"));
    // Only "src" should have a watcher (nonexistent is skipped)
    expect(liveWatchers.length).toBe(1);
  });

  it("triggers rebuild when a real file is written", async () => {
    const srcDir = path.join(tmpDir, "src");
    fs.mkdirSync(srcDir);

    const { runWatch, scanRepo } = await configureAndImport(["src"]);

    runWatch(path.join(tmpDir, ".repolens.yml"));
    await wait(400); // initial build + watcher setup
    scanRepo.mockClear(); // clear initial-build call

    // Write a real file — triggers the native fs watcher
    fs.writeFileSync(path.join(srcDir, "trigger.js"), "// changed");

    // Wait for debounce (500 ms) + OS filesystem event latency
    await wait(1500);

    expect(scanRepo).toHaveBeenCalled();
  }, 10_000);

  it("ignores node_modules changes in real filesystem", async () => {
    const srcDir = path.join(tmpDir, "src");
    fs.mkdirSync(srcDir);
    const nmDir = path.join(srcDir, "node_modules");
    fs.mkdirSync(nmDir);

    const { runWatch, scanRepo, info } = await configureAndImport(["src"]);

    runWatch(path.join(tmpDir, ".repolens.yml"));
    await wait(400);
    scanRepo.mockClear();
    info.mockClear();

    // Write inside node_modules — watcher should filter it out
    fs.writeFileSync(path.join(nmDir, "pkg.js"), "// nm change");

    await wait(1500);

    const changeDetectedCalls = info.mock.calls.filter(
      (c) => typeof c[0] === "string" && c[0].includes("Change detected"),
    );
    expect(changeDetectedCalls.length).toBe(0);
    expect(scanRepo).not.toHaveBeenCalled();
  }, 10_000);
});
