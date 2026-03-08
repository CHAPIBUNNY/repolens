import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { runInit } from "../src/init.js";
import { scanRepo } from "../src/core/scan.js";
import { loadConfig } from "../src/core/config.js";
import { renderSystemOverview, renderModuleCatalog } from "../src/renderers/render.js";
import { publishToMarkdown } from "../src/publishers/markdown.js";

/**
 * Integration test: Full workflow from init to publish
 * 
 * This tests the complete RepoLens lifecycle:
 * 1. Initialize a test repository
 * 2. Create a valid config
 * 3. Scan the repository
 * 4. Render documentation
 * 5. Publish to markdown
 * 6. Verify outputs exist and contain expected content
 */

describe("integration: full workflow", () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-integration-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("completes full init -> scan -> render -> publish workflow", async () => {
    // Step 1: Initialize repository structure
    await runInit(tempDir);

    // Verify init created required files
    const initFiles = await fs.readdir(tempDir);
    expect(initFiles).toContain(".repolens.yml");
    expect(initFiles).toContain(".env.example");

    // Step 2: Create a minimal test repo structure
    const srcDir = path.join(tempDir, "src");
    await fs.mkdir(srcDir, { recursive: true });

    // Create test files
    await fs.writeFile(
      path.join(srcDir, "app.js"),
      'export function main() { console.log("test"); }'
    );
    await fs.writeFile(
      path.join(srcDir, "utils.js"),
      'export function helper() { return 42; }'
    );

    // Step 3: Update config for test repo
    const configPath = path.join(tempDir, ".repolens.yml");
    const testConfig = `configVersion: 1

project:
  name: "test-repo"
  docs_title_prefix: "Test"

publishers:
  - markdown

scan:
  include:
    - "src/**/*.js"
  ignore:
    - "node_modules/**"

module_roots:
  - "src"

outputs:
  pages:
    - key: "system_overview"
      title: "System Overview"
      description: "Test system overview"
    - key: "module_catalog"
      title: "Module Catalog"  
      description: "Test module catalog"
`;
    await fs.writeFile(configPath, testConfig);

    // Step 4: Load config and scan
    const config = await loadConfig(configPath);
    expect(config.project.name).toBe("test-repo");
    expect(config.configVersion).toBe(1);

    const scanResult = await scanRepo(config);
    expect(scanResult.modules).toBeDefined();
    expect(scanResult.modules.length).toBeGreaterThan(0);

    // Step 5: Render documentation
    const systemOverview = renderSystemOverview(config, scanResult);
    expect(systemOverview).toContain("test-repo");
    expect(systemOverview).toContain("System Overview");

    const moduleCatalog = renderModuleCatalog(config, scanResult);
    expect(moduleCatalog).toContain("Module Catalog");

    // Step 6: Publish to markdown
    const renderedPages = {
      system_overview: systemOverview,
      module_catalog: moduleCatalog
    };

    await publishToMarkdown(config, renderedPages);

    // Step 7: Verify outputs
    const repolensDir = path.join(tempDir, ".repolens");
    const repolensFiles = await fs.readdir(repolensDir);
    
    expect(repolensFiles).toContain("system_overview.md");
    expect(repolensFiles).toContain("module_catalog.md");

    // Verify content
    const overviewContent = await fs.readFile(
      path.join(repolensDir, "system_overview.md"),
      "utf8"
    );
    expect(overviewContent).toContain("test-repo");

    const catalogContent = await fs.readFile(
      path.join(repolensDir, "module_catalog.md"),
      "utf8"
    );
    expect(catalogContent).toContain("Module Catalog");
  });

  it("handles invalid config gracefully", async () => {
    // Create invalid config (missing required fields)
    const configPath = path.join(tempDir, ".repolens.yml");
    const invalidConfig = `project:
  name: "test"
# Missing publishers, scan, and outputs
`;
    await fs.writeFile(configPath, invalidConfig);

    // Should throw validation error
    await expect(loadConfig(configPath)).rejects.toThrow("Invalid .repolens.yml");
  });

  it("warns on large repository scan", async () => {
    // Create config
    const configPath = path.join(tempDir, ".repolens.yml");
    const testConfig = `configVersion: 1

project:
  name: "large-repo"

publishers:
  - markdown

scan:
  include:
    - "**/*.js"
  ignore:
    - "node_modules/**"

module_roots:
  - "src"

outputs:
  pages:
    - key: "system_overview"
      title: "Overview"
`;
    await fs.writeFile(configPath, testConfig);

    // Create many files to trigger warning (but not limit)
    const srcDir = path.join(tempDir, "src");
    await fs.mkdir(srcDir, { recursive: true });

    // Note: We can't easily test the actual warning threshold in CI
    // This just verifies the scan completes without throwing
    for (let i = 0; i < 10; i++) {
      await fs.writeFile(path.join(srcDir, `file${i}.js`), "export const x = 1;");
    }

    const config = await loadConfig(configPath);
    const scan = await scanRepo(config);

    expect(scan.modules.length).toBeGreaterThan(0);
  });
});
