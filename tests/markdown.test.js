import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { publishToMarkdown } from "../src/publishers/markdown.js";

describe("publishToMarkdown", () => {
  let repoRoot;

  afterEach(async () => {
    if (repoRoot) {
      await fs.rm(repoRoot, { recursive: true, force: true });
      repoRoot = null;
    }
  });

  it("writes markdown output files into .repolens", async () => {
    repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-md-"));

    const cfg = {
      __repoRoot: repoRoot
    };

    const renderedPages = {
      system_overview: "# Overview",
      module_catalog: "# Modules",
      api_surface: "# API",
      arch_diff: "# Diff",
      route_map: "# Routes",
      system_map: "# Map"
    };

    await publishToMarkdown(cfg, renderedPages);

    const outputDir = path.join(repoRoot, ".repolens");
    const files = await fs.readdir(outputDir);

    expect(files).toContain("system_overview.md");
    expect(files).toContain("module_catalog.md");
    expect(files).toContain("api_surface.md");
    expect(files).toContain("architecture_diff.md");
    expect(files).toContain("route_map.md");
    expect(files).toContain("system_map.md");

    const overview = await fs.readFile(path.join(outputDir, "system_overview.md"), "utf8");
    expect(overview).toBe("# Overview");
  });
});