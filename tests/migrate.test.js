import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { runMigrate } from "../src/migrate.js";

describe("runMigrate", () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-migrate-"));
    await fs.mkdir(path.join(tempDir, ".github", "workflows"), { recursive: true });
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it("detects and migrates legacy cd tools/repolens pattern", async () => {
    const legacyWorkflow = `name: RepoLens Documentation

on:
  push:
    branches:
      - main

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
      
      - name: Generate documentation
        run: |
          cd tools/repolens
          npm install
          npx repolens publish
`;

    const workflowPath = path.join(tempDir, ".github", "workflows", "repolens.yml");
    await fs.writeFile(workflowPath, legacyWorkflow, "utf8");

    await runMigrate(tempDir, { dryRun: false, force: true });

    const migrated = await fs.readFile(workflowPath, "utf8");

    expect(migrated).not.toContain("cd tools/repolens");
    expect(migrated).toContain("npx @chappibunny/repolens@latest publish");
    expect(migrated).toContain("actions/setup-node@");
    
    // Check backup was created
    const backup = await fs.readFile(`${workflowPath}.backup`, "utf8");
    expect(backup).toBe(legacyWorkflow);
  });

  it("adds environment variables if missing", async () => {
    const workflowWithoutEnv = `name: RepoLens Documentation

on:
  push:
    branches:
      - main

jobs:
  publish:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
      
      - name: Generate and publish documentation
        run: npx repolens publish
`;

    const workflowPath = path.join(tempDir, ".github", "workflows", "repolens.yml");
    await fs.writeFile(workflowPath, workflowWithoutEnv, "utf8");

    await runMigrate(tempDir, { dryRun: false, force: true });

    const migrated = await fs.readFile(workflowPath, "utf8");

    expect(migrated).toContain("npx @chappibunny/repolens@latest");
    expect(migrated).toContain("NOTION_TOKEN");
    expect(migrated).toContain("REPOLENS_AI_API_KEY");
  });

  it("skips already migrated workflows", async () => {
    const modernWorkflow = `name: RepoLens Documentation

on:
  push:
    branches:
      - main

jobs:
  publish:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
      
      - name: Generate and publish documentation
        env:
          NOTION_TOKEN: \${{ secrets.NOTION_TOKEN }}
          NOTION_PARENT_PAGE_ID: \${{ secrets.NOTION_PARENT_PAGE_ID }}
          REPOLENS_AI_API_KEY: \${{ secrets.REPOLENS_AI_API_KEY }}
          REPOLENS_AI_PROVIDER: openai
        run: npx repolens@latest publish
`;

    const workflowPath = path.join(tempDir, ".github", "workflows", "repolens.yml");
    await fs.writeFile(workflowPath, modernWorkflow, "utf8");

    await runMigrate(tempDir, { dryRun: false, force: true });

    const after = await fs.readFile(workflowPath, "utf8");
    
    // Should not create backup for already-migrated file
    try {
      await fs.access(`${workflowPath}.backup`);
      expect.fail("Backup should not exist for already-migrated workflow");
    } catch (err) {
      expect(err.code).toBe("ENOENT");
    }
    
    // Content should be unchanged
    expect(after).toBe(modernWorkflow);
  });

  it("handles dry-run mode without writing changes", async () => {
    const legacyWorkflow = `name: RepoLens Documentation

on:
  push:
    branches:
      - main

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - name: Generate documentation
        run: |
          cd tools/repolens
          npx repolens publish
`;

    const workflowPath = path.join(tempDir, ".github", "workflows", "repolens.yml");
    await fs.writeFile(workflowPath, legacyWorkflow, "utf8");

    await runMigrate(tempDir, { dryRun: true, force: true });

    const after = await fs.readFile(workflowPath, "utf8");
    
    // Should not modify file in dry-run mode
    expect(after).toBe(legacyWorkflow);
    
    // Should not create backup
    try {
      await fs.access(`${workflowPath}.backup`);
      expect.fail("Backup should not exist in dry-run mode");
    } catch (err) {
      expect(err.code).toBe("ENOENT");
    }
  });

  it("handles multiple workflow files", async () => {
    const legacy1 = `name: RepoLens
on: push
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - run: |
          cd tools/repolens
          npx repolens publish
`;

    const legacy2 = `name: RepoLens Staging
on: push
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - run: npx repolens publish
`;

    await fs.writeFile(path.join(tempDir, ".github", "workflows", "repolens.yml"), legacy1, "utf8");
    await fs.writeFile(path.join(tempDir, ".github", "workflows", "repolens-staging.yml"), legacy2, "utf8");

    await runMigrate(tempDir, { dryRun: false, force: true });

    const migrated1 = await fs.readFile(path.join(tempDir, ".github", "workflows", "repolens.yml"), "utf8");
    const migrated2 = await fs.readFile(path.join(tempDir, ".github", "workflows", "repolens-staging.yml"), "utf8");

    expect(migrated1).not.toContain("cd tools/repolens");
    expect(migrated1).toContain("npx @chappibunny/repolens@latest");
    expect(migrated2).toContain("npx @chappibunny/repolens@latest");
  });

  it("adds AI environment variables to existing env section", async () => {
    const workflowWithPartialEnv = `name: RepoLens Documentation

on:
  push:
    branches:
      - main

jobs:
  publish:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
      
      - name: Generate and publish documentation
        env:
          NOTION_TOKEN: \${{ secrets.NOTION_TOKEN }}
          NOTION_PARENT_PAGE_ID: \${{ secrets.NOTION_PARENT_PAGE_ID }}
        run: npx repolens publish
`;

    const workflowPath = path.join(tempDir, ".github", "workflows", "repolens.yml");
    await fs.writeFile(workflowPath, workflowWithPartialEnv, "utf8");

    await runMigrate(tempDir, { dryRun: false, force: true });

    const migrated = await fs.readFile(workflowPath, "utf8");

    expect(migrated).toContain("NOTION_TOKEN");
    expect(migrated).toContain("NOTION_PARENT_PAGE_ID");
    expect(migrated).toContain("REPOLENS_AI_API_KEY");
    expect(migrated).toContain("REPOLENS_AI_PROVIDER: openai");
  });

  it("does not create duplicate run keys when adding env vars", async () => {
    const workflowWithSimpleRun = `name: RepoLens Documentation

on:
  push:
    branches:
      - main

jobs:
  publish:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
      
      - name: Generate and publish documentation
        run: npx repolens publish
`;

    const workflowPath = path.join(tempDir, ".github", "workflows", "repolens.yml");
    await fs.writeFile(workflowPath, workflowWithSimpleRun, "utf8");

    await runMigrate(tempDir, { dryRun: false, force: true });

    const migrated = await fs.readFile(workflowPath, "utf8");

    // Count occurrences of 'run:' in the step (should be exactly 1)
    const stepMatch = migrated.match(/- name: Generate and publish documentation[\s\S]*?(?=\n\s{0,4}-|\n\n|$)/);
    expect(stepMatch).toBeTruthy();
    
    const runKeyCount = (stepMatch[0].match(/^\s+run:/gm) || []).length;
    expect(runKeyCount).toBe(1);
    
    // Verify env block exists and is properly positioned before run
    expect(migrated).toContain("env:");
    expect(migrated).toContain("NOTION_TOKEN");
    
    // Verify the structure is correct (env comes before run)
    const envIndex = migrated.indexOf("env:");
    const runIndex = migrated.indexOf("run:", envIndex);
    expect(envIndex).toBeLessThan(runIndex);
  });
});
