import fg from "fast-glob";
import fs from "node:fs/promises";
import path from "node:path";
import { info, warn } from "../utils/logger.js";
import { trackScan } from "../utils/telemetry.js";
import { detectMonorepo } from "../analyzers/monorepo-detector.js";
import { isInsideRoot } from "../utils/safe-path.js";
import { isDevArtifactPath, isNonProductPath, isTestPath, isToolingPath } from "../utils/path-roles.js";
import { isDefaultDevArtifact, resolveUserScanIgnore } from "./scan-defaults.js";
import { buildJvmModuleKeyer } from "./jvm-modules.js";
import { goModuleDir, goPackageName, lspEvidenceIn } from "./go-modules.js";
import { replaceBracketParams } from "../utils/route-params.js";
import { detectSetupCommands } from "../utils/setup-commands.js";
import { detectScriptFixtureDirs, fixtureDirOf } from "../utils/fixture-dirs.js";
import { detectProjectName } from "../utils/project-name.js";
import { detectGitHubAction } from "../utils/github-action-detect.js";

const norm = (p) => p.replace(/\\/g, "/");

// Performance guardrails
const MAX_FILES_WARNING = 10000;
const MAX_FILES_LIMIT = 50000;

// Leading `/` so a Next.js `app/` or `pages/` folder at the repository root matches
// the same `/app/` and `/pages/` tests as `src/app/` (a root `app/page.tsx` was missed).
const rooted = (file) => `/${norm(file).replace(/^\/+/, "")}`;

function isNextRoute(file) {
  const f = rooted(file);
  return (
    f.includes("/pages/api/") ||
    (f.includes("/app/") && (f.endsWith("/route.ts") || f.endsWith("/route.js")))
  );
}

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
const HTTP_METHOD_SET = new Set(HTTP_METHODS);

/**
 * HTTP methods a Next.js route handler exports: `export async function GET`,
 * `export function POST`, `export const GET = ...`, `export { handler as GET }`, and
 * `export const { GET, POST } = handlers`. Only `export async function` was read before,
 * so `export const GET = () => ...` showed as UNKNOWN.
 */
export function nextRouteMethods(content) {
  const text = String(content || "");
  const found = new Set();
  const declared = /\bexport\s+(?:async\s+)?(?:function|const|let|var)\s+([A-Z]+)\b/g;
  let match;
  while ((match = declared.exec(text)) !== null) {
    if (HTTP_METHOD_SET.has(match[1])) found.add(match[1]);
  }
  // `export { a as GET, POST }` and `export const { GET, POST } = handlers`.
  const listed = /\bexport\s+(?:const\s+)?\{([^{}]*)\}/g;
  while ((match = listed.exec(text)) !== null) {
    for (const part of match[1].split(",")) {
      const words = part.trim().split(/\s+/);
      const name = words[words.length - 1].replace(/:.*$/, "");
      const alias = part.includes(":") ? part.split(":").pop().trim() : name;
      if (HTTP_METHOD_SET.has(name)) found.add(name);
      else if (HTTP_METHOD_SET.has(alias)) found.add(alias);
    }
  }
  return HTTP_METHODS.filter((method) => found.has(method));
}

function isExpressRoute(content) {
  // Detect Express.js route patterns
  const expressPatterns = [
    /(?:app|router)\.(get|post|put|patch|delete|all)\s*\(\s*['"`]([^'"`]+)['"`]/gi,
    /(?:app|router)\.route\s*\(\s*['"`]([^'"`]+)['"`]/gi
  ];
  return expressPatterns.some(pattern => pattern.test(content));
}

function isReactRouterFile(content) {
  // Detect React Router patterns — require import evidence, not just string mentions
  const hasImport = /import\s+.*?from\s+['"]react-router/.test(content)
    || /require\s*\(\s*['"]react-router/.test(content);
  const hasJSX = /<Route\s/.test(content);
  const hasFactory = /createBrowserRouter\s*\(/.test(content)
    || /createRoutesFromElements\s*\(/.test(content);
  return hasImport || hasJSX || hasFactory;
}

function isVueRouterFile(content) {
  // Detect Vue Router patterns — require import evidence, not just string mentions
  const hasImport = /import\s+.*?from\s+['"]vue-router/.test(content)
    || /require\s*\(\s*['"]vue-router/.test(content);
  const hasConstructor = /new\s+VueRouter\s*\(/.test(content);
  const hasFactory = /createRouter\s*\(/.test(content) && hasImport;
  return hasImport || hasConstructor || hasFactory;
}

/** Sphinx `docs/conf.py` (or `doc/`, `documentation/`, `sphinx/`). Not a product module. */
function isSphinxConfFile(file) {
  const normalized = norm(file);
  const parts = normalized.split("/");
  const base = parts.pop() || "";
  if (base !== "conf.py" && base !== "conf.py.in") return false;
  return parts.some((segment) => /^(docs?|documentation|sphinx)$/i.test(segment));
}

/**
 * Directories that are a documentation website (Docusaurus `website/`, a VitePress
 * app, `docs-site/`), not the product. The repository root itself is never one:
 * a config at the root must not hide `src/`.
 */
async function findDocsSiteRoots(repoRoot) {
  const roots = new Set();
  let found = [];
  try {
    found = await fg([
      "**/docusaurus.config.{js,ts,mjs,cjs}",
      "**/.vitepress/config.{js,ts,mjs,mts}",
    ], {
      cwd: repoRoot,
      deep: 5,
      onlyFiles: true,
      followSymbolicLinks: false,
      ignore: ["**/node_modules/**", "**/dist/**", "**/.git/**"],
    });
  } catch {
    return [];
  }
  for (const file of found) {
    const normalized = norm(file);
    const vite = normalized.indexOf("/.vitepress/");
    const folder = vite !== -1
      ? normalized.slice(0, vite)
      : path.posix.dirname(normalized);
    if (!folder || folder === ".") continue;
    roots.add(folder);
  }
  return [...roots].sort();
}

function isUnderDir(file, root) {
  return file === root || file.startsWith(`${root}/`);
}

function isNextPage(file) {
  const f = rooted(file);

  if (f.includes("/app/")) {
    return (
      f.endsWith("/page.tsx") ||
      f.endsWith("/page.jsx") ||
      f.endsWith("/page.ts") ||
      f.endsWith("/page.js")
    );
  }

  if (f.includes("/pages/") && !f.includes("/pages/api/")) {
    return (
      f.endsWith(".tsx") ||
      f.endsWith(".jsx") ||
      f.endsWith(".ts") ||
      f.endsWith(".js")
    );
  }

  return false;
}

const MAX_SOURCE_BYTES = 1_000_000;

async function readFileSafe(file) {
  try {
    const stat = await fs.stat(file);
    if (!stat.isFile() || stat.size > MAX_SOURCE_BYTES) return "";
    const fh = await fs.open(file, "r");
    try {
      const sample = Buffer.alloc(Math.min(8192, stat.size));
      await fh.read(sample, 0, sample.length, 0);
      if (sample.includes(0)) return "";
    } finally {
      await fh.close();
    }
    return await fs.readFile(file, "utf8");
  } catch {
    return "";
  }
}

// Files at the repository root form one module named for the project (package.json,
// Gradle, git remote, Maven, .sln, then folder), not the checkout folder: a scan of a copy
// in `/tmp/trscan` showed a `trscan` module for dorny/test-reporter. A name that is also a
// top-level folder, or one with path characters, falls back to "root".
function rootModuleLabel(repoRoot, files = []) {
  const resolved = path.resolve(repoRoot || ".");
  const detected = String(detectProjectName(resolved, "root")).split("/").pop() || "";
  const label = /^[A-Za-z0-9._-]+$/.test(detected) && detected !== "." && detected !== ".." ? detected : "root";
  const topDirs = new Set(files.map((file) => norm(file)).filter((file) => file.includes("/")).map((file) => file.split("/")[0]));
  return topDirs.has(label) ? "root" : label;
}

function moduleKeyForFile(file, moduleRoots, rootLabel = "root") {
  const normalized = norm(file);

  const sortedRoots = [...moduleRoots].sort((a, b) => b.length - a.length);

  for (const root of sortedRoots) {
    if (normalized === root) return root;
    if (normalized.startsWith(`${root}/`)) {
      const remainder = normalized.slice(root.length + 1);
      // A file directly under the root belongs to the root itself. Only a sub-directory
      // is its own module, so a flat `src/` is one module and not one module per file.
      if (!remainder.includes("/")) return root;
      const nextSegment = remainder.split("/")[0];
      return nextSegment ? `${root}/${nextSegment}` : root;
    }
  }

  const parts = normalized.split("/");
  // A file next to go.mod or package.json is one module, named for the directory.
  // Calling it "root" hid that package on the system map.
  return parts.length > 1 ? parts[0] : rootLabel;
}

// App Router URL segments: `(group)` folders and `@slot` parallel routes are not in the URL.
function appRouterUrlSegments(relative) {
  return relative.split("/").filter((segment) => segment
    && !(segment.startsWith("(") && segment.endsWith(")"))
    && !segment.startsWith("@"));
}

function routePathFromFile(file) {
  const f = rooted(file);

  if (f.includes("/app/")) {
    const appIndex = f.indexOf("/app/");
    // `/page.tsx` for `app/page.tsx`, so the file-name strip below also matches at the app root.
    const relative = f.slice(appIndex + 4)
      .replace(/\/(page|route)\.(ts|tsx|js|jsx)$/, "");
    const cleaned = replaceBracketParams(appRouterUrlSegments(relative).join("/"));
    return cleaned ? `/${cleaned}` : "/";
  }

  if (f.includes("/pages/api/")) {
    const apiIndex = f.indexOf("/pages/api/");
    const relative = f.slice(apiIndex + 11);

    return "/api/" + relative.replace(/\.(ts|tsx|js|jsx)$/, "");
  }

  if (f.includes("/pages/")) {
    const pagesIndex = f.indexOf("/pages/");
    const relative = f.slice(pagesIndex + 7);

    const cleaned = replaceBracketParams(relative
      .replace(/\.(ts|tsx|js|jsx)$/, "")
      .replace(/\/index$/, ""))
      .replace(/\/$/, "");

    return cleaned ? `/${cleaned}` : "/";
  }

  return file;
}

/**
 * Source files a package.json names as its public entry: `main`, `module`, `types`, and every
 * string under `exports`. Paths are repo-relative with no leading `./`.
 */
function packageEntryFiles(pkg) {
  const found = new Set();
  const add = (value) => {
    if (typeof value !== "string" || !/\.(c|m)?[jt]sx?$/.test(value) || value.endsWith(".d.ts")) return;
    found.add(value.replace(/^\.\//, ""));
  };
  const walk = (value) => {
    if (typeof value === "string") add(value);
    else if (value && typeof value === "object") Object.values(value).forEach(walk);
  };
  add(pkg.main);
  add(pkg.module);
  walk(pkg.exports);
  return [...found];
}

/**
 * Detect languages from file extensions
 */
function detectLanguagesFromFiles(files) {
  const languages = new Set();
  const counts = new Map();
  
  // Extension to language mapping
  const extensionMap = {
    // JavaScript/TypeScript
    ".js": "JavaScript",
    ".mjs": "JavaScript",
    ".cjs": "JavaScript",
    ".jsx": "JavaScript",
    ".ts": "TypeScript",
    ".tsx": "TypeScript",
    // Python
    ".py": "Python",
    ".pyw": "Python",
    ".pyi": "Python",
    // Go
    ".go": "Go",
    // Rust
    ".rs": "Rust",
    // Java
    ".java": "Java",
    // C/C++
    ".c": "C",
    ".h": "C",
    ".cpp": "C++",
    ".hpp": "C++",
    ".cc": "C++",
    ".cxx": "C++",
    // C#
    ".cs": "C#",
    // Ruby
    ".rb": "Ruby",
    // PHP
    ".php": "PHP",
    // Swift
    ".swift": "Swift",
    // Kotlin
    ".kt": "Kotlin",
    ".kts": "Kotlin",
    // Scala
    ".scala": "Scala",
    // Shell
    ".sh": "Shell",
    ".bash": "Shell",
    ".zsh": "Shell",
    // SQL
    ".sql": "SQL",
  };

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    if (!extensionMap[ext]) continue;
    // Type declarations (`index.d.ts`) and type tests describe a JavaScript library's
    // types. They do not make the library a TypeScript project.
    if (ext === ".ts" && /\.d\.ts$/i.test(file)) continue;
    if (extensionMap[ext] === "TypeScript" && isTestPath(file)) continue;
    const label = extensionMap[ext];
    counts.set(label, (counts.get(label) || 0) + 1);
  }

  // Most files first, so a C# repository with one docs script reads "C#, JavaScript".
  for (const [label] of [...counts.entries()].sort((a, b) => b[1] - a[1])) languages.add(label);
  return languages;
}

// Maven, Gradle, and .NET project files: build tool and test framework. Without this a
// Java or C# repository with JUnit or xUnit tests read as "no test framework".
const JVM_DOTNET_BUILD_GLOBS = [
  "pom.xml", "*/pom.xml", "*/*/pom.xml",
  "build.gradle", "build.gradle.kts", "*/build.gradle", "*/build.gradle.kts", "*/*/build.gradle", "*/*/build.gradle.kts",
  "gradle/libs.versions.toml",
  "**/*.csproj", "**/Directory.Packages.props", "**/Directory.Build.props",
];

const JVM_DOTNET_TEST_FRAMEWORKS = [
  [/\bjunit-jupiter|org\.junit\.jupiter|junit-bom/i, "JUnit 5"],
  [/<artifactId>\s*junit\s*<\/artifactId>|["']junit:junit|\bjunit\s*=|libs\.junit\b/i, "JUnit"],
  [/\btestng\b/i, "TestNG"],
  [/\bspock-core\b/i, "Spock"],
  [/Include="xunit(\.v3)?(\.core)?"|Include="xunit"/i, "xUnit"],
  [/Include="NUnit"/i, "NUnit"],
  [/Include="MSTest(\.TestFramework)?"/i, "MSTest"],
];

export async function detectJvmDotnetTooling(repoRoot, metadata, { skip = null } = {}) {
  let buildFiles = [];
  try {
    buildFiles = await fg(JVM_DOTNET_BUILD_GLOBS, {
      cwd: repoRoot,
      deep: 5,
      onlyFiles: true,
      followSymbolicLinks: false,
      ignore: ["**/node_modules/**", "**/obj/**", "**/bin/**", "**/target/**", "**/build/**", "**/.git/**"],
    });
  } catch {
    return;
  }
  buildFiles.sort();
  if (skip) buildFiles = buildFiles.filter((file) => !skip(file));
  for (const file of buildFiles.slice(0, 80)) {
    const base = path.posix.basename(file);
    if (base === "pom.xml") metadata.buildTools.push("Maven");
    else if (base.startsWith("build.gradle") || base === "libs.versions.toml") metadata.buildTools.push("Gradle");
    else if (base.endsWith(".csproj")) metadata.buildTools.push("MSBuild (.NET)");
    let content = "";
    try {
      content = await fs.readFile(path.join(repoRoot, file), "utf8");
    } catch {
      continue;
    }
    for (const [pattern, name] of JVM_DOTNET_TEST_FRAMEWORKS) {
      if (pattern.test(content)) metadata.testFrameworks.push(name);
    }
  }
}

async function extractRepoMetadata(repoRoot, files = []) {
  const metadata = {
    hasPackageJson: false,
    frameworks: [],
    languages: new Set(),
    buildTools: [],
    testFrameworks: []
  };

  // Try to read package.json
  try {
    const pkgPath = path.join(repoRoot, "package.json");
    const pkgContent = await fs.readFile(pkgPath, "utf8");
    const pkg = JSON.parse(pkgContent);
    metadata.hasPackageJson = true;

    const allDeps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
      ...pkg.optionalDependencies
    };

    // Detect frameworks
    if (allDeps["next"]) metadata.frameworks.push("Next.js");
    if (allDeps["react"]) metadata.frameworks.push("React");
    if (allDeps["vue"]) metadata.frameworks.push("Vue");
    if (allDeps["angular"] || allDeps["@angular/core"]) metadata.frameworks.push("Angular");
    if (allDeps["express"]) metadata.frameworks.push("Express");
    if (allDeps["fastify"]) metadata.frameworks.push("Fastify");
    if (allDeps["nestjs"] || allDeps["@nestjs/core"]) metadata.frameworks.push("NestJS");
    if (allDeps["svelte"]) metadata.frameworks.push("Svelte");
    if (allDeps["solid-js"]) metadata.frameworks.push("Solid");
    if (allDeps["hono"]) metadata.frameworks.push("Hono");
    if (allDeps["koa"]) metadata.frameworks.push("Koa");
    if (allDeps["hapi"] || allDeps["@hapi/hapi"]) metadata.frameworks.push("Hapi");
    if (allDeps["electron"]) metadata.frameworks.push("Electron");

    // Detect test frameworks
    if (allDeps["vitest"]) metadata.testFrameworks.push("Vitest");
    if (allDeps["jest"]) metadata.testFrameworks.push("Jest");
    if (allDeps["mocha"]) metadata.testFrameworks.push("Mocha");
    if (allDeps["playwright"]) metadata.testFrameworks.push("Playwright");
    if (allDeps["cypress"]) metadata.testFrameworks.push("Cypress");
    if (allDeps["ava"]) metadata.testFrameworks.push("Ava");

    // Detect build tools
    if (allDeps["vite"]) metadata.buildTools.push("Vite");
    if (allDeps["webpack"]) metadata.buildTools.push("Webpack");
    if (allDeps["rollup"]) metadata.buildTools.push("Rollup");
    if (allDeps["esbuild"]) metadata.buildTools.push("esbuild");
    if (allDeps["turbo"]) metadata.buildTools.push("Turborepo");
    if (allDeps["tsup"]) metadata.buildTools.push("tsup");
    if (allDeps["swc"] || allDeps["@swc/core"]) metadata.buildTools.push("SWC");
    if (allDeps["parcel"]) metadata.buildTools.push("Parcel");

    // Detect TypeScript from dependencies (supplements file detection)
    // A `typescript` devDependency alone does not make the source TypeScript: plain JavaScript
    // libraries use it to check their `.d.ts` files. Trust it only when no files were scanned.
    if (allDeps["typescript"] && files.length === 0) metadata.languages.add("TypeScript");

    // Detect Node.js runtime indicators
    const hasNodeEngines = pkg.engines && pkg.engines.node;
    const hasBin = pkg.bin != null;
    const hasNodeDeps = allDeps["node-fetch"] || allDeps["fs-extra"] || allDeps["dotenv"]
      || allDeps["commander"] || allDeps["yargs"] || allDeps["chalk"]
      || allDeps["inquirer"] || allDeps["ora"] || allDeps["execa"];
    if (hasNodeEngines || hasBin || hasNodeDeps || pkg.type === "module") {
      metadata.languages.add("Node.js");
    }

    // A package with a library entry point (main, module, exports, types) is a library even
    // when it also ships a `bin/` helper. Only a package with a bin and no library entry is a CLI.
    // When it has both, the description decides: "Library that parses..." is a library,
    // while a package that calls itself a CLI keeps that label.
    const hasLibraryEntry = Boolean(pkg.main || pkg.module || pkg.exports || pkg.types || pkg.typings || pkg.browser);
    const isShippedApp = Boolean(allDeps["electron"] || allDeps["next"]);
    metadata.packageEntryFiles = packageEntryFiles(pkg);
    metadata.publishedPackage = pkg.private !== true && Boolean(hasLibraryEntry || hasBin);
    const description = String(pkg.description || "");
    const keywords = Array.isArray(pkg.keywords) ? pkg.keywords.join(" ") : "";
    const saysLibrary = /\b(library|sdk|parser|toolkit|framework)\b/i.test(`${description} ${keywords}`);
    const saysCli = /\bcli\b|command[- ]line/i.test(`${description} ${keywords}`);
    // Express 5 publishes index.js with no `main` field. A description that says
    // library or framework is enough; Node's default entry is that index.js.
    if ((hasLibraryEntry || saysLibrary) && !isShippedApp) {
      metadata.projectKind = hasBin && !saysLibrary && saysCli ? "cli" : "library";
    } else if (hasBin && !hasLibraryEntry) {
      metadata.projectKind = "cli";
    }
  } catch {
    // No package.json or invalid JSON
  }

  // A GitHub Action (root action.yml with runs.using node*/composite/docker) is used from
  // workflows, not imported. A published npm package with a composite or Docker action
  // (a CLI that also ships an action) keeps its package kind.
  const action = detectGitHubAction(repoRoot);
  if (action) {
    metadata.githubAction = action;
    if (!metadata.publishedPackage || action.using.startsWith("node")) metadata.projectKind = "action";
  }

  // Detect Python frameworks and tools
  try {
    // Check for pyproject.toml (modern Python)
    const pyprojectPath = path.join(repoRoot, "pyproject.toml");
    const pyprojectContent = await fs.readFile(pyprojectPath, "utf8");
    metadata.languages.add("Python");
    
    // Detect Python frameworks from pyproject.toml
    if (/django/i.test(pyprojectContent)) metadata.frameworks.push("Django");
    if (/fastapi/i.test(pyprojectContent)) metadata.frameworks.push("FastAPI");
    if (/flask/i.test(pyprojectContent)) metadata.frameworks.push("Flask");
    if (/pytest/i.test(pyprojectContent)) metadata.testFrameworks.push("pytest");
    if (/poetry/i.test(pyprojectContent)) metadata.buildTools.push("Poetry");
  } catch {
    // No pyproject.toml
  }

  try {
    // Check for requirements.txt
    const reqPath = path.join(repoRoot, "requirements.txt");
    const reqContent = await fs.readFile(reqPath, "utf8");
    metadata.languages.add("Python");
    
    if (/django/i.test(reqContent)) metadata.frameworks.push("Django");
    if (/fastapi/i.test(reqContent)) metadata.frameworks.push("FastAPI");
    if (/flask/i.test(reqContent)) metadata.frameworks.push("Flask");
    if (/pytest/i.test(reqContent)) metadata.testFrameworks.push("pytest");
  } catch {
    // No requirements.txt
  }

  try {
    // Check for setup.py (legacy Python)
    await fs.access(path.join(repoRoot, "setup.py"));
    metadata.languages.add("Python");
  } catch {
    // No setup.py
  }

  // Detect Go modules
  try {
    const goModPath = path.join(repoRoot, "go.mod");
    const goModContent = await fs.readFile(goModPath, "utf8");
    metadata.languages.add("Go");
    
    if (/gin-gonic/i.test(goModContent)) metadata.frameworks.push("Gin");
    if (/echo/i.test(goModContent)) metadata.frameworks.push("Echo");
    if (/fiber/i.test(goModContent)) metadata.frameworks.push("Fiber");
  } catch {
    // No go.mod
  }

  // Detect Rust via Cargo.toml
  try {
    const cargoPath = path.join(repoRoot, "Cargo.toml");
    const cargoContent = await fs.readFile(cargoPath, "utf8");
    metadata.languages.add("Rust");
    
    if (/actix/i.test(cargoContent)) metadata.frameworks.push("Actix");
    if (/rocket/i.test(cargoContent)) metadata.frameworks.push("Rocket");
    if (/tokio/i.test(cargoContent)) metadata.frameworks.push("Tokio");
  } catch {
    // No Cargo.toml
  }

  // Test fixtures, samples, examples, docs, and fixture projects built by `*-fixture`
  // npm scripts do not define the tech stack (dorny/test-reporter's `reports/` sample
  // projects listed C#, Go, and MSBuild).
  const fixtureDirs = detectScriptFixtureDirs(repoRoot);
  const isFixtureOrSample = (file) => Boolean(fixtureDirOf(file, fixtureDirs)) || isToolingPath(file);
  await detectJvmDotnetTooling(repoRoot, metadata, { skip: isFixtureOrSample });

  // Merge languages detected from file extensions (product files; all files when there are none)
  const productFiles = files.filter((file) => !isNonProductPath(file) && !fixtureDirOf(file, fixtureDirs));
  const fileLanguages = detectLanguagesFromFiles(productFiles.length > 0 ? productFiles : files);
  const manifestLanguages = [...metadata.languages];
  metadata.languages = new Set([...fileLanguages, ...manifestLanguages]);

  // De-duplicate frameworks (in case detected from multiple sources)
  // Go: a product `package main` is a program. With none, the module is a library.
  // A tutorial or example named `commands` is not that program. An `lsp` package,
  // glsp import, or `lsp` command is a second interface next to the CLI or library.
  const productGo = files.filter((file) => goModuleDir(file) !== null
    && !isNonProductPath(file)
    && !isDevArtifactPath(file)
    && !fixtureDirOf(file, fixtureDirs));
  if (metadata.languages.has("Go") || productGo.length > 0) {
    const mains = [];
    const lsp = [];
    for (const file of productGo) {
      let text = "";
      try {
        text = await fs.readFile(path.join(repoRoot, file), "utf8");
      } catch {
        text = "";
      }
      if (goPackageName(text) === "main") mains.push(file);
      lsp.push(...lspEvidenceIn(file, text));
    }
    metadata.goMainFiles = mains.sort();
    // package.json already decided library vs CLI. Otherwise a real `package main`
    // is a program, and a module with none is a library.
    if (!metadata.projectKind) metadata.projectKind = mains.length > 0 ? "cli" : "library";
    metadata.lsp = lsp.length > 0 ? { evidence: [...new Set(lsp)].sort().slice(0, 4) } : null;
  } else {
    metadata.goMainFiles = [];
    metadata.lsp = null;
  }

  metadata.setup = detectSetupCommands(repoRoot, metadata);
  for (const tool of metadata.setup.buildTools || []) metadata.buildTools.push(tool);
  for (const framework of metadata.setup.extraTestFrameworks || []) metadata.testFrameworks.push(framework);

  metadata.frameworks = [...new Set(metadata.frameworks)];
  metadata.testFrameworks = [...new Set(metadata.testFrameworks)];
  metadata.buildTools = [...new Set(metadata.buildTools)];

  return metadata;
}

function isCommentLine(line) {
  const trimmed = String(line || "").trim();
  return trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*");
}

function lineAt(content, index) {
  const start = content.lastIndexOf("\n", Math.max(0, index - 1)) + 1;
  const end = content.indexOf("\n", index);
  return content.slice(start, end === -1 ? content.length : end);
}

/** Express route paths start with `/`. `app.get('query parser fn')` is a setting. */
function isExpressPath(routePath) {
  return typeof routePath === "string"
    && routePath.length > 0
    && routePath.length <= 200
    && (routePath.startsWith("/") || routePath === "*");
}

function extractExpressRoutes(content) {
  const routes = [];
  const seenRoutes = new Set();

  // Match app.METHOD(path) or router.METHOD(path). Skip comments and setting lookups.
  const methodPattern = /(?:app|router)\.(get|post|put|patch|delete|all)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
  let match;

  while ((match = methodPattern.exec(content)) !== null) {
    if (isCommentLine(lineAt(content, match.index))) continue;
    const [, method, path] = match;
    if (!isExpressPath(path)) continue;
    const routeKey = `${method.toUpperCase()}:${path}`;
    
    if (!seenRoutes.has(routeKey)) {
      seenRoutes.add(routeKey);
      
     const existing = routes.find(r => r.path === path);
      if (existing) {
        if (!existing.methods.includes(method.toUpperCase())) {
          existing.methods.push(method.toUpperCase());
}
      } else {
        routes.push({
          path,
          methods: [method.toUpperCase()]
        });
      }
    }
  }

  // Match app.route(path).METHOD()
  const routePattern = /(?:app|router)\.route\s*\(\s*['"`]([^'"`]+)['"`]\s*\)([.\s\w()]*)/gi;
  while ((match = routePattern.exec(content)) !== null) {
    if (isCommentLine(lineAt(content, match.index))) continue;
    const [, path, chain] = match;
    if (!isExpressPath(path)) continue;
    const methods = [];
    
    if (chain.includes(".get(")) methods.push("GET");
    if (chain.includes(".post(")) methods.push("POST");
    if (chain.includes(".put(")) methods.push("PUT");
    if (chain.includes(".patch(")) methods.push("PATCH");
    if (chain.includes(".delete(")) methods.push("DELETE");
    
    if (methods.length > 0) {
      const existing = routes.find(r => r.path === path);
      if (existing) {
        methods.forEach(m => {
          if (!existing.methods.includes(m)) existing.methods.push(m);
        });
      } else {
        routes.push({ path, methods });
      }
    }
  }

  return routes;
}

function extractReactRoutes(content, file) {
  const routes = [];
  const lines = content.split("\n");
  
  // Match <Route path="..." />
  const routePattern = /<Route\s+[^>]*path\s*=\s*['"`]([^'"`]+)['"`][^>]*\/?>/gi;
  let match;

  while ((match = routePattern.exec(content)) !== null) {
    const [, routePath] = match;
    if (isValidRoutePath(routePath)) {
      routes.push({ file, path: routePath, framework: "React Router" });
    }
  }

  // Match path: "..." in route objects (skip comment lines)
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) continue;
    const objectMatch = /path\s*:\s*['"`]([^'"`]+)['"`]/i.exec(trimmed);
    if (objectMatch) {
      const routePath = objectMatch[1];
      if (isValidRoutePath(routePath) && !routes.some(r => r.path === routePath)) {
        routes.push({ file, path: routePath, framework: "React Router" });
      }
    }
  }

  return routes;
}

function extractVueRoutes(content, file) {
  const routes = [];
  const lines = content.split("\n");

  // Match path: '...' or path: "..." in Vue router definitions (skip comment lines)
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) continue;
    const match = /path\s*:\s*['"`]([^'"`]+)['"`]/i.exec(trimmed);
    if (match) {
      const routePath = match[1];
      if (isValidRoutePath(routePath) && !routes.some(r => r.path === routePath)) {
        routes.push({ file, path: routePath, framework: "Vue Router" });
      }
    }
  }

  return routes;
}

function isValidRoutePath(p) {
  // Filter out placeholder/documentation strings and non-path values
  if (!p || p === "..." || p === "*" || p.length > 200) return false;
  // Must look like a URL path (starts with / or is a relative segment)
  return p.startsWith("/") || /^[a-zA-Z0-9]/.test(p);
}

export async function listMatchedFiles(cfg) {
  const repoRoot = cfg.__repoRoot;
  const rootResolved = path.resolve(repoRoot);
  // The default dev-artifact list (samples/, examples/, fixtures/, ...) is applied here,
  // not as globs: a glob cannot tell `samples/` from the Java package folder
  // `org/springframework/samples/` (spring-petclinic scanned 0 files).
  const files = await fg(cfg.scan.include, {
    cwd: rootResolved,
    ignore: resolveUserScanIgnore(cfg.scan),
    onlyFiles: true,
    followSymbolicLinks: false,
    absolute: false
  });
  const keepDevArtifacts = cfg.scan?.include_dev_artifacts === true;
  return files.filter((file) => (keepDevArtifacts || !isDefaultDevArtifact(file))
    && isInsideRoot(rootResolved, path.resolve(rootResolved, file)));
}

export async function scanRepo(cfg) {
  const repoRoot = cfg.__repoRoot;
  const files = await listMatchedFiles(cfg);

  if (files.length === 0) {
    warn("No files matched the scan patterns. Check scan.include in .repolens.yml.");
  }

  // Performance guardrails
  if (files.length > MAX_FILES_LIMIT) {
    throw new Error(
      `Repository too large: ${files.length} files matched scan patterns. ` +
      `Maximum supported: ${MAX_FILES_LIMIT}. Consider refining scan.include patterns.`
    );
  }

  if (files.length > MAX_FILES_WARNING) {
    warn(`Large repository detected: ${files.length} files. Scan may take longer than usual.`);
  }

  const moduleCounts = new Map();
  const moduleTestCounts = new Map();
  const moduleGoCounts = new Map();
  const filesByModule = new Map();
  const flatKeys = new Set();
  // Fixture scripts per module; a module is a fixture project only when every one of its
  // files sits in a dir an npm `*-fixture` script builds.
  const moduleFixtureScripts = new Map();
  const nonFixtureModules = new Set();
  const rootLabel = rootModuleLabel(repoRoot, files);
  const fixtureDirs = detectScriptFixtureDirs(repoRoot);
  const jvmModuleKey = buildJvmModuleKeyer(files, cfg.module_roots || []);

  for (const file of files) {
    // Go test files belong to the package they exercise. Counting each
    // *_test.go as its own module (the filename under module_roots) splits
    // one package into a source module and a test module.
    if (/_test\.go$/.test(norm(file))) continue;
    // A Go module is the package directory. `internal/adapter/sqlite` is not
    // the same module as `internal/adapter/lsp`, even when module_roots stops
    // one folder down.
    const goDir = goModuleDir(file);
    const key = goDir !== null
      ? (goDir || rootLabel)
      : (jvmModuleKey(file) || moduleKeyForFile(file, cfg.module_roots || [], rootLabel));
    if (!norm(file).includes("/")) flatKeys.add(key);
    moduleCounts.set(key, (moduleCounts.get(key) || 0) + 1);
    if (goDir !== null) moduleGoCounts.set(key, (moduleGoCounts.get(key) || 0) + 1);
    if (!filesByModule.has(key)) filesByModule.set(key, []);
    filesByModule.get(key).push(file);
    if (isTestPath(file)) moduleTestCounts.set(key, (moduleTestCounts.get(key) || 0) + 1);
    const fixture = fixtureDirOf(norm(file), fixtureDirs);
    if (!fixture) nonFixtureModules.add(key);
    else if (!moduleFixtureScripts.has(key)) moduleFixtureScripts.set(key, new Set([fixture.script]));
    else moduleFixtureScripts.get(key).add(fixture.script);
  }

  // One Sphinx conf (`docs/conf.py`) is not a Documentation module when the
  // repository already has product source.
  const hasProductSource = [...filesByModule.values()].some((list) => list.some((file) =>
    !isSphinxConfFile(file) && !isTestPath(file) && !isToolingPath(file) && !isDevArtifactPath(file)));
  if (hasProductSource) {
    for (const [key, list] of filesByModule) {
      if (list.length > 0 && list.every(isSphinxConfFile)) {
        moduleCounts.delete(key);
        moduleTestCounts.delete(key);
        moduleGoCounts.delete(key);
        flatKeys.delete(key);
        filesByModule.delete(key);
      }
    }
  }

  const fixtureOf = (key) => (nonFixtureModules.has(key) || !moduleFixtureScripts.has(key)
    ? null
    : [...moduleFixtureScripts.get(key)].sort().join(", "));

  const docsRoots = await findDocsSiteRoots(repoRoot);
  const underDocsSite = (fileOrKey) => docsRoots.some((root) => isUnderDir(fileOrKey, root));
  const hasProductOutsideDocs = files.some((file) => !underDocsSite(file)
    && !isNonProductPath(file)
    && !isDevArtifactPath(file)
    && !isSphinxConfFile(file));
  const hideDocsSiteRoutes = docsRoots.length > 0 && hasProductOutsideDocs;

  const modules = [...moduleCounts.entries()]
    .map(([key, fileCount]) => ({
      key,
      fileCount,
      ...(moduleTestCounts.get(key) ? { testFileCount: moduleTestCounts.get(key) } : {}),
      ...(flatKeys.has(key) ? { flat: true } : {}),
      ...(moduleGoCounts.get(key) === fileCount ? { goPackage: true } : {}),
      ...(underDocsSite(key) ? { docsSite: true } : {}),
      ...(fixtureOf(key) ? { fixture: fixtureOf(key) } : {}),
    }))
    .sort((a, b) => b.fileCount - a.fileCount);

  for (const mod of modules) {
    if (!mod.goPackage || !mod.flat) continue;
    for (const file of filesByModule.get(mod.key) || []) {
      const text = await readFileSafe(path.join(repoRoot, file));
      if (goPackageName(text) === "main") {
        mod.goMain = true;
        break;
      }
    }
  }

  const skipDocsRoute = (file) => hideDocsSiteRoutes && underDocsSite(file);
  const apiFiles = files.filter((file) => isNextRoute(file) && !isNonProductPath(file) && !skipDocsRoute(file));
  const api = [];

  // Extract Next.js API routes
  for (const file of apiFiles) {
    const absoluteFile = path.join(repoRoot, file);
    const content = await readFileSafe(absoluteFile);
    const methods = nextRouteMethods(content);

    api.push({
      file,
      path: routePathFromFile(file),
      methods: methods.length ? methods : ["UNKNOWN"],
      framework: "Next.js"
    });
  }

  // Extract Express.js routes. Tests and examples are not the product API.
  for (const file of files) {
    if (isNonProductPath(file) || skipDocsRoute(file)) continue;
    if (file.endsWith(".ts") || file.endsWith(".js")) {
      const absoluteFile = path.join(repoRoot, file);
      const content = await readFileSafe(absoluteFile);
      
      if (isExpressRoute(content)) {
        const expressRoutes = extractExpressRoutes(content);
        for (const route of expressRoutes) {
          api.push({
            file,
            path: route.path,
            methods: route.methods,
            framework: "Express"
          });
        }
      }
    }
  }

  const pageFiles = files.filter((file) => isNextPage(file) && !isNonProductPath(file) && !skipDocsRoute(file));
  const pages = pageFiles.map((file) => ({
    file,
    path: routePathFromFile(file),
    framework: "Next.js"
  }));

  // Extract React Router routes
  for (const file of files) {
    if (isNonProductPath(file) || skipDocsRoute(file)) continue;
    if (file.endsWith(".tsx") || file.endsWith(".jsx")) {
      const absoluteFile = path.join(repoRoot, file);
      const content = await readFileSafe(absoluteFile);
      
      if (isReactRouterFile(content)) {
        const reactRoutes = extractReactRoutes(content, file);
        pages.push(...reactRoutes);
      }
    }
  }

  // Extract Vue Router routes
  for (const file of files) {
    if (isNonProductPath(file) || skipDocsRoute(file)) continue;
    if (file.endsWith(".ts") || file.endsWith(".js") || file.endsWith(".vue")) {
      const absoluteFile = path.join(repoRoot, file);
      const content = await readFileSafe(absoluteFile);
      
      if (isVueRouterFile(content)) {
        const vueRoutes = extractVueRoutes(content, file);
        pages.push(...vueRoutes);
      }
    }
  }

  // Extract repository metadata (pass files for language detection)
  const metadata = await extractRepoMetadata(repoRoot, files);

  // Detect external API integrations
  const externalApis = await detectExternalApis(files, repoRoot);

  // Detect monorepo workspaces
  const monorepo = await detectMonorepo(repoRoot);

  const scanResult = {
    filesCount: files.length,
    modules,
    api,
    pages,
    metadata,
    externalApis,
    monorepo,
    _files: files
  };
  
  // Track scan metrics
  trackScan(scanResult);
  
  return scanResult;
}

async function detectExternalApis(files, repoRoot) {
  const integrations = [];
  const detectedServices = new Set();

  // Common API patterns to detect
  const apiPatterns = [
    {
      name: "OpenAI API",
      patterns: [
        /api\.openai\.com/,
        /chat\/completions/,
        /OPENAI.*API_KEY/,
        /REPOLENS_AI_API_KEY/
      ],
      category: "AI/ML"
    },
    {
      name: "Notion API",
      patterns: [
        /api\.notion\.com/,
        /NOTION_TOKEN/,
        /notion.*pages/
      ],
      category: "Publishing"
    },
    {
      name: "npm Registry",
      patterns: [
        /registry\.npmjs\.org/,
        /npm.*latest/
      ],
      category: "Package Management"
    },
    {
      name: "GitHub API",
      patterns: [
        /api\.github\.com/,
        /GITHUB_TOKEN/
      ],
      category: "Version Control"
    }
  ];

  // Only scan JavaScript/TypeScript files for performance
  const jsFiles = files.filter(f => 
    f.endsWith('.js') || f.endsWith('.ts') || 
    f.endsWith('.jsx') || f.endsWith('.tsx')
  );

  for (const file of jsFiles) {
    const absoluteFile = path.join(repoRoot, file);
    const content = await readFileSafe(absoluteFile);
    
    if (!content) continue;

    for (const { name, patterns, category } of apiPatterns) {
      if (detectedServices.has(name)) continue;

      const matched = patterns.some(pattern => pattern.test(content));
      
      if (matched) {
        integrations.push({
          name,
          category,
          detectedIn: file
        });
        detectedServices.add(name);
      }
    }
  }

  return integrations;
}