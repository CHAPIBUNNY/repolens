import { describe, it, expect, vi } from "vitest";

vi.mock("../src/utils/logger.js", () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

import { computeCodeHealth } from "../src/analyzers/complexity-analyzer.js";
import { info } from "../src/utils/logger.js";

describe("code health with no files", () => {
  it("does not report a perfect score across 0 files", () => {
    info.mockClear();
    const result = computeCodeHealth(
      { files: [], functions: [], filesAnalyzed: 0 },
      { nodes: [] },
      { byFile: {} },
      { findings: [] }
    );
    expect(result.stats.avgScore).toBeNull();
    expect(result.summary).not.toContain("100/100");
    const logged = info.mock.calls.map((call) => String(call[0])).join("\n");
    expect(logged).toContain("no source files");
    expect(logged).not.toContain("100/100");
    expect(logged).not.toContain("across 0 files");
  });
});
