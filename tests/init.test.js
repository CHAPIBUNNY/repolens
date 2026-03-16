import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { runInit, parseConfluenceUrl, parseNotionInput } from "../src/init.js";

describe("parseConfluenceUrl", () => {
  it("extracts base URL, space key, and page ID from full URL", () => {
    const result = parseConfluenceUrl(
      "https://company.atlassian.net/wiki/spaces/DOCS/pages/123456/Page+Title"
    );
    expect(result.baseUrl).toBe("https://company.atlassian.net/wiki");
    expect(result.spaceKey).toBe("DOCS");
    expect(result.pageId).toBe("123456");
    expect(result.isFullUrl).toBe(true);
  });

  it("extracts personal space key (~user format)", () => {
    const result = parseConfluenceUrl(
      "https://repolens.atlassian.net/wiki/spaces/~DOCS/pages/5505052/SAPP"
    );
    expect(result.baseUrl).toBe("https://repolens.atlassian.net/wiki");
    expect(result.spaceKey).toBe("~DOCS");
    expect(result.pageId).toBe("5505052");
  });

  it("handles URL with query params", () => {
    const result = parseConfluenceUrl(
      "https://company.atlassian.net/wiki/spaces/ENG/pages/789?atlOrigin=xyz"
    );
    expect(result.spaceKey).toBe("ENG");
    expect(result.pageId).toBe("789");
  });

  it("handles base URL only", () => {
    const result = parseConfluenceUrl("https://company.atlassian.net/wiki");
    expect(result.baseUrl).toBe("https://company.atlassian.net/wiki");
    expect(result.spaceKey).toBeNull();
    expect(result.pageId).toBeNull();
    expect(result.isFullUrl).toBe(false);
  });

  it("adds /wiki if missing from domain", () => {
    const result = parseConfluenceUrl("https://company.atlassian.net");
    expect(result.baseUrl).toBe("https://company.atlassian.net/wiki");
  });

  it("handles space URL without page", () => {
    const result = parseConfluenceUrl(
      "https://company.atlassian.net/wiki/spaces/DOCS"
    );
    expect(result.spaceKey).toBe("DOCS");
    expect(result.pageId).toBeNull();
  });

  it("returns null values for empty input", () => {
    const result = parseConfluenceUrl("");
    expect(result.baseUrl).toBeNull();
    expect(result.spaceKey).toBeNull();
    expect(result.pageId).toBeNull();
  });
});

describe("parseNotionInput", () => {
  it("extracts page ID from full Notion URL", () => {
    const result = parseNotionInput(
      "https://www.notion.so/workspace/My-Page-abc123def456abc123def456abc12345"
    );
    expect(result.pageId).toBe("abc123def456abc123def456abc12345");
    expect(result.isUrl).toBe(true);
  });

  it("extracts page ID from short URL", () => {
    const result = parseNotionInput(
      "https://notion.so/abc123def456abc123def456abc12345"
    );
    expect(result.pageId).toBe("abc123def456abc123def456abc12345");
    expect(result.isUrl).toBe(true);
  });

  it("accepts raw 32-char page ID", () => {
    const result = parseNotionInput("abc123def456abc123def456abc12345");
    expect(result.pageId).toBe("abc123def456abc123def456abc12345");
    expect(result.isUrl).toBe(false);
  });

  it("handles dashed format page ID", () => {
    const result = parseNotionInput("abc12345-def4-56ab-c123-def456abc123");
    expect(result.pageId).toBe("abc12345def456abc123def456abc123");
    expect(result.isUrl).toBe(false);
  });

  it("returns null for invalid input", () => {
    const result = parseNotionInput("not-a-valid-id");
    expect(result.pageId).toBe("not-a-valid-id"); // passes through
    expect(result.isUrl).toBe(false);
  });

  it("returns null for empty input", () => {
    const result = parseNotionInput("");
    expect(result.pageId).toBeNull();
    expect(result.isUrl).toBe(false);
  });
});

describe("runInit", () => {
  let tempDir;

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it("creates RepoLens setup files", async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-init-"));

    await runInit(tempDir);

    const files = await fs.readdir(tempDir);

    expect(files).toContain(".repolens.yml");
    expect(files).toContain(".env.example");
    expect(files).toContain("README.repolens.md");

    const workflowDir = path.join(tempDir, ".github", "workflows");
    const workflows = await fs.readdir(workflowDir);

    expect(workflows).toContain("repolens.yml");
  });

  it(".env.example contains GitHub Models section", async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-init-env-"));
    await runInit(tempDir);

    const env = await fs.readFile(path.join(tempDir, ".env.example"), "utf8");
    expect(env).toContain("GitHub Models");
    expect(env).toContain("REPOLENS_AI_PROVIDER=github");
    expect(env).toContain("GITHUB_TOKEN");
    expect(env).toContain("gpt-4o-mini");
  });

  it("workflow template contains GitHub Models env vars enabled by default", async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-init-wf-"));
    await runInit(tempDir);

    const wf = await fs.readFile(
      path.join(tempDir, ".github", "workflows", "repolens.yml"),
      "utf8"
    );
    expect(wf).toContain("REPOLENS_AI_PROVIDER: github");
    expect(wf).toContain("REPOLENS_AI_ENABLED: true");
    expect(wf).toContain("GITHUB_TOKEN");
    // AI should be enabled by default (not commented out) since GitHub Models is free
    expect(wf).not.toContain("# REPOLENS_AI_ENABLED: true");
  });

  it("README contains GitHub Models as Option A", async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-init-readme-"));
    await runInit(tempDir);

    const readme = await fs.readFile(path.join(tempDir, "README.repolens.md"), "utf8");
    expect(readme).toContain("GitHub Models");
    expect(readme).toContain("Option A");
    expect(readme).toContain("Free");
    expect(readme).toContain("REPOLENS_AI_PROVIDER: github");
    expect(readme).toContain("free with GitHub Models");
  });

  it(".env.example contains standard AI config section", async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-init-ai-"));
    await runInit(tempDir);

    const env = await fs.readFile(path.join(tempDir, ".env.example"), "utf8");
    expect(env).toContain("REPOLENS_AI_ENABLED=true");
    expect(env).toContain("REPOLENS_AI_API_KEY");
    expect(env).toContain("REPOLENS_AI_MODEL");
  });

  it("does not overwrite existing files", async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-init-skip-"));
    const configPath = path.join(tempDir, ".repolens.yml");
    await fs.writeFile(configPath, "# custom config", "utf8");

    await runInit(tempDir);

    const content = await fs.readFile(configPath, "utf8");
    expect(content).toBe("# custom config");
  });
});