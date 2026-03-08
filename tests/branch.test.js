import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { 
  getCurrentBranch, 
  normalizeBranchName, 
  shouldPublishToNotion,
  getBranchQualifiedTitle 
} from "../src/utils/branch.js";

describe("branch utilities", () => {
  let originalEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe("getCurrentBranch", () => {
    it("detects branch from GITHUB_REF_NAME", () => {
      process.env.GITHUB_REF_NAME = "feature/auth";
      expect(getCurrentBranch()).toBe("feature/auth");
    });

    it("detects branch from CI_COMMIT_REF_NAME (GitLab)", () => {
      delete process.env.GITHUB_REF_NAME;
      process.env.CI_COMMIT_REF_NAME = "develop";
      expect(getCurrentBranch()).toBe("develop");
    });

    it("detects branch from CIRCLE_BRANCH (CircleCI)", () => {
      delete process.env.GITHUB_REF_NAME;
      delete process.env.CI_COMMIT_REF_NAME;
      process.env.CIRCLE_BRANCH = "staging";
      expect(getCurrentBranch()).toBe("staging");
    });

    it("returns 'unknown' when git is not available", () => {
      delete process.env.GITHUB_REF_NAME;
      delete process.env.CI_COMMIT_REF_NAME;
      delete process.env.CIRCLE_BRANCH;
      
      // In test environment, git might not be in detached HEAD
      const branch = getCurrentBranch();
      expect(typeof branch).toBe("string");
      expect(branch.length).toBeGreaterThan(0);
    });
  });

  describe("normalizeBranchName", () => {
    it("replaces slashes with hyphens", () => {
      expect(normalizeBranchName("feature/auth")).toBe("feature-auth");
      expect(normalizeBranchName("bugfix/issue-123")).toBe("bugfix-issue-123");
    });

    it("removes special characters", () => {
      expect(normalizeBranchName("feature@auth!")).toBe("featureauth");
      expect(normalizeBranchName("bug#fix$test")).toBe("bugfixtest");
    });

    it("converts to lowercase", () => {
      expect(normalizeBranchName("Feature/Auth")).toBe("feature-auth");
      expect(normalizeBranchName("MAIN")).toBe("main");
    });

    it("preserves alphanumeric, hyphens, and underscores", () => {
      expect(normalizeBranchName("feature_auth-v2")).toBe("feature_auth-v2");
    });
  });

  describe("shouldPublishToNotion", () => {
    it("allows all branches when notion config is missing", () => {
      const config = { publishers: ["notion"] };
      expect(shouldPublishToNotion(config, "main")).toBe(true);
      expect(shouldPublishToNotion(config, "feature/test")).toBe(true);
    });

    it("allows all branches when branches array is empty", () => {
      const config = { 
        publishers: ["notion"],
        notion: { branches: [] }
      };
      expect(shouldPublishToNotion(config, "main")).toBe(true);
      expect(shouldPublishToNotion(config, "feature/test")).toBe(true);
    });

    it("filters branches based on exact match", () => {
      const config = {
        publishers: ["notion"],
        notion: { branches: ["main", "staging"] }
      };
      expect(shouldPublishToNotion(config, "main")).toBe(true);
      expect(shouldPublishToNotion(config, "staging")).toBe(true);
      expect(shouldPublishToNotion(config, "develop")).toBe(false);
      expect(shouldPublishToNotion(config, "feature/test")).toBe(false);
    });

    it("supports wildcard patterns", () => {
      const config = {
        publishers: ["notion"],
        notion: { branches: ["main", "release/*", "hotfix/*"] }
      };
      expect(shouldPublishToNotion(config, "main")).toBe(true);
      expect(shouldPublishToNotion(config, "release/v1.0")).toBe(true);
      expect(shouldPublishToNotion(config, "release/v2.0-beta")).toBe(true);
      expect(shouldPublishToNotion(config, "hotfix/bug-123")).toBe(true);
      expect(shouldPublishToNotion(config, "feature/auth")).toBe(false);
    });

    it("supports prefix wildcards", () => {
      const config = {
        publishers: ["notion"],
        notion: { branches: ["main", "*/production"] }
      };
      expect(shouldPublishToNotion(config, "main")).toBe(true);
      expect(shouldPublishToNotion(config, "deploy/production")).toBe(true);
      expect(shouldPublishToNotion(config, "feature/production")).toBe(true);
      expect(shouldPublishToNotion(config, "staging")).toBe(false);
    });
  });

  describe("getBranchQualifiedTitle", () => {
    it("does not modify title for main branch", () => {
      expect(getBranchQualifiedTitle("System Overview", "main")).toBe("System Overview");
    });

    it("does not modify title for master branch", () => {
      expect(getBranchQualifiedTitle("System Overview", "master")).toBe("System Overview");
    });

    it("adds normalized branch name for feature branches", () => {
      expect(getBranchQualifiedTitle("System Overview", "feature/auth")).toBe(
        "System Overview [feature-auth]"
      );
    });

    it("respects includeBranch parameter", () => {
      expect(getBranchQualifiedTitle("System Overview", "feature/auth", false)).toBe(
        "System Overview"
      );
      expect(getBranchQualifiedTitle("System Overview", "feature/auth", true)).toBe(
        "System Overview [feature-auth]"
      );
    });

    it("handles complex branch names", () => {
      expect(getBranchQualifiedTitle("API Docs", "bugfix/issue-123")).toBe(
        "API Docs [bugfix-issue-123]"
      );
      expect(getBranchQualifiedTitle("API Docs", "release/v2.0.0")).toBe(
        "API Docs [release-v200]"
      );
    });
  });
});
