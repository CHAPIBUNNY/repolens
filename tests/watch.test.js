import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";

vi.mock("../src/core/config.js", () => ({
  loadConfig: vi.fn().mockResolvedValue({
    __repoRoot: "/fake/repo",
    module_roots: ["src", "lib"],
    scan: { include: ["**/*.js"] },
    publishers: ["markdown"],
  }),
}));

vi.mock("../src/core/scan.js", () => ({
  scanRepo: vi.fn().mockResolvedValue({
    filesCount: 10,
    modules: [],
    api: [],
    pages: [],
    metadata: {},
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

describe("watch module", () => {
  let accessSyncSpy;
  let watchSpy;

  beforeEach(() => {
    vi.useFakeTimers();
    accessSyncSpy = vi.spyOn(fs, "accessSync");
    watchSpy = vi.spyOn(fs, "watch");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("should warn and return when no watchable directories exist", async () => {
    const { warn } = await import("../src/utils/logger.js");

    // All directories fail access check
    accessSyncSpy.mockImplementation(() => {
      throw new Error("ENOENT");
    });

    const mockWatcher = { close: vi.fn() };
    watchSpy.mockReturnValue(mockWatcher);

    const { runWatch } = await import("../src/watch.js");

    // runWatch should resolve (not hang) when no dirs found
    const promise = runWatch("/fake/config.yml");
    await vi.advanceTimersByTimeAsync(100);

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("No directories to watch")
    );
  });

  it("should set up watchers for existing directories", async () => {
    const { info } = await import("../src/utils/logger.js");

    // "src" exists, "lib" does not
    accessSyncSpy.mockImplementation((dirPath) => {
      if (dirPath.includes("src")) return;
      throw new Error("ENOENT");
    });

    const mockWatcher = { close: vi.fn() };
    watchSpy.mockReturnValue(mockWatcher);

    const { runWatch } = await import("../src/watch.js");

    runWatch("/fake/config.yml");
    await vi.advanceTimersByTimeAsync(100);

    expect(watchSpy).toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith(expect.stringContaining("Watching"));
  });

  it("should ignore node_modules changes", async () => {
    accessSyncSpy.mockImplementation(() => {});

    let watchCallback;
    const mockWatcher = { close: vi.fn() };
    watchSpy.mockImplementation((dir, opts, cb) => {
      watchCallback = cb;
      return mockWatcher;
    });

    const { info } = await import("../src/utils/logger.js");
    const { runWatch } = await import("../src/watch.js");

    runWatch("/fake/config.yml");
    await vi.advanceTimersByTimeAsync(100);

    // Clear info calls from setup
    info.mockClear();

    // Trigger a change in node_modules — should be ignored
    if (watchCallback) {
      watchCallback("change", "node_modules/package/index.js");
    }

    await vi.advanceTimersByTimeAsync(1000);

    const changeDetectedCalls = info.mock.calls.filter(
      (call) => typeof call[0] === "string" && call[0].includes("Change detected")
    );
    expect(changeDetectedCalls.length).toBe(0);
  });
});
