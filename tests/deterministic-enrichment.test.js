/**
 * Deterministic Enrichment Tests
 *
 * Tests for the enriched fallback generators in generate-sections.js.
 * These verify that when AI is disabled, the deterministic fallbacks
 * produce richer output by using depGraph, flows, monorepo, routes,
 * and drift data that are now passed through.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the AI provider so all calls hit the fallback path
vi.mock("../src/ai/provider.js", () => ({
  generateText: vi.fn().mockResolvedValue({ success: false }),
  isAIEnabled: vi.fn().mockReturnValue(false),
}));

import {
  generateExecutiveSummary,
  generateSystemOverview,
  generateBusinessDomains,
  generateArchitectureOverview,
  generateDataFlows,
  generateDeveloperOnboarding,
} from "../src/ai/generate-sections.js";

// ── Shared fixtures ─────────────────────────────────────────────────

const baseContext = {
  project: {
    name: "TestProject",
    filesScanned: 120,
    modulesDetected: 15,
    pagesDetected: 8,
    apiRoutesDetected: 12,
  },
  domains: [
    { name: "Authentication", description: "User auth and sessions", moduleCount: 3, fileCount: 18, topModules: ["auth", "login", "session"] },
    { name: "API Layer", description: "REST API endpoints", moduleCount: 4, fileCount: 25, topModules: ["api/routes", "api/middleware"] },
    { name: "UI Components", description: "Shared components", moduleCount: 5, fileCount: 30, topModules: ["components/Button", "components/Modal"] },
  ],
  topModules: [
    { key: "src/api", fileCount: 25, type: "api" },
    { key: "src/components", fileCount: 30, type: "ui" },
    { key: "src/utils", fileCount: 10, type: "library" },
    { key: "src/hooks", fileCount: 8, type: "hooks" },
    { key: "src/store", fileCount: 5, type: "state" },
  ],
  routes: {
    pages: [
      { path: "/dashboard", file: "app/dashboard/page.tsx", type: "page" },
      { path: "/auth/login", file: "app/auth/login/page.tsx", type: "page" },
    ],
    apis: [
      { path: "/api/users", file: "src/api/users.ts", methods: ["GET", "POST"], type: "api" },
      { path: "/api/auth", file: "src/api/auth.ts", methods: ["POST"], type: "api" },
    ],
  },
  techStack: {
    frameworks: ["Next.js", "React"],
    languages: ["TypeScript"],
    buildTools: ["Vite"],
    testFrameworks: ["Vitest", "Playwright"],
  },
  patterns: ["Next.js App Router", "React hooks pattern"],
  repoRoots: ["src/", "tests/", "bin/"],
  monorepo: {
    tool: "pnpm",
    packageCount: 3,
    packages: [
      { name: "@app/web", path: "packages/web" },
      { name: "@app/api", path: "packages/api" },
      { name: "@app/shared", path: "packages/shared" },
    ],
  },
};

const depGraph = {
  nodes: [
    { key: "src/utils/logger", file: "src/utils/logger.js", imports: [], importedBy: ["src/api/routes", "src/api/middleware", "src/core/config", "src/core/scan", "src/cli"] },
    { key: "src/core/config", file: "src/core/config.js", imports: ["src/utils/logger"], importedBy: ["src/cli", "src/api/routes"] },
    { key: "src/api/routes", file: "src/api/routes.js", imports: ["src/utils/logger", "src/core/config"], importedBy: [] },
  ],
  edges: [
    { from: "src/api/routes", to: "src/utils/logger" },
    { from: "src/api/routes", to: "src/core/config" },
    { from: "src/core/config", to: "src/utils/logger" },
    { from: "src/cli", to: "src/utils/logger" },
    { from: "src/cli", to: "src/core/config" },
  ],
  cycles: [],
  externalDeps: ["react", "next", "vitest"],
  stats: {
    totalFiles: 50,
    totalEdges: 5,
    externalDeps: 3,
    cycles: 0,
    orphanFiles: 2,
    hubs: [
      { key: "src/utils/logger", importedBy: 5 },
      { key: "src/core/config", importedBy: 2 },
    ],
  },
  summary: "5 edges across 50 files, no cycles",
};

const flows = [
  {
    name: "Authentication Flow",
    description: "User authentication and session management",
    steps: ["User submits credentials", "API validates", "Session created"],
    modules: ["auth", "session"],
    critical: true,
  },
];

const driftResult = {
  drifts: [
    { type: "module_added", description: "New module: src/analytics" },
    { type: "dependency_change", description: "New external dep: lodash" },
  ],
  summary: "2 drifts detected",
};

const scanResult = {
  filesCount: 120,
  modules: [
    { key: "auth", fileCount: 10 },
    { key: "session", fileCount: 5 },
    { key: "src/lib/helpers", fileCount: 3 },
    { key: "src/utils/format", fileCount: 2 },
  ],
  pages: [],
  api: [{ path: "/api/auth", methods: ["POST"], file: "src/api/auth.ts" }],
  metadata: {},
};

// ── Executive Summary ───────────────────────────────────────────────

describe("Enriched Executive Summary", () => {
  it("includes basic project info without enrichment", async () => {
    const result = await generateExecutiveSummary(baseContext);
    expect(result).toContain("Executive Summary");
    expect(result).toContain("TestProject");
    expect(result).toContain("120 files");
  });

  it("includes module composition when enrichment has topModules types", async () => {
    const result = await generateExecutiveSummary(baseContext, { depGraph, flows });
    expect(result).toContain("Module Composition");
    expect(result).toContain("API Layer");
    expect(result).toContain("UI Components");
    expect(result).toContain("Shared Libraries");
  });

  it("includes monorepo info", async () => {
    const result = await generateExecutiveSummary(baseContext, { depGraph, flows });
    expect(result).toContain("Monorepo Structure");
    expect(result).toContain("pnpm");
    expect(result).toContain("3 packages");
  });

  it("includes codebase health from depGraph", async () => {
    const result = await generateExecutiveSummary(baseContext, { depGraph, flows });
    expect(result).toContain("Codebase Health");
    expect(result).toContain("Internal imports");
    expect(result).toContain("cycle-free");
  });

  it("includes data flows summary", async () => {
    const result = await generateExecutiveSummary(baseContext, { depGraph, flows });
    expect(result).toContain("Key Data Flows");
    expect(result).toContain("Authentication Flow");
    expect(result).toContain("(critical)");
  });

  it("includes test frameworks in tech profile", async () => {
    const result = await generateExecutiveSummary(baseContext, {});
    expect(result).toContain("Vitest");
    expect(result).toContain("Playwright");
  });

  it("shows cycle warning when cycles exist", async () => {
    const graphWithCycles = { ...depGraph, stats: { ...depGraph.stats, cycles: 3 } };
    const result = await generateExecutiveSummary(baseContext, { depGraph: graphWithCycles });
    expect(result).toContain("3 circular dependencies");
  });
});

// ── System Overview ─────────────────────────────────────────────────

describe("Enriched System Overview", () => {
  it("includes module architecture breakdown", async () => {
    const result = await generateSystemOverview(baseContext, { depGraph });
    expect(result).toContain("Module Architecture");
    expect(result).toContain("API Layer");
    expect(result).toContain("UI Components");
  });

  it("includes route summary", async () => {
    const result = await generateSystemOverview(baseContext, { depGraph });
    expect(result).toContain("Route Summary");
    expect(result).toContain("/dashboard");
    expect(result).toContain("/api/users");
  });

  it("includes dependency graph stats", async () => {
    const result = await generateSystemOverview(baseContext, { depGraph });
    expect(result).toContain("Dependency Graph");
    expect(result).toContain("Hub modules");
    expect(result).toContain("src/utils/logger");
  });

  it("includes monorepo info", async () => {
    const result = await generateSystemOverview(baseContext, { depGraph });
    expect(result).toContain("Monorepo");
    expect(result).toContain("pnpm");
  });

  it("includes test frameworks in tech stack", async () => {
    const result = await generateSystemOverview(baseContext, {});
    expect(result).toContain("Vitest");
  });
});

// ── Business Domains ────────────────────────────────────────────────

describe("Enriched Business Domains", () => {
  it("includes cross-domain dependency section", async () => {
    const result = await generateBusinessDomains(baseContext, { depGraph });
    expect(result).toContain("Cross-Domain Dependencies");
    expect(result).toContain("src/utils/logger");
    expect(result).toContain("imported by");
  });

  it("renders all domains with metrics", async () => {
    const result = await generateBusinessDomains(baseContext, { depGraph });
    expect(result).toContain("Authentication");
    expect(result).toContain("API Layer");
    expect(result).toContain("UI Components");
  });

  it("works gracefully without enrichment", async () => {
    const result = await generateBusinessDomains(baseContext);
    expect(result).toContain("Business Domains");
    expect(result).toContain("Authentication");
    expect(result).not.toContain("Cross-Domain Dependencies");
  });
});

// ── Architecture Overview ───────────────────────────────────────────

describe("Enriched Architecture Overview", () => {
  it("includes module layers section", async () => {
    const result = await generateArchitectureOverview(baseContext, { depGraph, driftResult });
    expect(result).toContain("Module Layers");
    expect(result).toContain("API Layer");
    expect(result).toContain("UI Components");
  });

  it("includes dependency health with strengths", async () => {
    const result = await generateArchitectureOverview(baseContext, { depGraph, driftResult });
    expect(result).toContain("Dependency Health");
    expect(result).toContain("No circular dependencies");
  });

  it("includes hub modules", async () => {
    const result = await generateArchitectureOverview(baseContext, { depGraph, driftResult });
    expect(result).toContain("Hub modules");
    expect(result).toContain("src/utils/logger");
  });

  it("includes drift information", async () => {
    const result = await generateArchitectureOverview(baseContext, { depGraph, driftResult });
    expect(result).toContain("Architecture Drift");
    expect(result).toContain("module_added");
    expect(result).toContain("src/analytics");
  });

  it("includes monorepo architecture", async () => {
    const result = await generateArchitectureOverview(baseContext, { depGraph, driftResult });
    expect(result).toContain("Monorepo Architecture");
    expect(result).toContain("@app/web");
  });

  it("shows cycle concerns when present", async () => {
    const graphWithCycles = { ...depGraph, stats: { ...depGraph.stats, cycles: 2 } };
    const result = await generateArchitectureOverview(baseContext, { depGraph: graphWithCycles });
    expect(result).toContain("2 circular dependencies");
    expect(result).toContain("Concerns");
  });
});

// ── Data Flows ──────────────────────────────────────────────────────

describe("Enriched Data Flows", () => {
  it("renders heuristic flows with dependency context", async () => {
    const result = await generateDataFlows(flows, baseContext, { depGraph, scanResult });
    expect(result).toContain("Authentication Flow");
    expect(result).toContain("Shared libraries used");
    expect(result).toContain("External services");
  });

  it("includes import network summary", async () => {
    const result = await generateDataFlows(flows, baseContext, { depGraph, scanResult });
    expect(result).toContain("Import Network");
    expect(result).toContain("5 internal import edges");
  });

  it("generates dep-graph flows when heuristic flows are empty", async () => {
    const result = await generateDataFlows([], baseContext, { depGraph, scanResult });
    expect(result).toContain("Integration Flow");
  });

  it("shows no-flows message when both sources are empty", async () => {
    const emptyGraph = { nodes: [], edges: [], cycles: [], stats: { totalFiles: 0, totalEdges: 0, externalDeps: 0, cycles: 0, orphanFiles: 0, hubs: [] } };
    const result = await generateDataFlows([], baseContext, { depGraph: emptyGraph });
    expect(result).toContain("No data flows were detected");
  });

  it("works without enrichment (backward-compatible)", async () => {
    const result = await generateDataFlows(flows, baseContext);
    expect(result).toContain("Authentication Flow");
    expect(result).toContain("Data Flows");
  });
});

// ── Developer Onboarding ────────────────────────────────────────────

describe("Enriched Developer Onboarding", () => {
  it("includes module type in onboarding table", async () => {
    const result = await generateDeveloperOnboarding(baseContext, { flows, depGraph });
    expect(result).toContain("API Layer");
    expect(result).toContain("UI Components");
    expect(result).toContain("Type");
  });

  it("includes key routes section", async () => {
    const result = await generateDeveloperOnboarding(baseContext, { flows, depGraph });
    expect(result).toContain("Key Routes");
    expect(result).toContain("/dashboard");
    expect(result).toContain("/api/users");
  });

  it("includes data flows overview", async () => {
    const result = await generateDeveloperOnboarding(baseContext, { flows, depGraph });
    expect(result).toContain("How Data Flows");
    expect(result).toContain("Authentication Flow");
  });

  it("includes key integration points from depGraph", async () => {
    const result = await generateDeveloperOnboarding(baseContext, { flows, depGraph });
    expect(result).toContain("Key Integration Points");
    expect(result).toContain("src/utils/logger");
  });

  it("includes monorepo navigation", async () => {
    const result = await generateDeveloperOnboarding(baseContext, { flows, depGraph });
    expect(result).toContain("Monorepo Navigation");
    expect(result).toContain("@app/web");
  });

  it("includes test framework quickstart", async () => {
    const result = await generateDeveloperOnboarding(baseContext, { flows, depGraph });
    expect(result).toContain("Vitest");
  });

  it("works without enrichment", async () => {
    const result = await generateDeveloperOnboarding(baseContext);
    expect(result).toContain("Developer Onboarding");
    expect(result).toContain("TestProject");
  });
});

// ── Backward Compatibility ──────────────────────────────────────────

describe("Backward compatibility", () => {
  it("all generators work with no enrichment argument", async () => {
    const exec = await generateExecutiveSummary(baseContext);
    const sys = await generateSystemOverview(baseContext);
    const biz = await generateBusinessDomains(baseContext);
    const arch = await generateArchitectureOverview(baseContext);
    const df = await generateDataFlows(flows, baseContext);
    const onboard = await generateDeveloperOnboarding(baseContext);

    expect(exec).toContain("Executive Summary");
    expect(sys).toContain("System Overview");
    expect(biz).toContain("Business Domains");
    expect(arch).toContain("Architecture Overview");
    expect(df).toContain("Data Flows");
    expect(onboard).toContain("Developer Onboarding");
  });

  it("context without monorepo produces no monorepo sections", async () => {
    const noMonoCtx = { ...baseContext, monorepo: undefined };
    const result = await generateExecutiveSummary(noMonoCtx);
    expect(result).not.toContain("Monorepo");
  });

  it("context without routes produces no route sections", async () => {
    const noRoutesCtx = { ...baseContext, routes: { pages: [], apis: [] } };
    const result = await generateSystemOverview(noRoutesCtx);
    expect(result).not.toContain("Route Summary");
  });
});
