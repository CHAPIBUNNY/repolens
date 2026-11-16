// 1.17.1 accuracy fixes found mapping terrakube-io/terrakube (Java + Vite/React):
// 1. Java modules by package (all modules were "Isolated" despite 5,971 edges)
// 2. tsconfig / Vite `@/` path aliases resolve to local files, not npm packages
// 3. project name from repo/build metadata, not the clone folder ("tk")
// 4. onboarding "Repository Structure" lists api/executor/registry (Maven modules)
// 5. Java/C# package cycles grouped into strongly connected groups (50 overlapping loops)
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

vi.mock("../src/ai/provider.js", () => ({
  generateText: vi.fn().mockResolvedValue({ success: false }),
  isAIEnabled: vi.fn().mockReturnValue(false),
}));

import { analyzeDependencyGraph, detectPackageCycles, classifyPackageCycle } from "../src/analyzers/dependency-graph.js";
import { buildJvmModuleKeyer, jvmSourceSetOf } from "../src/core/jvm-modules.js";
import { scanRepo } from "../src/core/scan.js";
import { detectRepoLanguages } from "../src/core/languages.js";
import { computeModuleLevelMetrics, describeModuleDepRole, repositoryRoots, buildAIContext } from "../src/analyzers/context-builder.js";
import { createAliasResolver, parseViteAliases } from "../src/analyzers/path-aliases.js";
import { externalPackageName } from "../src/analyzers/import-parsers.js";
import { detectProjectName, repoNameFromRemoteUrl } from "../src/utils/project-name.js";
import { renderDependencyGraph } from "../src/renderers/renderAnalysis.js";
import { generateDeveloperOnboarding } from "../src/ai/generate-sections.js";

let tempDir;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-tk-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

async function write(rel, content) {
  const file = path.join(tempDir, rel);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content);
  return rel;
}

async function writeAll(map) {
  const files = [];
  for (const [rel, content] of Object.entries(map)) {
    await write(rel, content);
    if (/\.(java|cs|js|jsx|ts|tsx)$/.test(rel)) files.push(rel);
  }
  return files;
}

const API = "api/src/main/java/io/acme/api";

// A small Maven multi-module repo shaped like terrakube.
async function terrakubeLike() {
  return writeAll({
    "pom.xml": "<project><artifactId>acme-platform</artifactId></project>",
    "api/pom.xml": "<project><artifactId>api</artifactId></project>",
    "executor/pom.xml": "<project><artifactId>executor</artifactId></project>",
    [`${API}/Application.java`]: "package io.acme.api;\nimport io.acme.api.rs.Workspace;\npublic class Application { Workspace w; }\n",
    [`${API}/rs/Workspace.java`]: "package io.acme.api.rs;\nimport io.acme.api.plugin.Scheduler;\npublic class Workspace { Scheduler s; }\n",
    [`${API}/rs/job/Job.java`]: "package io.acme.api.rs.job;\nimport io.acme.api.rs.Workspace;\npublic class Job { Workspace w; }\n",
    [`${API}/plugin/Scheduler.java`]: "package io.acme.api.plugin;\nimport io.acme.api.rs.job.Job;\nimport io.acme.api.repository.JobRepository;\npublic class Scheduler { Job j; JobRepository r; }\n",
    [`${API}/repository/JobRepository.java`]: "package io.acme.api.repository;\nimport io.acme.api.rs.job.Job;\npublic class JobRepository { Job j; }\n",
    "api/src/test/java/io/acme/api/rs/WorkspaceTest.java": "package io.acme.api.rs;\npublic class WorkspaceTest { Workspace w; }\n",
    "executor/src/main/java/io/acme/executor/service/Runner.java": "package io.acme.executor.service;\nimport io.acme.executor.plugin.Logs;\npublic class Runner { Logs l; }\n",
    "executor/src/main/java/io/acme/executor/plugin/Logs.java": "package io.acme.executor.plugin;\npublic class Logs {}\n",
  });
}

describe("1. Java modules by package", () => {
  it("splits a main source set by top-level package and keeps test source sets whole", () => {
    const files = [
      `${API}/Application.java`,
      `${API}/rs/Workspace.java`,
      `${API}/rs/job/Job.java`,
      `${API}/plugin/Scheduler.java`,
      "api/src/test/java/io/acme/api/rs/WorkspaceTest.java",
      "api/src/main/java/module-info.java",
      "api/src/main/resources/app.js",
    ];
    const keyOf = buildJvmModuleKeyer(files);
    expect(keyOf(`${API}/Application.java`)).toBe(API);
    expect(keyOf(`${API}/rs/Workspace.java`)).toBe(`${API}/rs`);
    expect(keyOf(`${API}/rs/job/Job.java`)).toBe(`${API}/rs`);
    expect(keyOf(`${API}/plugin/Scheduler.java`)).toBe(`${API}/plugin`);
    expect(keyOf("api/src/test/java/io/acme/api/rs/WorkspaceTest.java")).toBe("api/src/test/java");
    expect(keyOf("api/src/main/java/module-info.java")).toBe("api/src/main/java");
    expect(keyOf("api/src/main/resources/app.js")).toBeNull();
    expect(jvmSourceSetOf("src/integrationTest/kotlin/a/B.kt").sourceRoot).toBe("src/integrationTest/kotlin");
  });

  it("respects a configured module root inside a source set", () => {
    const keyOf = buildJvmModuleKeyer([`${API}/rs/Workspace.java`], [`${API}`]);
    expect(keyOf(`${API}/rs/Workspace.java`)).toBeNull();
  });

  it("finds Maven modules whose sources are deeper than the language walk", async () => {
    await terrakubeLike();
    await write("ui/src/main.tsx", "export {};\n");
    const detected = await detectRepoLanguages(tempDir);
    expect(detected.moduleRoots).toEqual(expect.arrayContaining(["api", "executor", "ui"]));
  });

  it("labels coupled Java packages by their imports, not Isolated", async () => {
    const files = await terrakubeLike();
    const scan = await scanRepo({ __repoRoot: tempDir, scan: { include: ["**/*.java"], ignore: [] }, module_roots: ["api", "executor"] });
    const keys = scan.modules.map((m) => m.key).sort();
    expect(keys).toEqual([
      API,
      `${API}/plugin`,
      `${API}/repository`,
      `${API}/rs`,
      "api/src/test/java",
      "executor/src/main/java/io/acme/executor/plugin",
      "executor/src/main/java/io/acme/executor/service",
    ].sort());
    const graph = await analyzeDependencyGraph(files, tempDir);
    const metrics = computeModuleLevelMetrics(graph, scan.modules);
    expect(metrics.get(`${API}/rs`).fanIn).toBeGreaterThanOrEqual(2);
    expect(describeModuleDepRole(`${API}/rs`, metrics)).not.toMatch(/Isolated/);
    expect(describeModuleDepRole("executor/src/main/java/io/acme/executor/plugin", metrics)).toMatch(/Leaf module/);
    const isolated = [...metrics.keys()].filter((key) => describeModuleDepRole(key, metrics)?.startsWith("Isolated"));
    expect(isolated).toEqual([]);
  });

  it("calls a module with only internal imports self-contained, not isolated", () => {
    const depGraph = {
      nodes: [
        { key: "ui/src/a", file: "ui/src/a.ts", imports: ["ui/src/b"], importedBy: [] },
        { key: "ui/src/b", file: "ui/src/b.ts", imports: [], importedBy: ["ui/src/a"] },
        { key: "e2e/x", file: "e2e/x.ts", imports: [], importedBy: [] },
      ],
    };
    const modules = [{ key: "ui/src", fileCount: 2 }, { key: "e2e", fileCount: 1 }];
    const metrics = computeModuleLevelMetrics(depGraph, modules);
    expect(describeModuleDepRole("ui/src", metrics)).toBe("Self-contained (1 import between its own files, none across modules)");
    expect(describeModuleDepRole("e2e", metrics)).toBe("Isolated (no imports or importers)");
  });
});

describe("2. tsconfig and Vite path aliases", () => {
  it("resolves `@/` through a solution-style tsconfig (references → tsconfig.app.json)", async () => {
    const files = await writeAll({
      "ui/package.json": JSON.stringify({ name: "ui", dependencies: { antd: "5" } }),
      "ui/tsconfig.json": JSON.stringify({ files: [], references: [{ path: "./tsconfig.app.json" }, { path: "./tsconfig.node.json" }] }),
      "ui/tsconfig.app.json": '{\n  // Vite app\n  "compilerOptions": { "paths": { "@/*": ["./src/*"], "@/modules/*": ["./src/modules/*"] } },\n}\n',
      "ui/tsconfig.node.json": JSON.stringify({ compilerOptions: {} }),
      "ui/src/App.tsx": 'import { Button } from "@/components/Button";\nimport { fmt } from "@/modules/utils/dates";\nimport "@/styles/app.css";\nimport { Table } from "antd";\nexport const App = () => <Button>{fmt()}{Table}</Button>;\n',
      "ui/src/components/Button/index.tsx": "export const Button = (p: any) => p;\n",
      "ui/src/modules/utils/dates.ts": "export function fmt() { return 1; }\n",
    });
    const graph = await analyzeDependencyGraph(files, tempDir);
    const app = graph.nodes.find((n) => n.file === "ui/src/App.tsx");
    expect(app.imports.sort()).toEqual(["ui/src/components/Button", "ui/src/modules/utils/dates"]);
    expect(graph.externalDeps).toEqual(["antd"]);
  });

  it("resolves a Vite resolve.alias when no tsconfig declares it", async () => {
    const files = await writeAll({
      "web/package.json": JSON.stringify({ name: "web" }),
      "web/vite.config.mts": 'import { resolve } from "path";\nexport default defineConfig(() => ({\n  resolve: {\n    alias: {\n      "@": resolve(projectRoot, "src"),\n      "~lib": fileURLToPath(new URL("./lib", import.meta.url)),\n    },\n  },\n}));\n',
      "web/src/main.ts": 'import { a } from "@/a";\nimport { b } from "~lib/b";\nimport x from "@ant-design/icons";\nexport default [a, b, x];\n',
      "web/src/a.ts": "export const a = 1;\n",
      "web/lib/b.ts": "export const b = 2;\n",
    });
    const graph = await analyzeDependencyGraph(files, tempDir);
    const main = graph.nodes.find((n) => n.file === "web/src/main.ts");
    expect(main.imports.sort()).toEqual(["web/lib/b", "web/src/a"]);
    expect(graph.externalDeps).toEqual(["@ant-design/icons"]);
  });

  it("parses the array form of Vite aliases", () => {
    const aliases = parseViteAliases('export default { resolve: { alias: [ { find: "@", replacement: path.resolve(__dirname, "./src") }, { find: /^x/, replacement: "y" } ] } }');
    expect(aliases).toEqual([{ find: "@", target: "src" }]);
  });

  it("uses tsconfig paths from the extends chain and baseUrl", async () => {
    await write("tsconfig.base.json", JSON.stringify({ compilerOptions: { baseUrl: "src", paths: { "#app/*": ["app/*"] } } }));
    await write("tsconfig.json", JSON.stringify({ extends: "./tsconfig.base.json" }));
    await write("src/app/x.ts", "export {};\n");
    await write("src/utils/y.ts", "export {};\n");
    const resolve = createAliasResolver(tempDir);
    expect(await resolve("src/main.ts", "#app/x")).toEqual({ matched: true, candidates: ["src/app/x"] });
    expect(await resolve("src/main.ts", "utils/y")).toEqual({ matched: false, candidates: ["src/utils/y"] });
    expect(await resolve("src/main.ts", "./rel")).toBeNull();
  });

  it("never reports `@/x` or `~/x` as an npm package, even without a config", async () => {
    expect(externalPackageName("@/components")).toBeNull();
    expect(externalPackageName("~/utils")).toBeNull();
    expect(externalPackageName("@scope/pkg/sub")).toBe("@scope/pkg");
    const files = await writeAll({ "a.ts": 'import x from "@/missing";\nimport y from "~/also";\nexport default [x, y];\n' });
    const graph = await analyzeDependencyGraph(files, tempDir);
    expect(graph.externalDeps).toEqual([]);
  });
});

describe("3. project name from repository or build metadata", () => {
  it("uses the git remote's repository name over the clone folder", async () => {
    await write("tk/.git/config", '[core]\n\tbare = false\n[remote "origin"]\n\turl = https://github.com/terrakube-io/terrakube.git\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n');
    expect(detectProjectName(path.join(tempDir, "tk"))).toBe("terrakube");
  });

  it("follows a worktree's .git file to the common config", async () => {
    await write("main/.git/config", '[remote "origin"]\n\turl = git@github.com:google/gson\n');
    await write("main/.git/worktrees/wt/commondir", "../..\n");
    await write("wt/.git", `gitdir: ${path.join(tempDir, "main/.git/worktrees/wt")}\n`);
    expect(detectProjectName(path.join(tempDir, "wt"))).toBe("gson");
  });

  it("does not take the remote of an enclosing repository for a sub-folder", async () => {
    await write("repo/.git/config", '[remote "origin"]\n\turl = https://github.com/acme/outer.git\n');
    await fs.mkdir(path.join(tempDir, "repo/sub"), { recursive: true });
    expect(detectProjectName(path.join(tempDir, "repo/sub"))).toBe("sub");
  });

  it("reads Gradle rootProject.name, the Maven artifactId (not the parent's), and a .NET solution", async () => {
    await write("g/settings.gradle.kts", '// settings\nrootProject.name = "mockito"\ninclude("core")\n');
    expect(detectProjectName(path.join(tempDir, "g"))).toBe("mockito");
    await write("m/pom.xml", "<project>\n<parent><artifactId>spring-boot-starter-parent</artifactId></parent>\n<!-- <artifactId>nope</artifactId> -->\n<artifactId>terrakube-platform</artifactId>\n<dependencies><dependency><artifactId>x</artifactId></dependency></dependencies>\n</project>\n");
    expect(detectProjectName(path.join(tempDir, "m"))).toBe("terrakube");
    await write("d/Polly.slnx", "<Solution />\n");
    expect(detectProjectName(path.join(tempDir, "d"))).toBe("Polly");
  });

  it("keeps package.json first", async () => {
    await write("p/package.json", JSON.stringify({ name: "@scope/web" }));
    await write("p/.git/config", '[remote "origin"]\n\turl = https://github.com/acme/other.git\n');
    expect(detectProjectName(path.join(tempDir, "p"))).toBe("@scope/web");
  });

  it("parses remote URLs", () => {
    expect(repoNameFromRemoteUrl("https://github.com/a/b.git")).toBe("b");
    expect(repoNameFromRemoteUrl("git@github.com:a/b")).toBe("b");
    expect(repoNameFromRemoteUrl("ssh://git@host:22/a/b.git/")).toBe("b");
    expect(repoNameFromRemoteUrl("")).toBeNull();
  });
});

describe("4. onboarding repository structure", () => {
  it("adds top-level folders whose modules no configured root covers", () => {
    const modules = [
      { key: "ui/src", fileCount: 420 },
      { key: `${API}/plugin`, fileCount: 409 },
      { key: "executor/src/main/java/io/acme/executor/service", fileCount: 71 },
      { key: "registry/src/test/java", fileCount: 23 },
      { key: "README", fileCount: 1, flat: true },
    ];
    expect(repositoryRoots(["docker-compose", "ui"], modules)).toEqual(["docker-compose", "ui", "api", "executor", "registry"]);
    expect(repositoryRoots(["src"], [])).toEqual(["src"]);
  });

  it("lists api/executor in the onboarding table and points Where to Begin at real modules", async () => {
    const files = await terrakubeLike();
    const detected = await detectRepoLanguages(tempDir);
    const cfg = { __repoRoot: tempDir, project: { name: "acme" }, scan: { include: detected.include, ignore: [] }, module_roots: detected.moduleRoots };
    const scan = await scanRepo(cfg);
    const graph = await analyzeDependencyGraph(files, tempDir);
    const context = buildAIContext(scan, cfg, graph);
    expect(context.repoRoots).toEqual(expect.arrayContaining(["api", "executor"]));
    const md = await generateDeveloperOnboarding(context, { depGraph: graph });
    expect(md).toContain("| `api` |");
    expect(md).toContain("| `executor` |");
    expect(md).toContain("Start with the largest source modules");
    expect(md).toContain(`\`${API}/rs\``);
    expect(md).not.toContain("Start by exploring the main `src/` directory");
  });
});

describe("5. package cycles as strongly connected groups", () => {
  function pkgGraph(edges) {
    const adjacency = new Map();
    const packageOfKey = new Map();
    for (const [from, to] of edges) {
      for (const pkg of [from, to]) {
        if (!adjacency.has(pkg)) adjacency.set(pkg, new Set());
        packageOfKey.set(pkg, { id: `java:r:${pkg}`, label: pkg, scope: "r" });
      }
      adjacency.get(from).add(to);
    }
    return detectPackageCycles(adjacency, packageOfKey);
  }

  it("reports one entry for overlapping loops of one knot, with its shortest loop and two-way pairs", () => {
    const cycles = pkgGraph([
      ["rs", "plugin"], ["plugin", "rs"],
      ["rs", "repo"], ["repo", "vcs"], ["vcs", "exec"], ["exec", "rs"],
      ["plugin", "vcs"], ["exec", "plugin"],
      ["x", "y"],
    ]);
    expect(cycles).toHaveLength(1);
    const [group] = cycles;
    expect(group.members).toEqual(["exec", "plugin", "repo", "rs", "vcs"]);
    expect(group.path).toEqual(["plugin", "rs", "plugin"]);
    expect(group.pairs).toEqual([{ a: "plugin", b: "rs", ab: 1, ba: 1 }]);
    const report = classifyPackageCycle(group);
    expect(report.priority).toBe("high");
    const md = renderDependencyGraph({
      cycles: [group.path], cycleReports: [report], nodes: [{ key: "a", file: "a.java", imports: [], importedBy: [] }], edges: [], externalDeps: [],
      stats: { totalFiles: 1, totalEdges: 9, externalDeps: 0, cycles: 1, packageCycles: 1, orphanFiles: 0, hubs: [] },
    });
    expect(md).toContain("**5 packages in one cycle group:** `exec`, `plugin`, `repo`, `rs`, `vcs`");
    expect(md).toContain("Shortest loop: `plugin` → `rs` → `plugin`");
    expect(md).toContain("Two-way pairs (imports each way): `plugin` ↔ `rs` (1/1)");
  });

  it("calls a parent with sub-packages that only loop through it Low, and a loop between sub-packages Medium", () => {
    const star = pkgGraph([["p", "p.a"], ["p.a", "p"], ["p", "p.b"], ["p.b", "p"], ["p", "p.c"], ["p.c", "p"]]);
    expect(star).toHaveLength(1);
    const low = classifyPackageCycle(star[0]);
    expect(low.priority).toBe("low");
    expect(low.label).toBe("parent/child package pairs around `p` (3 sub-packages, no loop between them), common in Java; verify");

    const through = pkgGraph([["g", "g.internal"], ["g.internal", "g.reflect"], ["g.reflect", "g"]]);
    expect(classifyPackageCycle(through[0]).priority).toBe("medium");

    const hidden = pkgGraph([["g", "g.a"], ["g.a", "g"], ["g.a", "g.b"], ["g.b", "g.c"], ["g.c", "g.a"]]);
    expect(hidden).toHaveLength(1);
    expect(classifyPackageCycle(hidden[0]).priority).toBe("high");
  });

  it("counts groups, not loops, in the full analysis", async () => {
    const files = await terrakubeLike();
    const graph = await analyzeDependencyGraph(files, tempDir);
    // rs → plugin → rs.job → rs and plugin → repository → rs.job: one group of four packages.
    expect(graph.stats.packageCycles).toBe(1);
    expect(graph.stats.packagesInCycles).toBe(4);
    expect(graph.cycleReports[0].members).toEqual(["io.acme.api.plugin", "io.acme.api.repository", "io.acme.api.rs", "io.acme.api.rs.job"]);
    expect(graph.cycles).toHaveLength(1);
  });
});

describe("2b. aliases that must not hide npm packages (review)", () => {
  it("keeps externals for a catch-all `*` pattern, node_modules targets, and Vite package aliases", async () => {
    const files = await writeAll({
      "tsconfig.json": JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "*": ["*", "src/types/*"], react: ["./node_modules/@types/react"], "@app/*": ["src/*"] } } }),
      "vite.config.ts": 'export default { resolve: { alias: { react: "preact/compat", "react-dom": "preact/compat" } } };\n',
      "src/main.ts": 'import React from "react";\nimport dayjs from "dayjs";\nimport { a } from "@app/a";\nimport { t } from "shared";\nexport default [React, dayjs, a, t];\n',
      "src/a.ts": "export const a = 1;\n",
      "src/types/shared.ts": "export const t = 1;\n",
    });
    const graph = await analyzeDependencyGraph(files, tempDir);
    const main = graph.nodes.find((n) => n.file === "src/main.ts");
    expect(main.imports.sort()).toEqual(["src/a", "src/types/shared"]);
    expect(graph.externalDeps.sort()).toEqual(["dayjs", "react"]);
    expect(parseViteAliases('alias: { react: "preact/compat", "@": "/src" }')).toEqual([{ find: "@", target: "src" }]);
  });
});

describe("1b. JVM module typing (review)", () => {
  it("types a package module by its package, not the Maven module name", async () => {
    const { stripContainerSegments } = await import("../src/analyzers/domain-inference.js");
    expect(stripContainerSegments(`${API}/repository`)).toBe("repository");
    expect(stripContainerSegments("api/src/test/java")).toBe("test");
    expect(stripContainerSegments("api/src/main/java")).toBe("");
    expect(stripContainerSegments("src/lib/ogg")).toBe("ogg");
  });
});

describe("5b. health weight of cycle groups (review)", () => {
  it("weighs a large group like several loops, capped at 3", async () => {
    const { cycleWeight, cycleHealthPenalty, priorityCounts } = await import("../src/analyzers/cycle-priority.js");
    expect(cycleWeight({ path: ["a", "b", "a"] })).toBe(1);
    expect(cycleWeight({ members: ["a", "b", "c"] })).toBe(1);
    expect(cycleWeight({ members: Array.from({ length: 7 }, (_, i) => `p${i}`) })).toBe(2);
    expect(cycleWeight({ members: Array.from({ length: 89 }, (_, i) => `p${i}`) })).toBe(3);
    const counts = priorityCounts([{ priority: "high", members: Array.from({ length: 7 }, (_, i) => `p${i}`) }, { priority: "medium" }]);
    expect(counts).toMatchObject({ high: 1, medium: 1, highWeight: 2, mediumWeight: 1 });
    expect(cycleHealthPenalty({ cycles: 2, highCycles: 1, mediumCycles: 1, lowCycles: 0, highCycleWeight: 2, mediumCycleWeight: 1 })).toBe(25);
    expect(cycleHealthPenalty({ cycles: 2, highCycles: 1, mediumCycles: 1, lowCycles: 0 })).toBe(15);
  });
});

describe("1c. system map for JVM package modules (review)", () => {
  it("names modules by build module and package, and does not file `src/main/java` under AI / ML", async () => {
    const { renderSystemMap } = await import("../src/renderers/renderMap.js");
    const { jvmModuleShortLabel } = await import("../src/core/jvm-modules.js");
    expect(jvmModuleShortLabel(`${API}/plugin`)).toBe("api/plugin");
    expect(jvmModuleShortLabel("api/src/test/java")).toBe("api/test");
    expect(jvmModuleShortLabel("ui/src/components")).toBeNull();
    const modules = [
      { key: `${API}/plugin`, fileCount: 40 },
      { key: "executor/src/main/java/io/acme/executor/plugin", fileCount: 9 },
      { key: `${API}/rs`, fileCount: 30 },
      { key: "api/src/test/java", fileCount: 20 },
    ];
    const depGraph = { edges: [{ from: `${API}/rs/Workspace`, to: `${API}/plugin/Scheduler` }], nodes: [] };
    const md = renderSystemMap({ modules }, {}, depGraph);
    expect(md).toContain("api/plugin (40 files)");
    expect(md).toContain("executor/plugin (9 files)");
    expect(md).toContain("→ api/plugin");
    expect(md).not.toContain("AI / ML");
    expect(md).toMatch(/TESTING[\s\S]*api\/test \(20 files\)/);
  });
});

describe("1d. JVM module descriptions use the package, not the Maven module (review)", async () => {
  const { renderModuleCatalog } = await import("../src/renderers/render.js");
  const { describeOnboardingModule } = await import("../src/ai/generate-sections.js");

  it("catalog does not call every package of an `api` service an API module", () => {
    const scan = {
      filesCount: 3,
      modules: [
        { key: "api/src/main/java/io/terrakube/api/plugin", fileCount: 400 },
        { key: "api/src/main/java/io/terrakube/api/repository", fileCount: 49 },
        { key: "api/src/test/java", fileCount: 300 },
      ],
    };
    const out = renderModuleCatalog({}, scan, {}, null);
    expect(out).not.toMatch(/API route handlers/);
    expect(out).toMatch(/api\/plugin`?[^\n]*Plugin system/);
    expect(out).toMatch(/repository`[^\n]*Data access layer/);
    expect(out).toMatch(/src\/test\/java`[^\n]*Test suites/);
  });

  it("architecture overview descriptions follow the package", () => {
    expect(describeOnboardingModule("api/src/main/java/io/terrakube/api/plugin")).toBe("Plugin module");
    expect(describeOnboardingModule("api/src/main/java/io/terrakube/api/repository")).toBe("Data access layer");
    expect(describeOnboardingModule("api/src/test/java")).toBe("Test infrastructure");
    // Non-JVM paths keep the folder rules.
    expect(describeOnboardingModule("src/api")).toBe("API layer and route handlers");
  });
});
