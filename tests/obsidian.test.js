import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { isInsideRoot } from "../src/utils/safe-path.js";

const originalEnv = { ...process.env };

async function makeVault() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-obsidian-"));
  const vault = path.join(root, "vault");
  const outside = path.join(root, "outside");
  await fs.mkdir(vault);
  await fs.mkdir(outside);
  return { root, vault, outside };
}

function cfgFor(root, vault, obsidian = {}) {
  return {
    __repoRoot: root,
    project: { name: "Demo App" },
    obsidian: { vault, folder: "Notes", ...obsidian },
  };
}

const pages = {
  system_overview: "# System Overview\n\nSee [catalog](./module_catalog.md) and [site](https://example.com/docs).\n\n```\n[catalog](./module_catalog.md)\n```\n",
  module_catalog: "# Modules\n",
  executive_summary: "# Summary\n",
};

describe("Obsidian vault publisher", () => {
  let dirs;

  beforeEach(async () => {
    dirs = await makeVault();
    process.env.GITHUB_REF_NAME = "main";
  });

  afterEach(async () => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
    if (dirs?.root) {
      await fs.rm(dirs.root, { recursive: true, force: true });
      dirs = null;
    }
  });

  it("writes frontmatter, wikilinks, and an index inside the vault folder", async () => {
    const { publishToObsidian } = await import("../src/publishers/obsidian.js");
    const result = await publishToObsidian(cfgFor(dirs.root, dirs.vault), pages);

    expect(isInsideRoot(dirs.vault, result.folder)).toBe(true);
    expect(result.files).toEqual(expect.arrayContaining([
      "System Overview.md",
      "Module Catalog.md",
      "Executive Summary.md",
      "RepoLens.md",
    ]));

    const overview = await fs.readFile(path.join(result.folder, "System Overview.md"), "utf8");
    expect(overview.startsWith("---\n")).toBe(true);
    expect(overview).toContain('title: "System Overview"');
    expect(overview).toContain('  - "system_overview"');
    expect(overview).toContain("tags:");
    expect(overview).toContain('  - "repolens"');
    expect(overview).toContain('project: "Demo App"');
    expect(overview).toContain('branch: "main"');
    expect(overview).toContain("← [[RepoLens|Index]]");
    expect(overview).toContain("[[Module Catalog|catalog]]");
    expect(overview).toContain("[site](https://example.com/docs)");
    expect(overview).toContain("```\n[catalog](./module_catalog.md)\n```");

    const index = await fs.readFile(path.join(result.folder, "RepoLens.md"), "utf8");
    expect(index).toContain("[[System Overview]]");
    expect(index).toContain("[[Module Catalog]]");
    expect(index).toContain("[[Executive Summary]]");
    expect(index).toContain('type: "index"');
  });

  it("is idempotent when the notes have not changed", async () => {
    const { publishToObsidian } = await import("../src/publishers/obsidian.js");
    const cfg = cfgFor(dirs.root, dirs.vault);
    const first = await publishToObsidian(cfg, pages);
    const overviewPath = path.join(first.folder, "System Overview.md");
    const before = await fs.readFile(overviewPath, "utf8");
    const past = new Date(Date.now() - 120_000);
    await fs.utimes(overviewPath, past, past);
    const stamped = await fs.stat(overviewPath);

    const second = await publishToObsidian(cfg, pages);
    const afterStat = await fs.stat(overviewPath);
    const after = await fs.readFile(overviewPath, "utf8");

    expect(second.changed).toBe(0);
    expect(second.removed).toBe(0);
    expect(after).toBe(before);
    expect(afterStat.mtimeMs).toBe(stamped.mtimeMs);
  });

  it("updates a changed note and removes notes it no longer publishes", async () => {
    const { publishToObsidian } = await import("../src/publishers/obsidian.js");
    const cfg = cfgFor(dirs.root, dirs.vault);
    const first = await publishToObsidian(cfg, pages);
    const scratch = path.join(first.folder, "Scratch.md");
    await fs.writeFile(scratch, "# user note\n", "utf8");

    const nextPages = {
      system_overview: "# System Overview\n\nUpdated.\n",
    };
    const second = await publishToObsidian(cfg, nextPages);

    expect(second.changed).toBeGreaterThan(0);
    expect(second.removed).toBeGreaterThan(0);
    const overview = await fs.readFile(path.join(first.folder, "System Overview.md"), "utf8");
    expect(overview).toContain("Updated.");
    await expect(fs.access(path.join(first.folder, "Module Catalog.md"))).rejects.toThrow();
    await expect(fs.access(path.join(first.folder, "Executive Summary.md"))).rejects.toThrow();
    expect(await fs.readFile(scratch, "utf8")).toBe("# user note\n");

    const manifest = JSON.parse(await fs.readFile(path.join(first.folder, ".repolens-obsidian.json"), "utf8"));
    expect(manifest.files).toContain("System Overview.md");
    expect(manifest.files).toContain("RepoLens.md");
    expect(manifest.files).not.toContain("Module Catalog.md");
    expect(manifest.files).not.toContain("Scratch.md");
  });

  it("does not delete files outside the vault when the manifest is tampered with", async () => {
    const { publishToObsidian } = await import("../src/publishers/obsidian.js");
    const cfg = cfgFor(dirs.root, dirs.vault);
    const first = await publishToObsidian(cfg, { system_overview: "# System Overview\n" });
    const outsideFile = path.join(dirs.outside, "outside.md");
    await fs.writeFile(outsideFile, "keep\n", "utf8");
    await fs.writeFile(
      path.join(first.folder, ".repolens-obsidian.json"),
      JSON.stringify({ version: 1, files: ["../../outside/outside.md", "../outside.md", "System Overview.md"] }),
      "utf8"
    );

    await publishToObsidian(cfg, { system_overview: "# System Overview\n" });
    expect(await fs.readFile(outsideFile, "utf8")).toBe("keep\n");
  });

  it("rejects a folder that escapes the vault and writes nothing outside it", async () => {
    const { publishToObsidian } = await import("../src/publishers/obsidian.js");
    const cfg = cfgFor(dirs.root, dirs.vault, { folder: "../outside" });
    await expect(publishToObsidian(cfg, pages)).rejects.toThrow(/escapes the vault/);
    expect(await fs.readdir(dirs.outside)).toEqual([]);
  });

  it("rejects an absolute folder", async () => {
    const { publishToObsidian } = await import("../src/publishers/obsidian.js");
    const cfg = cfgFor(dirs.root, dirs.vault, { folder: dirs.outside });
    await expect(publishToObsidian(cfg, pages)).rejects.toThrow(/inside the vault/);
    expect(await fs.readdir(dirs.outside)).toEqual([]);
  });

  it("rejects a symlink that points outside the vault", async () => {
    const { publishToObsidian } = await import("../src/publishers/obsidian.js");
    await fs.symlink(dirs.outside, path.join(dirs.vault, "linked"));
    const cfg = cfgFor(dirs.root, dirs.vault, { folder: "linked" });
    await expect(publishToObsidian(cfg, pages)).rejects.toThrow(/symlink|escapes the vault/);
    expect(await fs.readdir(dirs.outside)).toEqual([]);
  });

  it("keeps a path-traversal page key inside the vault folder", async () => {
    const { publishToObsidian } = await import("../src/publishers/obsidian.js");
    const result = await publishToObsidian(cfgFor(dirs.root, dirs.vault), {
      "../../outside": "# should stay inside\n",
    });
    expect(isInsideRoot(dirs.vault, result.folder)).toBe(true);
    const names = await fs.readdir(result.folder);
    expect(names.every((name) => !name.includes("..") && !name.includes("/"))).toBe(true);
    expect(await fs.readdir(dirs.outside)).toEqual([]);
    const note = names.find((name) => name.endsWith(".md") && name !== "RepoLens.md");
    expect(note).toBeTruthy();
    const body = await fs.readFile(path.join(result.folder, note), "utf8");
    expect(body).toContain("should stay inside");
  });

  it("requires an existing vault and does not use the network", async () => {
    const { publishToObsidian } = await import("../src/publishers/obsidian.js");
    const fetchSpy = vi.fn();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchSpy;
    try {
      await expect(publishToObsidian(cfgFor(dirs.root, dirs.vault, { vault: "" }), pages)).rejects.toThrow(/obsidian\.vault is required/);
      const missing = path.join(dirs.root, "missing-vault");
      await expect(publishToObsidian(cfgFor(dirs.root, missing), pages)).rejects.toThrow(/does not exist/);
      await publishToObsidian(cfgFor(dirs.root, dirs.vault), pages);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }

    const source = await fs.readFile(new URL("../src/publishers/obsidian.js", import.meta.url), "utf8");
    expect(source).not.toMatch(/node:https|node:http|node:child_process|node-fetch|\bfetch\s*\(/);
  });

  it("can omit frontmatter, wikilinks, and the index", async () => {
    const { publishToObsidian } = await import("../src/publishers/obsidian.js");
    const result = await publishToObsidian(cfgFor(dirs.root, dirs.vault, {
      frontmatter: false,
      wikilinks: false,
      index: false,
    }), pages);

    expect(result.files).not.toContain("RepoLens.md");
    expect(result.files).toContain("system_overview.md");
    const overview = await fs.readFile(path.join(result.folder, "system_overview.md"), "utf8");
    expect(overview.startsWith("# System Overview")).toBe(true);
    expect(overview).toContain("[catalog](./module_catalog.md)");
    expect(overview).not.toContain("[[");
    await expect(fs.access(path.join(result.folder, "RepoLens.md"))).rejects.toThrow();
  });

  it("resolves a vault path relative to the repository", async () => {
    const { publishToObsidian } = await import("../src/publishers/obsidian.js");
    const result = await publishToObsidian(cfgFor(dirs.root, dirs.vault, { vault: "vault", folder: "Notes" }), pages);
    expect(result.folder).toBe(path.join(dirs.vault, "Notes"));
  });

  describe("branch filter", () => {
    it("publishes on every branch when no filter is set", async () => {
      const { shouldPublishToObsidian } = await import("../src/utils/branch.js");
      expect(shouldPublishToObsidian({}, "feature-x")).toBe(true);
      expect(shouldPublishToObsidian({ obsidian: { branches: [] } }, "main")).toBe(true);
    });

    it("honours exact and glob branch filters", async () => {
      const { shouldPublishToObsidian } = await import("../src/utils/branch.js");
      const cfg = { obsidian: { branches: ["main", "release/*"] } };
      expect(shouldPublishToObsidian(cfg, "main")).toBe(true);
      expect(shouldPublishToObsidian(cfg, "release/1.13")).toBe(true);
      expect(shouldPublishToObsidian(cfg, "feature/auth")).toBe(false);
    });
  });

  describe("config schema", () => {
    function baseConfig(extra = {}) {
      return {
        configVersion: 1,
        project: { name: "test" },
        publishers: ["markdown"],
        scan: { include: ["src/**"], ignore: ["node_modules/**"] },
        outputs: { pages: [{ key: "system_overview", title: "Overview" }] },
        ...extra,
      };
    }

    it("accepts a config with no obsidian section", async () => {
      const { validateConfig } = await import("../src/core/config-schema.js");
      expect(() => validateConfig(baseConfig())).not.toThrow();
    });

    it("accepts obsidian as a publisher with optional fields", async () => {
      const { validateConfig } = await import("../src/core/config-schema.js");
      expect(() => validateConfig(baseConfig({
        publishers: ["obsidian", "markdown"],
        obsidian: {
          vault: "/tmp/vault",
          folder: "RepoLens/test",
          branches: ["main"],
          index: true,
          frontmatter: false,
          wikilinks: true,
        },
      }))).not.toThrow();
    });

    it("rejects an escaping folder, a bad flag, and a non-array branch list", async () => {
      const { validateConfig } = await import("../src/core/config-schema.js");
      expect(() => validateConfig(baseConfig({ obsidian: { folder: "../secret" } }))).toThrow(/relative path inside the vault/);
      expect(() => validateConfig(baseConfig({ obsidian: { folder: "/etc" } }))).toThrow(/relative path inside the vault/);
      expect(() => validateConfig(baseConfig({ obsidian: { wikilinks: "yes" } }))).toThrow(/obsidian\.wikilinks must be a boolean/);
      expect(() => validateConfig(baseConfig({ obsidian: { branches: "main" } }))).toThrow(/obsidian\.branches must be an array/);
    });

    it("loads an obsidian config through the schema and security validators", async () => {
      const { loadConfig } = await import("../src/core/config.js");
      const configPath = path.join(dirs.root, ".repolens.yml");
      await fs.writeFile(configPath, `
configVersion: 1
project:
  name: "demo"
publishers:
  - obsidian
  - markdown
scan:
  include:
    - "src/**"
  ignore:
    - "node_modules/**"
outputs:
  pages:
    - key: system_overview
      title: Overview
obsidian:
  vault: "/tmp/vault"
  folder: "RepoLens/demo"
  branches:
    - main
  index: true
  frontmatter: true
  wikilinks: true
`, "utf8");
      const loaded = await loadConfig(configPath);
      expect(loaded.publishers).toContain("obsidian");
      expect(loaded.obsidian.vault).toBe("/tmp/vault");
      expect(loaded.configVersion).toBe(1);
    });
  });

  describe("security validator", () => {
    it("accepts the obsidian publisher and rejects a folder that escapes", async () => {
      const { validateConfig } = await import("../src/utils/validate.js");
      const ok = validateConfig({
        configVersion: 1,
        publishers: ["obsidian"],
        obsidian: { vault: "/vault", folder: "RepoLens/demo", frontmatter: true },
      });
      expect(ok.valid).toBe(true);

      const bad = validateConfig({
        configVersion: 1,
        publishers: ["obsidian"],
        obsidian: { folder: "../escape" },
      });
      expect(bad.valid).toBe(false);
      expect(bad.errors.join("\n")).toMatch(/relative path inside the vault/);
    });
  });
});
