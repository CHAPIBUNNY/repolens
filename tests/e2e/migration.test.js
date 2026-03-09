/**
 * E2E Tests for Migration Tool
 * 
 * These tests use real workflow fixtures to ensure migration works correctly
 * and doesn't corrupt workflows like the bugs we encountered in production.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { runMigrate } from "../../src/migrate.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.join(__dirname, "fixtures", "workflows");

describe("Migration E2E Tests", () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-e2e-"));
    await fs.mkdir(path.join(tempDir, ".github", "workflows"), { recursive: true });
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  describe("Legacy Pattern Migration", () => {
    it("migrates legacy cd tools/repolens pattern correctly", async () => {
      // Copy fixture to temp dir
      const fixturePath = path.join(FIXTURES_DIR, "legacy-cd-pattern.yml");
      const targetPath = path.join(tempDir, ".github", "workflows", "repolens.yml");
      const fixtureContent = await fs.readFile(fixturePath, "utf8");
      await fs.writeFile(targetPath, fixtureContent, "utf8");

      // Run migration
      await runMigrate(tempDir, { dryRun: false, force: true });

      // Verify results
      const migrated = await fs.readFile(targetPath, "utf8");
      
      // Should remove cd tools/repolens
      expect(migrated).not.toContain("cd tools/repolens");
      
      // Should remove npm install from that block
      expect(migrated).not.toContain("npm install");
      
      // Should update to scoped package
      expect(migrated).toContain("npx @chappibunny/repolens@latest");
      
      // Should add Node.js setup
      expect(migrated).toContain("actions/setup-node@v4");
      expect(migrated).toContain("node-version: 20");
      
      // Should add environment variables
      expect(migrated).toContain("NOTION_TOKEN");
      expect(migrated).toContain("REPOLENS_AI_API_KEY");
      
      // Should create backup
      const backup = await fs.readFile(`${targetPath}.backup`, "utf8");
      expect(backup).toBe(fixtureContent);
      
      // Verify YAML structure is valid (no duplicate run: keys)
      const runKeyMatches = migrated.match(/^\s+run:/gm) || [];
      const stepsCount = (migrated.match(/- name:/g) || []).length;
      // Each step should have at most one run: key
      expect(runKeyMatches.length).toBeLessThanOrEqual(stepsCount);
    });
  });

  describe("Preserves Legitimate npm install", () => {
    it("does NOT remove npm ci from release workflows", async () => {
      // Copy fixture
      const fixturePath = path.join(FIXTURES_DIR, "release-with-npm-ci.yml");
      const targetPath = path.join(tempDir, ".github", "workflows", "release.yml");
      const fixtureContent = await fs.readFile(fixturePath, "utf8");
      await fs.writeFile(targetPath, fixtureContent, "utf8");

      // Run migration
      await runMigrate(tempDir, { dryRun: false, force: true });

      // Verify results
      const migrated = await fs.readFile(targetPath, "utf8");
      
      // Should KEEP npm ci
      expect(migrated).toContain("npm ci");
      expect(migrated).toContain("npm test");
      expect(migrated).toContain("npm pack");
      
      // Should still update npx repolens
      expect(migrated).toContain("npx @chappibunny/repolens@latest");
      
      // Should NOT have broken YAML structure
      expect(migrated).toMatch(/- name: Install dependencies\s+run: npm ci/);
      expect(migrated).toMatch(/- name: Run tests\s+run: npm test/);
      
      // Should NOT have duplicate run: keys
      const installStepMatch = migrated.match(/- name: Install dependencies[\s\S]*?(?=\n\s{0,6}-|\n\n|$)/);
      if (installStepMatch) {
        const runKeys = (installStepMatch[0].match(/^\s+run:/gm) || []).length;
        expect(runKeys).toBe(1);
      }
    });
  });

  describe("No-Op for Modern Workflows", () => {
    it("skips already-migrated workflows", async () => {
      // Copy fixture
      const fixturePath = path.join(FIXTURES_DIR, "modern-format.yml");
      const targetPath = path.join(tempDir, ".github", "workflows", "repolens.yml");
      const fixtureContent = await fs.readFile(fixturePath, "utf8");
      await fs.writeFile(targetPath, fixtureContent, "utf8");

      // Run migration
      await runMigrate(tempDir, { dryRun: false, force: true });

      // Verify results
      const migrated = await fs.readFile(targetPath, "utf8");
      
      // Should be unchanged
      expect(migrated).toBe(fixtureContent);
      
      // Should NOT create backup
      try {
        await fs.access(`${targetPath}.backup`);
        expect.fail("Backup should not exist for already-migrated workflow");
      } catch (err) {
        expect(err.code).toBe("ENOENT");
      }
    });
  });

  describe("Simple Workflows", () => {
    it("adds Node setup and env vars to simple workflows", async () => {
      // Copy fixture
      const fixturePath = path.join(FIXTURES_DIR, "simple-publish.yml");
      const targetPath = path.join(tempDir, ".github", "workflows", "simple.yml");
      const fixtureContent = await fs.readFile(fixturePath, "utf8");
      await fs.writeFile(targetPath, fixtureContent, "utf8");

      // Run migration
      await runMigrate(tempDir, { dryRun: false, force: true });

      // Verify results
      const migrated = await fs.readFile(targetPath, "utf8");
      
      // Should add Node setup
      expect(migrated).toContain("actions/setup-node@v4");
      
      // Should add env block
      expect(migrated).toContain("env:");
      expect(migrated).toContain("NOTION_TOKEN");
      
      // Should update package name
      expect(migrated).toContain("@chappibunny/repolens@latest");
      
      // Should have valid YAML structure
      expect(migrated).not.toContain("run:       - name:");
    });
  });

  describe("Complex Multi-Job Workflows", () => {
    it("only migrates the docs job, preserves others", async () => {
      // Copy fixture
      const fixturePath = path.join(FIXTURES_DIR, "complex-multi-job.yml");
      const targetPath = path.join(tempDir, ".github", "workflows", "ci.yml");
      const fixtureContent = await fs.readFile(fixturePath, "utf8");
      await fs.writeFile(targetPath, fixtureContent, "utf8");

      // Run migration
      await runMigrate(tempDir, { dryRun: false, force: true });

      // Verify results
      const migrated = await fs.readFile(targetPath, "utf8");
      
      // Should preserve npm ci in test and lint jobs
      const testJobMatch = migrated.match(/test:[\s\S]*?(?=\n\s{0,2}\w+:|$)/);
      const lintJobMatch = migrated.match(/lint:[\s\S]*?(?=\n\s{0,2}\w+:|$)/);
      
      expect(testJobMatch[0]).toContain("npm ci");
      expect(lintJobMatch[0]).toContain("npm ci");
      
      // Should update docs job
      const docsJobMatch = migrated.match(/docs:[\s\S]*?(?=\n\s{0,2}\w+:|$)/);
      expect(docsJobMatch[0]).toContain("@chappibunny/repolens@latest");
    });
  });

  describe("YAML Corruption Prevention", () => {
    it("never creates duplicate 'run:' keys", async () => {
      // Test all fixtures
      const fixtures = await fs.readdir(FIXTURES_DIR);
      
      for (const fixture of fixtures) {
        const fixturePath = path.join(FIXTURES_DIR, fixture);
        const targetPath = path.join(tempDir, ".github", "workflows", fixture);
        const fixtureContent = await fs.readFile(fixturePath, "utf8");
        await fs.writeFile(targetPath, fixtureContent, "utf8");
        
        // Run migration
        await runMigrate(tempDir, { dryRun: false, force: true });
        
        // Verify no duplicate run: keys in any step
        const migrated = await fs.readFile(targetPath, "utf8");
        const steps = migrated.split(/- name:/);
        
        for (const step of steps.slice(1)) { // Skip before first step
          const runKeys = (step.match(/^\s+run:/gm) || []).length;
          expect(runKeys, `Duplicate run: keys found in ${fixture}`).toBeLessThanOrEqual(1);
        }
        
        // Clean up for next iteration
        await fs.rm(targetPath);
        try {
          await fs.rm(`${targetPath}.backup`);
        } catch {}
      }
    });

    it("never creates 'run: <whitespace> - name:' corruption", async () => {
      const fixtures = await fs.readdir(FIXTURES_DIR);
      
      for (const fixture of fixtures) {
        const fixturePath = path.join(FIXTURES_DIR, fixture);
        const targetPath = path.join(tempDir, ".github", "workflows", fixture);
        const fixtureContent = await fs.readFile(fixturePath, "utf8");
        await fs.writeFile(targetPath, fixtureContent, "utf8");
        
        await runMigrate(tempDir, { dryRun: false, force: true });
        
        const migrated = await fs.readFile(targetPath, "utf8");
        
        // Should never have this corruption pattern
        expect(migrated, `Corruption found in ${fixture}`).not.toMatch(/run:\s+- name:/);
        
        // Clean up
        await fs.rm(targetPath);
        try {
          await fs.rm(`${targetPath}.backup`);
        } catch {}
      }
    });
  });
});
