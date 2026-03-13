/**
 * Renderer Unit Tests
 *
 * Direct tests for the three renderer modules: render.js, renderMap.js, renderDiff.js.
 * All renderer functions are pure (data in → markdown string out), no I/O.
 */

import { describe, it, expect } from "vitest";
import {
  renderSystemOverview,
  renderModuleCatalog,
  renderApiSurface,
  renderRouteMap,
} from "../src/renderers/render.js";
import { renderSystemMap } from "../src/renderers/renderMap.js";
import {
  buildArchitectureDiffData,
  renderArchitectureDiff,
} from "../src/renderers/renderDiff.js";

// ── Shared fixtures ─────────────────────────────────────────────────

const minimalScan = {
  filesCount: 42,
  modules: [
    { key: "src/core", fileCount: 10 },
    { key: "src/utils", fileCount: 8 },
  ],
  pages: [{ path: "/dashboard", file: "app/dashboard/page.tsx" }],
  api: [{ methods: ["GET"], path: "/api/health", file: "src/api/health.js" }],
  metadata: {
    frameworks: ["Next.js"],
    languages: ["TypeScript"],
    buildTools: ["Vite"],
    testFrameworks: ["Vitest"],
  },
};

const minimalCfg = { project: { name: "TestProject" } };

// ============================================================
// render.js — renderSystemOverview
// ============================================================

describe("renderSystemOverview", () => {
  it("includes project name and key metrics", () => {
    const md = renderSystemOverview(minimalCfg, minimalScan);
    expect(md).toContain("# TestProject — System Overview");
    expect(md).toContain("| Files scanned | 42 |");
    expect(md).toContain("| Modules detected | 2 |");
    expect(md).toContain("| API endpoints | 1 |");
  });

  it("renders technology stack table", () => {
    const md = renderSystemOverview(minimalCfg, minimalScan);
    expect(md).toContain("## Technology Stack");
    expect(md).toContain("| Frameworks | Next.js |");
    expect(md).toContain("| Languages | TypeScript |");
    expect(md).toContain("| Build Tools | Vite |");
    expect(md).toContain("| Testing | Vitest |");
  });

  it("renders architecture summary with size description", () => {
    const md = renderSystemOverview(minimalCfg, minimalScan);
    expect(md).toContain("## Architecture Summary");
    expect(md).toContain("a focused, compact codebase");
  });

  it("renders largest modules table", () => {
    const md = renderSystemOverview(minimalCfg, minimalScan);
    expect(md).toContain("## Largest Modules");
    expect(md).toContain("| `src/core` | 10 |");
    expect(md).toContain("| `src/utils` | 8 |");
  });

  it("falls back to 'Project' when no name configured", () => {
    const md = renderSystemOverview({}, minimalScan);
    expect(md).toContain("# Project — System Overview");
  });

  it("renders monorepo section when present", () => {
    const scan = {
      ...minimalScan,
      monorepo: {
        isMonorepo: true,
        tool: "npm workspaces",
        packages: [
          { name: "@app/web", path: "packages/web", version: "1.0.0" },
          { name: "@app/api", path: "packages/api", version: "2.0.0" },
        ],
      },
    };
    const md = renderSystemOverview(minimalCfg, scan);
    expect(md).toContain("## Monorepo Workspaces");
    expect(md).toContain("npm workspaces");
    expect(md).toContain("@app/web");
    expect(md).toContain("@app/api");
  });

  it("handles empty metadata gracefully", () => {
    const scan = { ...minimalScan, metadata: {} };
    const md = renderSystemOverview(minimalCfg, scan);
    expect(md).not.toContain("## Technology Stack");
    expect(md).toContain("## Repository at a Glance");
  });
});

// ============================================================
// render.js — renderModuleCatalog
// ============================================================

describe("renderModuleCatalog", () => {
  it("renders module table with role descriptions", () => {
    const md = renderModuleCatalog(minimalCfg, minimalScan);
    expect(md).toContain("# Module Catalog");
    expect(md).toContain("**Total modules:** 2");
    expect(md).toContain("| `src/core` | 10 | Core business logic");
    expect(md).toContain("| `src/utils` | 8 | Shared utilities");
  });

  it("shows owners column when ownershipMap provided", () => {
    const owners = { "src/core": ["@backend-team"], "src/utils": ["@platform"] };
    const md = renderModuleCatalog(minimalCfg, minimalScan, owners);
    expect(md).toContain("| Owners |");
    expect(md).toContain("@backend-team");
    expect(md).toContain("@platform");
  });

  it("omits owners column when no ownershipMap", () => {
    const md = renderModuleCatalog(minimalCfg, minimalScan);
    expect(md).not.toContain("| Owners |");
  });

  it("handles empty modules list", () => {
    const scan = { ...minimalScan, modules: [] };
    const md = renderModuleCatalog(minimalCfg, scan);
    expect(md).toContain("**Total modules:** 0");
    expect(md).toContain("No modules detected");
  });
});

// ============================================================
// render.js — renderApiSurface
// ============================================================

describe("renderApiSurface", () => {
  it("renders internal API table", () => {
    const md = renderApiSurface(minimalCfg, minimalScan);
    expect(md).toContain("# API Surface");
    expect(md).toContain("**Total endpoints:** 1");
    expect(md).toContain("| GET | `/api/health` | `src/api/health.js` |");
  });

  it("shows external API integrations when present", () => {
    const scan = {
      ...minimalScan,
      externalApis: [
        { category: "Payment", name: "Stripe", detectedIn: "src/pay.js" },
      ],
    };
    const md = renderApiSurface(minimalCfg, scan);
    expect(md).toContain("### Payment");
    expect(md).toContain("| Stripe | `src/pay.js` |");
  });

  it("handles no API endpoints", () => {
    const scan = { ...minimalScan, api: [] };
    const md = renderApiSurface(minimalCfg, scan);
    expect(md).toContain("No API routes were detected");
  });

  it("handles no external APIs", () => {
    const md = renderApiSurface(minimalCfg, minimalScan);
    expect(md).toContain("No external API integrations were detected");
  });
});

// ============================================================
// render.js — renderRouteMap
// ============================================================

describe("renderRouteMap", () => {
  it("renders pages and API endpoints", () => {
    const md = renderRouteMap(minimalCfg, minimalScan);
    expect(md).toContain("# Route Map");
    expect(md).toContain("## Application Pages (1)");
    expect(md).toContain("| `/dashboard` | `app/dashboard/page.tsx` |");
    expect(md).toContain("## API Endpoints (1)");
    expect(md).toContain("| GET | `/api/health` |");
  });

  it("handles no pages", () => {
    const scan = { ...minimalScan, pages: [] };
    const md = renderRouteMap(minimalCfg, scan);
    expect(md).not.toContain("## Application Pages");
  });

  it("handles no API endpoints", () => {
    const scan = { ...minimalScan, api: [] };
    const md = renderRouteMap(minimalCfg, scan);
    expect(md).not.toContain("## API Endpoints");
  });
});

// ============================================================
// renderMap.js — renderSystemMap
// ============================================================

describe("renderSystemMap", () => {
  it("renders architecture diagram with modules", () => {
    const md = renderSystemMap(minimalScan, minimalCfg, null);
    expect(md).toContain("# 🏗️ System Map");
    expect(md).toContain("SYSTEM ARCHITECTURE MAP");
    expect(md).toContain("Heuristic inference");
  });

  it("uses import-based analysis when depGraph provided", () => {
    const depGraph = {
      edges: [
        { from: "src/core/config.js", to: "src/utils/logger.js" },
      ],
    };
    const md = renderSystemMap(minimalScan, minimalCfg, depGraph);
    expect(md).toContain("Real import analysis");
    expect(md).toContain("1 relationships");
  });

  it("handles empty modules gracefully", () => {
    const scan = { ...minimalScan, modules: [] };
    const md = renderSystemMap(scan, minimalCfg, null);
    expect(md).toContain("No modules detected");
  });

  it("renders category groupings", () => {
    const scan = {
      ...minimalScan,
      modules: [
        { key: "src/core", fileCount: 5 },
        { key: "src/utils", fileCount: 3 },
        { key: "tests", fileCount: 4 },
        { key: "bin", fileCount: 1 },
      ],
    };
    const md = renderSystemMap(scan, minimalCfg, null);
    // Verify category-based grouping appears in the diagram
    expect(md).toContain("SYSTEM ARCHITECTURE MAP");
    expect(md).toContain("core");
    expect(md).toContain("utils");
  });

  it("limits to 30 modules", () => {
    const scan = {
      ...minimalScan,
      modules: Array.from({ length: 50 }, (_, i) => ({
        key: `src/mod${i}`,
        fileCount: 1,
      })),
    };
    const md = renderSystemMap(scan, minimalCfg, null);
    // Should render but not have all 50
    expect(md).toContain("System Map");
    // 30 modules max
    expect(md).toContain("30 modules");
  });
});

// ============================================================
// renderDiff.js — buildArchitectureDiffData
// ============================================================

describe("buildArchitectureDiffData", () => {
  it("detects added and removed routes", () => {
    const diff = {
      added: ["src/app/dashboard/page.tsx", "src/utils/helper.js"],
      removed: ["src/app/settings/page.tsx"],
      modified: ["src/core/config.js"],
    };
    const data = buildArchitectureDiffData(diff);
    expect(data.addedRoutes).toEqual(["/dashboard"]);
    expect(data.removedRoutes).toEqual(["/settings"]);
  });

  it("detects API route files", () => {
    const diff = {
      added: ["src/app/api/users/route.ts"],
      removed: [],
      modified: [],
    };
    const data = buildArchitectureDiffData(diff);
    expect(data.addedRoutes).toEqual(["/api/users"]);
  });

  it("detects pages/api routes", () => {
    const diff = {
      added: ["src/pages/api/health.ts"],
      removed: [],
      modified: [],
    };
    const data = buildArchitectureDiffData(diff);
    expect(data.addedRoutes).toEqual(["/api/health"]);
  });

  it("computes impacted modules", () => {
    const diff = {
      added: ["src/core/new.js"],
      removed: [],
      modified: ["lib/utils/old.js"],
    };
    const data = buildArchitectureDiffData(diff);
    expect(data.impactedModules).toContain("src/core");
    expect(data.impactedModules).toContain("lib/utils");
  });

  it("handles empty diff", () => {
    const data = buildArchitectureDiffData({
      added: [],
      removed: [],
      modified: [],
    });
    expect(data.addedRoutes).toEqual([]);
    expect(data.removedRoutes).toEqual([]);
    expect(data.impactedModules).toEqual([]);
  });
});

// ============================================================
// renderDiff.js — renderArchitectureDiff
// ============================================================

describe("renderArchitectureDiff", () => {
  it("renders summary counts", () => {
    const diff = {
      added: ["src/new.js"],
      removed: ["src/old.js"],
      modified: ["src/changed.js"],
    };
    const md = renderArchitectureDiff(diff);
    expect(md).toContain("# Architecture Diff");
    expect(md).toContain("Added files: 1");
    expect(md).toContain("Removed files: 1");
    expect(md).toContain("Modified files: 1");
  });

  it("renders added/removed routes sections", () => {
    const diff = {
      added: ["src/app/new/page.tsx"],
      removed: ["src/app/old/page.tsx"],
      modified: [],
    };
    const md = renderArchitectureDiff(diff);
    expect(md).toContain("## Added Routes");
    expect(md).toContain("`/new`");
    expect(md).toContain("## Removed Routes");
    expect(md).toContain("`/old`");
  });

  it("truncates at 25 items with overflow warning", () => {
    const diff = {
      added: Array.from({ length: 30 }, (_, i) => `app/page${i}/page.tsx`),
      removed: [],
      modified: [],
    };
    const md = renderArchitectureDiff(diff);
    expect(md).toContain("Showing 25 of 30 added routes");
  });

  it("truncates impacted modules at 40", () => {
    const diff = {
      added: [],
      removed: [],
      modified: Array.from({ length: 45 }, (_, i) => `src/mod${i}/file.js`),
    };
    const md = renderArchitectureDiff(diff);
    expect(md).toContain("Showing 40 of");
  });

  it("handles empty diff gracefully", () => {
    const md = renderArchitectureDiff({
      added: [],
      removed: [],
      modified: [],
    });
    expect(md).toContain("Added files: 0");
    expect(md).not.toContain("## Added Routes");
    expect(md).not.toContain("## Impacted Modules");
  });
});
