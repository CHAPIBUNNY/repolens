import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  DOCS_BADGE_MARKDOWN,
  DOCS_BADGE_MARKER,
  applyBrandingFooter,
  brandingEnabled,
} from "../src/docs/branding.js";
import { validateConfig } from "../src/core/config-schema.js";
import { generateDocumentSet } from "../src/docs/generate-doc-set.js";

const minimalConfig = {
  configVersion: 1,
  project: { name: "Demo" },
  publishers: ["markdown"],
  scan: { include: ["src/**/*.js"], ignore: ["**/node_modules/**"] },
  outputs: { pages: [{ key: "system_overview", title: "System Overview" }] },
};

describe("docs badge", () => {
  it("is on by default and can be turned off", () => {
    expect(brandingEnabled({})).toBe(true);
    expect(brandingEnabled({ branding: true })).toBe(true);
    expect(brandingEnabled({ branding: { badge: true } })).toBe(true);
    expect(brandingEnabled({ branding: false })).toBe(false);
    expect(brandingEnabled({ branding: { badge: false } })).toBe(false);
  });

  it("appends the shields.io footer once and links to the repository", () => {
    const once = applyBrandingFooter("# Hello\n", {});
    expect(once).toContain(DOCS_BADGE_MARKER);
    expect(once).toContain(DOCS_BADGE_MARKDOWN);
    expect(once).toContain("https://github.com/CHAPIBUNNY/repolens");
    expect(once).toContain("https://img.shields.io/badge/Docs%20by-RepoLens-0B5FFF");
    expect(applyBrandingFooter(once, {})).toBe(once);
    expect(applyBrandingFooter("# Hello\n", { branding: false })).toBe("# Hello\n");
  });

  it("accepts branding in schema v1 and rejects a string", () => {
    expect(validateConfig({ ...minimalConfig, branding: false })).toBe(true);
    expect(validateConfig({ ...minimalConfig, branding: { badge: false } })).toBe(true);
    expect(() => validateConfig({ ...minimalConfig, branding: "no" })).toThrow(/branding must be a boolean/);
    expect(() => validateConfig({ ...minimalConfig, branding: { badge: "no" } })).toThrow(/branding.badge/);
  });

  it("adds the footer to generated markdown and omits it when branding is false", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-brand-"));
    const scanResult = {
      filesCount: 1,
      modules: [{ key: "src", fileCount: 1 }],
      api: [],
      pages: [],
      metadata: {},
      _files: [],
    };
    const config = {
      project: { name: "Badge" },
      __repoRoot: root,
      documentation: { sections: ["system_overview"], include_artifacts: false },
    };
    try {
      const withBadge = await generateDocumentSet(scanResult, config);
      expect(withBadge.documents[0].content).toContain(DOCS_BADGE_MARKDOWN);

      const without = await generateDocumentSet(scanResult, { ...config, branding: false });
      expect(without.documents[0].content).not.toContain(DOCS_BADGE_MARKER);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
