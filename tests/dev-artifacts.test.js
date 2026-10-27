import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { scanRepo } from "../src/core/scan.js";
import { resolveScanIgnore, DEV_ARTIFACT_IGNORE } from "../src/core/scan-defaults.js";
import { analyzeDependencyGraph } from "../src/analyzers/dependency-graph.js";
import { analyzeTypeScript } from "../src/analyzers/typescript-analyzer.js";
import { loadConfig } from "../src/core/config.js";
import { isDevArtifactPath, isSnapshotPath, isTestPath } from "../src/utils/path-roles.js";

let tempDir;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-artifacts-"));
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

function scanConfig(extra = {}) {
  return {
    configVersion: 1,
    project: { name: "fixture" },
    publishers: ["markdown"],
    scan: {
      include: ["**/*.{js,ts,tsx}"],
      ignore: ["**/node_modules/**"],
      ...extra,
    },
    module_roots: ["src"],
    outputs: { pages: [{ key: "system_overview", title: "System Overview" }] },
    __repoRoot: tempDir,
  };
}

describe("dev artifact paths", () => {
  it("treats snapshots and sample trees as dev tooling", () => {
    expect(isSnapshotPath("tests/__snapshots__/pets.ts")).toBe(true);
    expect(isTestPath("tests/__snapshots__/pets.ts")).toBe(true);
    expect(isSnapshotPath("src/widget.test.ts.snap")).toBe(true);
    expect(isDevArtifactPath("samples/basic/client.ts")).toBe(true);
    expect(isDevArtifactPath("e2e-fixtures/seed.ts")).toBe(true);
    expect(isDevArtifactPath("tests/generated/pets.ts")).toBe(true);
    expect(isDevArtifactPath("src/client.ts")).toBe(false);
  });

  it("merges the default ignore list unless the config opts in", () => {
    const merged = resolveScanIgnore({ ignore: ["**/node_modules/**"] });
    expect(merged).toContain("**/node_modules/**");
    expect(merged).toEqual(expect.arrayContaining(DEV_ARTIFACT_IGNORE));

    const optedIn = resolveScanIgnore({
      ignore: ["**/node_modules/**", "**/samples/**"],
      include_dev_artifacts: true,
    });
    expect(optedIn).toEqual(["**/node_modules/**", "**/samples/**"]);
  });
});

describe("scan excludes snapshots, samples, fixtures, and generated output", () => {
  beforeEach(async () => {
    await write("src/app.ts", `export interface ProductFace { id: string }\nexport const app = 1;\n`);
    await write("samples/client.ts", `export interface SampleFace { id: string }\nexport const sample = 1;\n`);
    await write("tests/__snapshots__/pets.ts", `export interface SnapshotFace { id: string }\n`);
    await write("tests/generated/pets.ts", `export interface GeneratedFace { id: string }\n`);
    await write("fixtures/seed.ts", `export interface FixtureFace { id: string }\n`);
    await write("examples/demo.ts", `export interface ExampleFace { id: string }\n`);
    await write("e2e-fixtures/case.ts", `export interface E2EFace { id: string }\n`);
    await write("src/widget.test.ts.snap", `export interface SnapFace { id: string }\n`);
    await write("keep-out/noise.ts", `export const noise = 1;\n`);
  });

  it("drops them from the file count, orphans, and the type graph", async () => {
    const scan = await scanRepo(scanConfig());
    const product = scan._files.filter((file) => !file.startsWith("keep-out/"));
    expect(product).toEqual(["src/app.ts"]);
    expect(scan._files).toContain("keep-out/noise.ts");
    expect(scan.filesCount).toBe(2);

    const types = await analyzeTypeScript(scan._files, tempDir);
    const names = [
      ...types.interfaces.map((item) => item.name),
      ...types.typeAliases.map((item) => item.name),
    ];
    expect(names).toContain("ProductFace");
    expect(names).not.toContain("SnapshotFace");
    expect(names).not.toContain("SampleFace");
    expect(names).not.toContain("GeneratedFace");
    expect(names).not.toContain("FixtureFace");

    const graph = await analyzeDependencyGraph(product, tempDir);
    expect(graph.stats.totalFiles).toBe(1);
    expect(graph.stats.orphanFiles).toBe(1);
  });

  it("keeps a caller's other ignore patterns", async () => {
    const scan = await scanRepo(scanConfig({ ignore: ["**/node_modules/**", "**/keep-out/**"] }));
    expect(scan._files).toEqual(["src/app.ts"]);
    expect(scan._files.some((file) => file.includes("keep-out"))).toBe(false);
    expect(scan._files.some((file) => file.includes("samples"))).toBe(false);
  });

  it("scans those trees again when include_dev_artifacts is true", async () => {
    const scan = await scanRepo(scanConfig({ include_dev_artifacts: true }));
    expect(scan.filesCount).toBeGreaterThan(1);
    expect(scan._files).toContain("samples/client.ts");
    expect(scan._files).toContain("tests/__snapshots__/pets.ts");
    expect(scan._files).toContain("tests/generated/pets.ts");
    expect(scan._files).toContain("fixtures/seed.ts");
    expect(scan._files).toContain("examples/demo.ts");
    expect(scan._files).toContain("e2e-fixtures/case.ts");

    const types = await analyzeTypeScript(scan._files, tempDir);
    const names = types.interfaces.map((item) => item.name);
    expect(names).toContain("SnapshotFace");
    expect(names).toContain("SampleFace");

    const graph = await analyzeDependencyGraph(scan._files, tempDir);
    expect(graph.stats.orphanFiles).toBeGreaterThan(1);
  });

  it("still honors scan.ignore when the opt-in flag is set", async () => {
    const scan = await scanRepo(scanConfig({
      include_dev_artifacts: true,
      ignore: ["**/node_modules/**", "**/src/**"],
    }));
    expect(scan._files).toContain("samples/client.ts");
    expect(scan._files).not.toContain("src/app.ts");
  });

  it("accepts the flag in .repolens.yml and rejects a non-boolean", async () => {
    const configPath = path.join(tempDir, ".repolens.yml");
    await fs.writeFile(configPath, `
configVersion: 1
project:
  name: "fixture"
publishers:
  - markdown
scan:
  include:
    - "src/**/*.ts"
  ignore:
    - "node_modules/**"
  include_dev_artifacts: true
module_roots:
  - "src"
outputs:
  pages:
    - key: "system_overview"
      title: "System Overview"
`);
    const cfg = await loadConfig(configPath);
    expect(cfg.scan.include_dev_artifacts).toBe(true);

    await fs.writeFile(configPath, `
configVersion: 1
project:
  name: "fixture"
publishers:
  - markdown
scan:
  include:
    - "src/**/*.ts"
  ignore:
    - "node_modules/**"
  include_dev_artifacts: "yes"
module_roots:
  - "src"
outputs:
  pages:
    - key: "system_overview"
      title: "System Overview"
`);
    await expect(loadConfig(configPath)).rejects.toThrow(/include_dev_artifacts/);
  });
});
