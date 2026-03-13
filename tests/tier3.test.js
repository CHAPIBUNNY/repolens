import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

// --- Doc Cache tests ---
import {
  loadDocCache,
  saveDocCache,
  filterChangedDocs,
  logCacheStats,
} from "../src/utils/doc-cache.js";

describe("Doc Cache", () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-cache-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("returns empty cache when no file exists", async () => {
    const cache = await loadDocCache(tempDir);
    expect(cache).toEqual({});
  });

  it("saves and loads cache round-trip", async () => {
    const cache = { system_overview: "abc123", module_catalog: "def456" };
    await saveDocCache(tempDir, cache);
    const loaded = await loadDocCache(tempDir);
    expect(loaded).toEqual(cache);
  });

  it("creates directory if missing when saving", async () => {
    const nested = path.join(tempDir, "sub", "dir");
    await saveDocCache(nested, { key: "hash" });
    const loaded = await loadDocCache(nested);
    expect(loaded).toEqual({ key: "hash" });
  });

  it("filters changed documents", () => {
    const previousCache = {
      system_overview: "aaa",
      module_catalog: "bbb",
    };
    const renderedPages = {
      system_overview: "same content", // will hash differently from "aaa"
      module_catalog: "new content",
      api_surface: "brand new",
    };

    const result = filterChangedDocs(renderedPages, previousCache);

    // All pages should change since hashes don't match
    expect(result.newCache).toHaveProperty("system_overview");
    expect(result.newCache).toHaveProperty("module_catalog");
    expect(result.newCache).toHaveProperty("api_surface");
    expect(Object.keys(result.changedPages).length + result.unchangedKeys.length).toBe(3);
  });

  it("detects unchanged documents correctly", () => {
    // Use filterChangedDocs with matching hashes
    const pages = { doc1: "hello" };
    const { newCache } = filterChangedDocs(pages, {});

    // Second run with same content
    const result = filterChangedDocs(pages, newCache);
    expect(result.unchangedKeys).toEqual(["doc1"]);
    expect(Object.keys(result.changedPages)).toEqual([]);
  });

  it("logCacheStats does not throw", () => {
    expect(() => logCacheStats(3, 5)).not.toThrow();
    expect(() => logCacheStats(0, 0)).not.toThrow();
  });
});

// --- Monorepo Detector tests ---
import { detectMonorepo } from "../src/analyzers/monorepo-detector.js";

describe("Monorepo Detector", () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-mono-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("returns not monorepo for empty directory", async () => {
    const result = await detectMonorepo(tempDir);
    expect(result.isMonorepo).toBe(false);
    expect(result.packages).toEqual([]);
  });

  it("returns not monorepo for single-package project", async () => {
    await fs.writeFile(
      path.join(tempDir, "package.json"),
      JSON.stringify({ name: "single-pkg", version: "1.0.0" })
    );
    const result = await detectMonorepo(tempDir);
    expect(result.isMonorepo).toBe(false);
  });

  it("detects npm workspaces", async () => {
    await fs.writeFile(
      path.join(tempDir, "package.json"),
      JSON.stringify({ name: "mono", workspaces: ["packages/*"] })
    );
    const pkgDir = path.join(tempDir, "packages", "app-a");
    await fs.mkdir(pkgDir, { recursive: true });
    await fs.writeFile(
      path.join(pkgDir, "package.json"),
      JSON.stringify({ name: "@mono/app-a", version: "1.0.0" })
    );

    const result = await detectMonorepo(tempDir);
    expect(result.isMonorepo).toBe(true);
    expect(result.tool).toBe("npm/yarn workspaces");
    expect(result.packages.length).toBe(1);
    expect(result.packages[0].name).toBe("@mono/app-a");
    expect(result.packages[0].path).toBe("packages/app-a");
  });

  it("detects yarn workspaces object syntax", async () => {
    await fs.writeFile(
      path.join(tempDir, "package.json"),
      JSON.stringify({ name: "mono", workspaces: { packages: ["libs/*"] } })
    );
    const libDir = path.join(tempDir, "libs", "shared");
    await fs.mkdir(libDir, { recursive: true });
    await fs.writeFile(
      path.join(libDir, "package.json"),
      JSON.stringify({ name: "@mono/shared", version: "2.0.0" })
    );

    const result = await detectMonorepo(tempDir);
    expect(result.isMonorepo).toBe(true);
    expect(result.packages[0].name).toBe("@mono/shared");
  });

  it("detects pnpm workspaces", async () => {
    await fs.writeFile(
      path.join(tempDir, "pnpm-workspace.yaml"),
      "packages:\n  - 'apps/*'\n"
    );
    const appDir = path.join(tempDir, "apps", "web");
    await fs.mkdir(appDir, { recursive: true });
    await fs.writeFile(
      path.join(appDir, "package.json"),
      JSON.stringify({ name: "web-app", version: "0.1.0" })
    );

    const result = await detectMonorepo(tempDir);
    expect(result.isMonorepo).toBe(true);
    expect(result.tool).toBe("pnpm workspaces");
    expect(result.packages[0].name).toBe("web-app");
  });

  it("detects Lerna", async () => {
    await fs.writeFile(
      path.join(tempDir, "lerna.json"),
      JSON.stringify({ packages: ["packages/*"], version: "independent" })
    );
    const pkgDir = path.join(tempDir, "packages", "core");
    await fs.mkdir(pkgDir, { recursive: true });
    await fs.writeFile(
      path.join(pkgDir, "package.json"),
      JSON.stringify({ name: "@mono/core", version: "3.0.0" })
    );

    const result = await detectMonorepo(tempDir);
    expect(result.isMonorepo).toBe(true);
    expect(result.tool).toBe("Lerna");
    expect(result.packages[0].name).toBe("@mono/core");
  });

  it("detects multiple packages", async () => {
    await fs.writeFile(
      path.join(tempDir, "package.json"),
      JSON.stringify({ name: "mono", workspaces: ["packages/*"] })
    );
    for (const name of ["alpha", "beta", "gamma"]) {
      const dir = path.join(tempDir, "packages", name);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(
        path.join(dir, "package.json"),
        JSON.stringify({ name: `@mono/${name}`, version: "1.0.0" })
      );
    }

    const result = await detectMonorepo(tempDir);
    expect(result.isMonorepo).toBe(true);
    expect(result.packages.length).toBe(3);
  });
});

// --- CODEOWNERS tests ---
import {
  parseCodeowners,
  findOwners,
  buildOwnershipMap,
} from "../src/analyzers/codeowners.js";

describe("CODEOWNERS", () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-owners-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("returns not found when no CODEOWNERS file", async () => {
    const result = await parseCodeowners(tempDir);
    expect(result.found).toBe(false);
    expect(result.rules).toEqual([]);
  });

  it("parses CODEOWNERS from root", async () => {
    await fs.writeFile(
      path.join(tempDir, "CODEOWNERS"),
      `# Comment line\n*.js @js-team\nsrc/ @frontend-team @backend-team\n`
    );

    const result = await parseCodeowners(tempDir);
    expect(result.found).toBe(true);
    expect(result.rules.length).toBe(2);
    expect(result.rules[0].pattern).toBe("*.js");
    expect(result.rules[0].owners).toEqual(["@js-team"]);
    expect(result.rules[1].owners).toEqual(["@frontend-team", "@backend-team"]);
  });

  it("parses CODEOWNERS from .github/", async () => {
    await fs.mkdir(path.join(tempDir, ".github"), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, ".github", "CODEOWNERS"),
      `/src/api/ @api-team\n/src/ui/ @ui-team\n`
    );

    const result = await parseCodeowners(tempDir);
    expect(result.found).toBe(true);
    expect(result.rules.length).toBe(2);
  });

  it("findOwners matches directory patterns", () => {
    const rules = [
      { pattern: "src/", owners: ["@frontend"] },
      { pattern: "src/api/", owners: ["@backend"] },
    ];

    expect(findOwners("src/api/handler.js", rules)).toEqual(["@backend"]);
    expect(findOwners("src/components/Button.tsx", rules)).toEqual(["@frontend"]);
  });

  it("findOwners uses last-match-wins", () => {
    const rules = [
      { pattern: "*", owners: ["@default"] },
      { pattern: "*.ts", owners: ["@ts-team"] },
      { pattern: "src/critical/", owners: ["@senior"] },
    ];

    expect(findOwners("README.md", rules)).toEqual(["@default"]);
    expect(findOwners("index.ts", rules)).toEqual(["@ts-team"]);
    expect(findOwners("src/critical/auth.ts", rules)).toEqual(["@senior"]);
  });

  it("buildOwnershipMap assigns owners to modules", () => {
    const modules = [
      { key: "src/api", fileCount: 3 },
      { key: "src/ui", fileCount: 5 },
    ];
    const files = [
      "src/api/handler.js",
      "src/api/routes.js",
      "src/api/middleware.js",
      "src/ui/Button.tsx",
      "src/ui/Modal.tsx",
    ];
    const rules = [
      { pattern: "src/api/", owners: ["@backend"] },
      { pattern: "src/ui/", owners: ["@frontend"] },
    ];

    const map = buildOwnershipMap(modules, files, rules);
    expect(map["src/api"]).toEqual(["@backend"]);
    expect(map["src/ui"]).toEqual(["@frontend"]);
  });

  it("buildOwnershipMap returns empty for no rules", () => {
    const map = buildOwnershipMap([{ key: "src" }], ["src/a.js"], []);
    expect(map).toEqual({});
  });
});

// --- AI Provider tests (multi-provider + structured output) ---
import { generateText, isAIEnabled, getAIConfig } from "../src/ai/provider.js";

describe("AI Provider", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns fallback when AI is disabled", async () => {
    delete process.env.REPOLENS_AI_ENABLED;
    const result = await generateText({ system: "test", user: "test" });
    expect(result.success).toBe(false);
    expect(result.fallback).toBe(true);
  });

  it("returns fallback when no API key is set", async () => {
    process.env.REPOLENS_AI_ENABLED = "true";
    delete process.env.REPOLENS_AI_API_KEY;
    const result = await generateText({ system: "test", user: "test" });
    expect(result.success).toBe(false);
    expect(result.fallback).toBe(true);
  });

  it("getAIConfig reflects provider setting", () => {
    process.env.REPOLENS_AI_PROVIDER = "anthropic";
    process.env.REPOLENS_AI_API_KEY = "test-key";
    const config = getAIConfig();
    expect(config.provider).toBe("anthropic");
    expect(config.model).toContain("claude");
  });

  it("getAIConfig defaults to openai_compatible", () => {
    delete process.env.REPOLENS_AI_PROVIDER;
    const config = getAIConfig();
    expect(config.provider).toBe("openai_compatible");
  });

  it("getAIConfig reflects google provider", () => {
    process.env.REPOLENS_AI_PROVIDER = "google";
    const config = getAIConfig();
    expect(config.provider).toBe("google");
    expect(config.model).toBe("gemini-pro");
  });
});

// --- Structured AI Output tests (prompts) ---
import { AI_SCHEMAS, renderStructuredToMarkdown } from "../src/ai/prompts.js";

describe("Structured AI Output", () => {
  it("has schemas for all AI document types", () => {
    const expectedKeys = [
      "executive_summary",
      "system_overview",
      "business_domains",
      "architecture_overview",
      "data_flows",
      "developer_onboarding",
    ];
    for (const key of expectedKeys) {
      expect(AI_SCHEMAS[key]).toBeDefined();
      expect(AI_SCHEMAS[key].required).toBeInstanceOf(Array);
      expect(AI_SCHEMAS[key].required.length).toBeGreaterThan(0);
    }
  });

  it("renders executive summary JSON to markdown", () => {
    const parsed = {
      whatItDoes: "A documentation tool",
      whoItServes: "Developers and stakeholders",
      coreCapabilities: ["Auto-scan", "Multi-publisher"],
      mainAreas: [{ name: "Core", description: "Main logic" }],
      risks: ["Scaling limits"],
    };
    const md = renderStructuredToMarkdown("executive_summary", parsed);
    expect(md).toContain("# Executive Summary");
    expect(md).toContain("A documentation tool");
    expect(md).toContain("Auto-scan");
    expect(md).toContain("Scaling limits");
  });

  it("renders business domains JSON to markdown", () => {
    const parsed = {
      domains: [
        { name: "Auth", description: "Login and signup", modules: ["src/auth"] },
        { name: "API", description: "REST endpoints" },
      ],
    };
    const md = renderStructuredToMarkdown("business_domains", parsed);
    expect(md).toContain("# Business Domains");
    expect(md).toContain("## Auth");
    expect(md).toContain("src/auth");
  });

  it("renders data flows JSON to markdown", () => {
    const parsed = {
      flows: [
        { name: "User Login", description: "Auth flow", steps: ["Enter creds", "Validate", "Issue token"] },
      ],
    };
    const md = renderStructuredToMarkdown("data_flows", parsed);
    expect(md).toContain("# Data Flows");
    expect(md).toContain("## User Login");
    expect(md).toContain("1. Enter creds");
  });

  it("renders developer onboarding JSON to markdown", () => {
    const parsed = {
      startHere: "Read the README",
      mainFolders: [{ name: "src/", description: "Source code" }],
      coreFlows: ["Request handling", "Publish pipeline"],
      complexityHotspots: ["Config loading"],
    };
    const md = renderStructuredToMarkdown("developer_onboarding", parsed);
    expect(md).toContain("# Developer Onboarding");
    expect(md).toContain("Read the README");
    expect(md).toContain("src/");
  });

  it("returns null for unknown key", () => {
    expect(renderStructuredToMarkdown("unknown_key", {})).toBeNull();
  });
});
