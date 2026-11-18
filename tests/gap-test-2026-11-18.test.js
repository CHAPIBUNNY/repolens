// Weekly gap test 2026-11-18 (local run): spring-projects/spring-petclinic, TanStack/query,
// python-attrs/attrs, jasontaylordev/CleanArchitecture, BurntSushi/ripgrep.
// 1. Java package folders (`org/springframework/samples`, `com/example/demo`) were read as
//    samples/examples/tests: spring-petclinic scanned 0 files and exited 2.
// 2. Next.js `app/` and `pages/` at the repository root were missed, `app/page.tsx` became
//    `/page.tsx`, `export const GET` was UNKNOWN, `(group)` folders stayed in URLs.
// 3. Onboarding always said `npm install` / `npm test # or: npx pytest run`.
// 4. A monorepo root package.json named `root` named the project "root".
// 5. C# `using Microsoft.AspNetCore.Mvc` was labelled as package `Microsoft.AspNetCore.Mvc.Testing`.
// 6. Python 3.14 `annotationlib` was listed as a runtime external package.
// 7. Unsupported-language honesty: system map said "run full publish for import-based
//    analysis"; security page said "no anti-patterns detected" with 0 files scanned.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

vi.mock("../src/ai/provider.js", () => ({
  generateText: vi.fn().mockResolvedValue({ success: false }),
  isAIEnabled: vi.fn().mockReturnValue(false),
}));

import { scanRepo, nextRouteMethods } from "../src/core/scan.js";
import { isDefaultDevArtifact, resolveUserScanIgnore } from "../src/core/scan-defaults.js";
import { isTestPath, isNonProductPath, isDevArtifactPath, isToolingPath } from "../src/utils/path-roles.js";
import { detectRepoLanguages } from "../src/core/languages.js";
import { analyzeDependencyGraph } from "../src/analyzers/dependency-graph.js";
import { buildAIContext } from "../src/analyzers/context-builder.js";
import { generateDeveloperOnboarding } from "../src/ai/generate-sections.js";
import { detectSetupCommands } from "../src/utils/setup-commands.js";
import { detectProjectName } from "../src/utils/project-name.js";
import { csharpExternalName, isCSharpStdlib } from "../src/analyzers/java-csharp.js";
import { isPythonStdlib } from "../src/analyzers/import-parsers.js";
import { renderSecurityHotspots } from "../src/renderers/renderAnalysis.js";
import { renderSystemMap } from "../src/renderers/renderMap.js";

let tempDir;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-1118-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

async function write(rel, content = "") {
  const file = path.join(tempDir, rel);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content);
}

const PC = "src/main/java/org/springframework/samples/petclinic";

describe("1. Java package folders are not sample/test/tooling folders", () => {
  it("keeps package paths and still skips real sample trees and test source sets", () => {
    expect(isDefaultDevArtifact(`${PC}/owner/Owner.java`)).toBe(false);
    expect(isDefaultDevArtifact("src/main/java/com/example/demo/DemoApplication.java")).toBe(false);
    expect(isDefaultDevArtifact("app/src/main/kotlin/com/acme/generated/Api.kt")).toBe(false);
    expect(isDefaultDevArtifact("samples/basic/src/main/java/com/acme/App.java")).toBe(true);
    expect(isDefaultDevArtifact("examples/react/src/App.tsx")).toBe(true);
    expect(isDefaultDevArtifact("src/__snapshots__/a.ts")).toBe(true);
    expect(isDefaultDevArtifact("src/widget.test.ts.snap")).toBe(true);
    expect(isDefaultDevArtifact("lib/example/x.py")).toBe(true);
    // Folder names stay case-sensitive, like the old globs.
    expect(isDefaultDevArtifact("src/Samples/Program.cs")).toBe(false);
  });

  it("path roles ignore package folders but keep the source set", () => {
    expect(isNonProductPath(`${PC}/owner/Owner.java`)).toBe(false);
    expect(isNonProductPath(`${PC}/owner`)).toBe(false);
    expect(isNonProductPath("src/main/java/com/example/demo/DemoApplication.java")).toBe(false);
    expect(isNonProductPath("src/main/java/org/acme/test/TestSupport.java")).toBe(false);
    expect(isToolingPath("src/main/java/com/acme/tools/Cli.java")).toBe(false);
    expect(isDevArtifactPath("src/main/java/com/acme/fixtures/Seed.java")).toBe(false);
    expect(isTestPath(`src/test/java/org/springframework/samples/petclinic/owner/OwnerControllerTests.java`)).toBe(true);
    expect(isTestPath("src/test/java/com/acme/Helper.java")).toBe(true);
    expect(isTestPath("src/integrationTest/java/com/acme/Helper.java")).toBe(true);
    expect(isToolingPath("src/jmh/java/com/acme/Bench.java")).toBe(true);
    expect(isNonProductPath("samples/basic/src/main/java/com/acme/App.java")).toBe(true);
    expect(isNonProductPath("examples/basic/App.java")).toBe(true);
  });

  it("scans a spring-petclinic-like repository (was 0 files)", async () => {
    await write("pom.xml", "<project><artifactId>spring-petclinic</artifactId></project>\n");
    await write(`${PC}/PetClinicApplication.java`, "package org.springframework.samples.petclinic;\nimport org.springframework.samples.petclinic.owner.Owner;\npublic class PetClinicApplication { Owner o; }\n");
    await write(`${PC}/owner/Owner.java`, "package org.springframework.samples.petclinic.owner;\nimport org.springframework.samples.petclinic.model.Person;\npublic class Owner extends Person {}\n");
    await write(`${PC}/model/Person.java`, "package org.springframework.samples.petclinic.model;\npublic class Person {}\n");
    await write("src/test/java/org/springframework/samples/petclinic/owner/OwnerTests.java", "package org.springframework.samples.petclinic.owner;\nclass OwnerTests { Owner o; }\n");
    await write("samples/demo/Demo.java", "class Demo {}\n");
    const detected = await detectRepoLanguages(tempDir);
    const cfg = { __repoRoot: tempDir, scan: { include: detected.include, ignore: [] }, module_roots: detected.moduleRoots };
    const scan = await scanRepo(cfg);
    expect(scan.filesCount).toBe(4);
    const keys = scan.modules.map((m) => m.key);
    expect(keys).toContain(`${PC}/owner`);
    expect(keys).toContain(`${PC}/model`);
    expect(keys.some((k) => k.startsWith("samples"))).toBe(false);
    const files = [`${PC}/PetClinicApplication.java`, `${PC}/owner/Owner.java`, `${PC}/model/Person.java`];
    const graph = await analyzeDependencyGraph(files, tempDir);
    expect(graph.stats.totalEdges).toBe(2);
    expect(graph.stats.sourceFiles).toBe(3);
  });

  it("include_dev_artifacts still scans sample trees; user ignore still applies", async () => {
    await write("samples/demo/demo.py", "x = 1\n");
    await write("src/app.py", "x = 1\n");
    await write("src/skip/me.py", "x = 1\n");
    const base = { __repoRoot: tempDir, module_roots: ["src"] };
    const off = await scanRepo({ ...base, scan: { include: ["**/*.py"], ignore: ["**/skip/**"] } });
    expect(off.filesCount).toBe(1);
    const on = await scanRepo({ ...base, scan: { include: ["**/*.py"], ignore: ["**/skip/**"], include_dev_artifacts: true } });
    expect(on.filesCount).toBe(2);
    expect(resolveUserScanIgnore({ ignore: ["a", 1] })).toEqual(["a"]);
  });
});

describe("2. Next.js routes", () => {
  it("reads every route-handler export form", () => {
    expect(nextRouteMethods("export async function GET() {}")).toEqual(["GET"]);
    expect(nextRouteMethods("export const GET = () => Response.json({})")).toEqual(["GET"]);
    expect(nextRouteMethods("export function POST(req) {}\nexport function DELETE() {}")).toEqual(["POST", "DELETE"]);
    expect(nextRouteMethods("export { handler as GET, handler as POST }")).toEqual(["GET", "POST"]);
    expect(nextRouteMethods("export const { GET, POST } = handlers")).toEqual(["GET", "POST"]);
    expect(nextRouteMethods("export const runtime = 'edge'\nexport const GETTER = 1")).toEqual([]);
  });

  it("finds a root app/ and pages/ and builds real URLs", async () => {
    await write("package.json", JSON.stringify({ name: "web", dependencies: { next: "15.0.0" } }));
    await write("app/page.tsx", "export default function Home() { return null }\n");
    await write("app/count/route.ts", "export const GET = () => Response.json({ count: 1 })\n");
    await write("app/(marketing)/about/page.tsx", "export default function A() { return null }\n");
    await write("app/@modal/login/page.tsx", "export default function L() { return null }\n");
    await write("app/blog/[slug]/page.tsx", "export default function B() { return null }\n");
    await write("pages/api/hello.ts", "export default function handler(req, res) {}\n");
    const scan = await scanRepo({ __repoRoot: tempDir, scan: { include: ["**/*.{ts,tsx}"], ignore: [] }, module_roots: ["app", "pages"] });
    const pages = Object.fromEntries(scan.pages.map((p) => [p.file, p.path]));
    expect(pages["app/page.tsx"]).toBe("/");
    expect(pages["app/(marketing)/about/page.tsx"]).toBe("/about");
    expect(pages["app/@modal/login/page.tsx"]).toBe("/login");
    expect(pages["app/blog/[slug]/page.tsx"]).toBe("/blog/:slug");
    const api = Object.fromEntries(scan.api.map((a) => [a.file, a]));
    expect(api["app/count/route.ts"].path).toBe("/count");
    expect(api["app/count/route.ts"].methods).toEqual(["GET"]);
    expect(api["pages/api/hello.ts"].path).toBe("/api/hello");
  });
});

describe("3. onboarding setup commands follow the build files", () => {
  it("detects each ecosystem", async () => {
    await write("pyproject.toml", "[project]\nname='attrs'\n");
    await write("uv.lock", "");
    expect(detectSetupCommands(tempDir, { testFrameworks: ["pytest"] })).toMatchObject({ install: ["uv sync"], test: ["pytest"] });
    await fs.rm(path.join(tempDir, "uv.lock"));
    expect(detectSetupCommands(tempDir).install).toEqual(["pip install -e ."]);
    await fs.rm(path.join(tempDir, "pyproject.toml"));

    await write("pom.xml", "<project/>");
    await write("mvnw", "");
    await write("build.gradle", "");
    await write("gradlew", "");
    const jvm = detectSetupCommands(tempDir);
    expect(jvm.install).toEqual(["./mvnw package", "./gradlew build"]);
    expect(jvm.test).toEqual(["./mvnw test", "./gradlew test"]);
    expect(jvm.manifests.map((m) => m.file)).toEqual(["pom.xml", "build.gradle"]);
    for (const f of ["pom.xml", "mvnw", "build.gradle", "gradlew"]) await fs.rm(path.join(tempDir, f));

    await write("CleanArchitecture.slnx", "<Solution/>");
    expect(detectSetupCommands(tempDir)).toMatchObject({ install: ["dotnet build"], test: ["dotnet test"], manifests: [{ file: "CleanArchitecture.slnx" }] });
    await fs.rm(path.join(tempDir, "CleanArchitecture.slnx"));

    await write("Cargo.toml", "[workspace]\n");
    expect(detectSetupCommands(tempDir)).toMatchObject({ install: ["cargo build"], test: ["cargo test"] });
    await fs.rm(path.join(tempDir, "Cargo.toml"));

    await write("go.mod", "module example.com/x\n");
    expect(detectSetupCommands(tempDir)).toMatchObject({ install: ["go mod download"], test: ["go test ./..."] });
    await fs.rm(path.join(tempDir, "go.mod"));

    await write("package.json", JSON.stringify({ name: "q", scripts: { test: "vitest" } }));
    await write("pnpm-lock.yaml", "");
    expect(detectSetupCommands(tempDir)).toMatchObject({ install: ["pnpm install"], test: ["pnpm test"] });
  });

  it("a Python repository's onboarding has no npm commands", async () => {
    await write("pyproject.toml", "[project]\nname = \"attrs\"\n[project.optional-dependencies]\ntests = [\"pytest\"]\n");
    await write("src/attr/__init__.py", "from ._make import attrs\n");
    await write("src/attr/_make.py", "def attrs():\n    pass\n");
    await write("tests/test_make.py", "import attr\n");
    const detected = await detectRepoLanguages(tempDir);
    const cfg = { __repoRoot: tempDir, project: { name: "attrs" }, scan: { include: detected.include, ignore: [] }, module_roots: detected.moduleRoots };
    const scan = await scanRepo(cfg);
    const context = buildAIContext(scan, cfg, null);
    const md = await generateDeveloperOnboarding(context, {});
    expect(md).not.toMatch(/npm (install|test)/);
    expect(md).not.toContain("`package.json`");
    expect(md).toContain("pip install -e .");
    expect(md).toContain("| `pyproject.toml` |");
  });
});

describe("4. placeholder package.json names", () => {
  it("skips a monorepo root named `root` and falls back to the folder", async () => {
    const dir = path.join(tempDir, "query");
    await fs.mkdir(dir);
    await fs.writeFile(path.join(dir, "package.json"), JSON.stringify({ name: "root", private: true }));
    expect(detectProjectName(dir)).toBe("query");
    await fs.writeFile(path.join(dir, "package.json"), JSON.stringify({ name: "@tanstack/query" }));
    expect(detectProjectName(dir)).toBe("@tanstack/query");
  });
});

describe("5. C# namespace → package label", () => {
  it("does not attach a framework namespace to a longer package", () => {
    const packages = ["Microsoft.AspNetCore.Mvc.Testing", "Microsoft.AspNetCore.Identity.EntityFrameworkCore", "Microsoft.Extensions.Logging.Abstractions", "xunit.v3"];
    expect(csharpExternalName("Microsoft.AspNetCore.Mvc", packages)).toBe("Microsoft.AspNetCore.Mvc");
    expect(csharpExternalName("Microsoft.AspNetCore.Identity", packages)).toBe("Microsoft.AspNetCore.Identity");
    expect(csharpExternalName("Microsoft.AspNetCore.Mvc.Testing", packages)).toBe("Microsoft.AspNetCore.Mvc.Testing");
    expect(csharpExternalName("Microsoft.Extensions.Logging", packages)).toBe("Microsoft.Extensions.Logging.Abstractions");
    expect(csharpExternalName("Xunit", packages)).toBe("xunit.v3");
  });

  it("keeps base-library namespaces as stdlib next to longer polyfill packages", () => {
    expect(isCSharpStdlib("System.Threading", ["System.Threading.Tasks.Extensions"])).toBe(true);
    expect(isCSharpStdlib("System.Threading.Tasks", ["System.Threading.Tasks.Extensions"])).toBe(true);
    expect(isCSharpStdlib("System.Threading.RateLimiting", ["System.Threading.RateLimiting"])).toBe(false);
    expect(csharpExternalName("Flurl.Http", ["Flurl.Http.Signed"])).toBe("Flurl.Http.Signed");
    expect(csharpExternalName("Microsoft.Extensions.Diagnostics.HealthChecks", ["Microsoft.Extensions.Diagnostics.HealthChecks.EntityFrameworkCore"]))
      .toBe("Microsoft.Extensions.Diagnostics.HealthChecks");
  });
});

describe("6. Python 3.14 standard library", () => {
  it("knows annotationlib and compression", () => {
    expect(isPythonStdlib("annotationlib")).toBe(true);
    expect(isPythonStdlib("compression")).toBe(true);
    expect(isPythonStdlib("hypothesis")).toBe(false);
  });
});

describe("7. honest pages when a language is not analyzed", () => {
  it("security page says nothing was scanned when there are no JS/TS files", () => {
    const md = renderSecurityHotspots({ detected: false, filesScanned: 0 });
    expect(md).toContain("Not scanned");
    expect(md).not.toContain("No security anti-patterns were detected");
    expect(renderSecurityHotspots({ detected: false, filesScanned: 37 })).toContain("in the 37 scanned JavaScript/TypeScript source files");
  });

  it("system map no longer tells unsupported repositories to run publish", () => {
    const scan = { modules: [{ key: "crates/core", fileCount: 20 }, { key: "crates/cli", fileCount: 8 }] };
    const coverage = { status: "unsupported", unanalyzedLanguages: [{ label: "Rust", files: 80 }], analyzedFiles: 0, productBased: true };
    const md = renderSystemMap(scan, {}, { nodes: [], edges: [], coverage });
    expect(md).not.toContain("run full publish");
    expect(md).toContain("Rust (80 product files)");
    const none = renderSystemMap(scan, {}, { nodes: [], edges: [] });
    expect(none).toContain("No import edges were found between modules");
  });
});
