import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

// Mock child_process to avoid real git operations
vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

import { execSync } from "node:child_process";

describe("GitHub Wiki Publisher", () => {
  let tmpDir;
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-wiki-test-"));
    process.env.GITHUB_TOKEN = "ghp_testtoken123";
    process.env.GITHUB_REPOSITORY = "testowner/testrepo";
  });

  afterEach(async () => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true });
      tmpDir = null;
    }
  });

  describe("hasGitHubWikiSecrets", () => {
    it("returns true when GITHUB_TOKEN is set", async () => {
      const { hasGitHubWikiSecrets } = await import("../src/publishers/github-wiki.js");
      process.env.GITHUB_TOKEN = "ghp_test123";
      expect(hasGitHubWikiSecrets()).toBe(true);
    });

    it("returns false when GITHUB_TOKEN is missing", async () => {
      const { hasGitHubWikiSecrets } = await import("../src/publishers/github-wiki.js");
      delete process.env.GITHUB_TOKEN;
      expect(hasGitHubWikiSecrets()).toBe(false);
    });
  });

  describe("publishToGitHubWiki", () => {
    it("throws when GITHUB_TOKEN is missing", async () => {
      const { publishToGitHubWiki } = await import("../src/publishers/github-wiki.js");
      delete process.env.GITHUB_TOKEN;

      const cfg = { project: { name: "TestProject" } };
      const pages = { system_overview: "# Overview" };

      await expect(publishToGitHubWiki(cfg, pages)).rejects.toThrow("Missing GITHUB_TOKEN");
    });

    it("throws when repository cannot be detected", async () => {
      const { publishToGitHubWiki } = await import("../src/publishers/github-wiki.js");
      delete process.env.GITHUB_REPOSITORY;
      
      // Mock git remote failing
      execSync.mockImplementation((cmd) => {
        if (cmd.includes("remote get-url")) {
          throw new Error("not a git repository");
        }
        throw new Error(`Unexpected command: ${cmd}`);
      });

      const cfg = { project: { name: "TestProject" } };
      const pages = { system_overview: "# Overview" };

      await expect(publishToGitHubWiki(cfg, pages)).rejects.toThrow("Could not detect GitHub repository");
    });

    it("clones wiki, writes files, commits and pushes", async () => {
      const { publishToGitHubWiki } = await import("../src/publishers/github-wiki.js");

      // Track git commands issued
      const gitCommands = [];
      execSync.mockImplementation((cmd, opts) => {
        gitCommands.push(cmd);
        
        // git clone: create a fake .git dir so it looks like a repo
        if (cmd.includes("clone")) {
          const cwd = opts?.cwd || tmpDir;
          // Simulate successful clone (directory already exists from mkdtemp)
          return "";
        }
        
        // git diff --cached --quiet: throw to indicate there ARE changes
        if (cmd.includes("diff --cached --quiet")) {
          throw new Error("changes exist");
        }

        // git rev-parse: return branch name
        if (cmd.includes("rev-parse --abbrev-ref HEAD")) {
          return "main\n";
        }

        // All other git commands succeed
        return "";
      });

      const cfg = {
        project: { name: "TestProject" },
        github_wiki: { sidebar: true, footer: true },
      };

      const pages = {
        system_overview: "# System Overview\nContent here",
        module_catalog: "# Module Catalog\nModules listed",
        executive_summary: "# Executive Summary\nSummary here",
      };

      await publishToGitHubWiki(cfg, pages);

      // Verify clone was called with wiki URL
      expect(gitCommands.some(c => c.includes("clone") && c.includes(".wiki.git"))).toBe(true);

      // Verify add, commit, push were called
      expect(gitCommands.some(c => c.includes("add -A"))).toBe(true);
      expect(gitCommands.some(c => c.includes("commit"))).toBe(true);
      expect(gitCommands.some(c => c.includes("push origin HEAD:refs/heads/master"))).toBe(true);
    });

    it("skips push when wiki is up to date", async () => {
      const { publishToGitHubWiki } = await import("../src/publishers/github-wiki.js");

      const gitCommands = [];
      execSync.mockImplementation((cmd, opts) => {
        gitCommands.push(cmd);

        // git diff --cached --quiet: NO throw = no changes
        if (cmd.includes("diff --cached --quiet")) {
          return "";
        }

        if (cmd.includes("rev-parse --abbrev-ref HEAD")) {
          return "main\n";
        }

        return "";
      });

      const cfg = { project: { name: "Test" } };
      const pages = { system_overview: "# Overview" };

      await publishToGitHubWiki(cfg, pages);

      // commit and push should NOT be called
      expect(gitCommands.some(c => c.includes("commit"))).toBe(false);
      expect(gitCommands.some(c => c.includes("push"))).toBe(false);
    });

    it("initializes wiki when clone fails", async () => {
      const { publishToGitHubWiki } = await import("../src/publishers/github-wiki.js");

      const gitCommands = [];
      execSync.mockImplementation((cmd, opts) => {
        gitCommands.push(cmd);

        // Clone fails (wiki not yet initialized)
        if (cmd.includes("clone")) {
          throw new Error("repository not found");
        }

        if (cmd.includes("diff --cached --quiet")) {
          throw new Error("changes exist");
        }

        if (cmd.includes("rev-parse --abbrev-ref HEAD")) {
          return "main\n";
        }

        return "";
      });

      const cfg = { project: { name: "Test" } };
      const pages = { system_overview: "# Overview" };

      await publishToGitHubWiki(cfg, pages);

      // Should fall back to git init with master branch + remote add
      expect(gitCommands.some(c => c.includes("init -b master"))).toBe(true);
      expect(gitCommands.some(c => c.includes("remote add origin"))).toBe(true);

      // Should push explicitly to master for GitHub Wiki compatibility
      expect(gitCommands.some(c => c.includes("push origin HEAD:refs/heads/master"))).toBe(true);
    });

    it("sanitizes token from error messages", async () => {
      const { publishToGitHubWiki } = await import("../src/publishers/github-wiki.js");
      process.env.GITHUB_TOKEN = "ghp_supersecrettoken123";

      execSync.mockImplementation((cmd) => {
        if (cmd.includes("clone")) {
          const err = new Error("clone failed");
          err.stderr = "fatal: could not access x-access-token:ghp_supersecrettoken123@github.com";
          throw err;
        }
        // init/remote add also fail to force the error to propagate
        if (cmd.includes("init")) {
          const err = new Error("init failed");
          err.stderr = "x-access-token:ghp_supersecrettoken123 leaked";
          throw err;
        }
        return "";
      });

      const cfg = { project: { name: "Test" } };
      const pages = { system_overview: "# Overview" };

      try {
        await publishToGitHubWiki(cfg, pages);
      } catch (err) {
        // Token should never appear in the error message
        expect(err.message).not.toContain("ghp_supersecrettoken123");
        expect(err.message).toContain("x-access-token:***");
      }
    });

    it("generates sidebar with grouped wiki links", async () => {
      const { publishToGitHubWiki } = await import("../src/publishers/github-wiki.js");

      let writtenFiles = {};
      execSync.mockImplementation((cmd, opts) => {
        if (cmd.includes("diff --cached --quiet")) {
          throw new Error("changes exist");
        }
        if (cmd.includes("rev-parse --abbrev-ref HEAD")) {
          return "main\n";
        }
        return "";
      });

      const writeSpy = vi.spyOn(fs, "writeFile").mockImplementation(async (filePath, content, enc) => {
        const basename = path.basename(filePath);
        writtenFiles[basename] = content;
      });

      vi.spyOn(fs, "mkdtemp").mockResolvedValue(tmpDir);
      vi.spyOn(fs, "rm").mockResolvedValue(undefined);

      const cfg = {
        project: { name: "MyApp" },
        github_wiki: { sidebar: true, footer: false },
      };

      const pages = {
        system_overview: "# Overview",
        api_surface: "# API",
        executive_summary: "# Exec Summary",
      };

      await publishToGitHubWiki(cfg, pages);

      // Sidebar should have grouped sections and wiki links
      expect(writtenFiles["_Sidebar.md"]).toBeDefined();
      expect(writtenFiles["_Sidebar.md"]).toContain("[[Home]]");
      expect(writtenFiles["_Sidebar.md"]).toContain("**Overview**");
      expect(writtenFiles["_Sidebar.md"]).toContain("**Architecture**");
      expect(writtenFiles["_Sidebar.md"]).toContain("[[System Overview|System-Overview]]");
      expect(writtenFiles["_Sidebar.md"]).toContain("[[API Surface|API-Surface]]");
      expect(writtenFiles["_Sidebar.md"]).toContain("[[Executive Summary|Executive-Summary]]");

      // Footer should NOT exist (footer: false)
      expect(writtenFiles["_Footer.md"]).toBeUndefined();

      // Home.md should have audience-grouped layout
      expect(writtenFiles["Home.md"]).toBeDefined();
      expect(writtenFiles["Home.md"]).toContain("MyApp Documentation");
      expect(writtenFiles["Home.md"]).toContain("For Stakeholders");
      expect(writtenFiles["Home.md"]).toContain("For Engineers");
      expect(writtenFiles["Home.md"]).toContain("For New Contributors");
      expect(writtenFiles["Home.md"]).toContain("## Status");

      // Pages should have metadata headers
      expect(writtenFiles["System-Overview.md"]).toBeDefined();
      expect(writtenFiles["System-Overview.md"]).toContain("[← Home](Home)");
      expect(writtenFiles["System-Overview.md"]).toContain("**Audience:**");

      writeSpy.mockRestore();
    });
  });

  describe("shouldPublishToGitHubWiki (via branch.js)", () => {
    it("allows all branches when no config", async () => {
      const { shouldPublishToGitHubWiki } = await import("../src/utils/branch.js");
      expect(shouldPublishToGitHubWiki({}, "feature-x")).toBe(true);
    });

    it("allows all branches when branches array is empty", async () => {
      const { shouldPublishToGitHubWiki } = await import("../src/utils/branch.js");
      expect(shouldPublishToGitHubWiki({ github_wiki: { branches: [] } }, "main")).toBe(true);
    });

    it("filters by exact branch match", async () => {
      const { shouldPublishToGitHubWiki } = await import("../src/utils/branch.js");
      const cfg = { github_wiki: { branches: ["main", "develop"] } };
      expect(shouldPublishToGitHubWiki(cfg, "main")).toBe(true);
      expect(shouldPublishToGitHubWiki(cfg, "develop")).toBe(true);
      expect(shouldPublishToGitHubWiki(cfg, "feature-x")).toBe(false);
    });

    it("supports wildcard patterns", async () => {
      const { shouldPublishToGitHubWiki } = await import("../src/utils/branch.js");
      const cfg = { github_wiki: { branches: ["main", "release/*"] } };
      expect(shouldPublishToGitHubWiki(cfg, "release/1.0")).toBe(true);
      expect(shouldPublishToGitHubWiki(cfg, "feature/auth")).toBe(false);
    });
  });

  describe("config-schema validation", () => {
    it("accepts github_wiki as a valid publisher", async () => {
      const { validateConfig } = await import("../src/core/config-schema.js");
      const config = {
        configVersion: 1,
        project: { name: "test" },
        publishers: ["github_wiki", "markdown"],
        scan: { include: ["src/**"], ignore: ["node_modules"] },
        outputs: { pages: [{ key: "system_overview", title: "Overview" }] },
      };
      expect(() => validateConfig(config)).not.toThrow();
    });

    it("validates github_wiki config section", async () => {
      const { validateConfig } = await import("../src/core/config-schema.js");
      const config = {
        configVersion: 1,
        project: { name: "test" },
        publishers: ["markdown"],
        scan: { include: ["src/**"], ignore: ["node_modules"] },
        outputs: { pages: [{ key: "system_overview", title: "Overview" }] },
        github_wiki: {
          branches: ["main"],
          sidebar: true,
          footer: true,
        },
      };
      expect(() => validateConfig(config)).not.toThrow();
    });

    it("rejects invalid github_wiki.branches type", async () => {
      const { validateConfig } = await import("../src/core/config-schema.js");
      const config = {
        configVersion: 1,
        project: { name: "test" },
        publishers: ["markdown"],
        scan: { include: ["src/**"], ignore: ["node_modules"] },
        outputs: { pages: [{ key: "system_overview", title: "Overview" }] },
        github_wiki: { branches: "main" },
      };
      expect(() => validateConfig(config)).toThrow("github_wiki.branches must be an array");
    });

    it("rejects invalid github_wiki.sidebar type", async () => {
      const { validateConfig } = await import("../src/core/config-schema.js");
      const config = {
        configVersion: 1,
        project: { name: "test" },
        publishers: ["markdown"],
        scan: { include: ["src/**"], ignore: ["node_modules"] },
        outputs: { pages: [{ key: "system_overview", title: "Overview" }] },
        github_wiki: { sidebar: "yes" },
      };
      expect(() => validateConfig(config)).toThrow("github_wiki.sidebar must be a boolean");
    });
  });
});
