// Path roles: is a file test code, or tooling/example code rather than the product?
// Shared by the dependency graph, flow inference, pattern inference, and security scan
// so tests and examples never drive hub lists, coupling advice, or severity.

const TEST_DIRECTORIES = new Set([
  "test", "tests", "spec", "specs", "__tests__", "__mocks__", "fixtures", "fixture", "__fixtures__",
  "testdata", "e2e", "e2e-fixture", "e2e-fixtures", "cypress", "__snapshots__",
  // Gradle / Android source sets for tests.
  "testfixtures", "integrationtest", "androidtest", "testintegration",
]);

// .NET test projects are directories named like `Polly.Core.Tests` or `App.UnitTests`.
const DOTNET_TEST_PROJECT = /\.(tests?|unittests?|integrationtests?|functionaltests?|specs?|testing\.tests)$/;
// Java/Kotlin/C# test classes: `GsonTest.java`, `ParserTests.cs`, `FooIT.java`, `BarTestCase.java`.
const JVM_DOTNET_TEST_FILE = /(?:[A-Za-z0-9](?:Tests?|TestCase)|[a-z0-9]IT)\.(java|kt|cs)$/;

// Directories holding tooling, samples, and docs. Code in here describes a build script
// or an example, not how the product works.
export const TOOLING_DIRECTORIES = new Set([
  "doc", "docs", "doc-gen", "docgen", "scripts", "script", "tools", "tooling",
  "example", "examples", "demo", "demos", "sample", "samples",
  "benchmark", "benchmarks", "bench", "fixtures", "tasks", "jmh",
]);

// .NET benchmark projects: `Polly.Core.Benchmarks`.
const DOTNET_BENCHMARK_PROJECT = /\.(benchmarks?|perf|performance)$/;

function segments(filePath) {
  return String(filePath || "").replace(/\\/g, "/").toLowerCase().split("/");
}

const JVM_LANG_DIRS = new Set(["java", "kotlin", "scala", "groovy"]);

/**
 * Index of the first Java/Kotlin package segment in `<prefix>/src/<set>/<java|kotlin|...>/<package...>`,
 * or -1. Package folders mirror package names (`org/springframework/samples/petclinic`,
 * Spring Initializr's `com/example/demo`), so they are not test, sample, or docs folders.
 * Only the path down to the source root says that (`src/test/java`, `samples/x/src/main/java`).
 */
export function jvmPackageStart(parts) {
  for (let i = 0; i + 3 < parts.length; i += 1) {
    if (parts[i] === "src" && parts[i + 1] && JVM_LANG_DIRS.has(parts[i + 2])) return i + 3;
  }
  return -1;
}

// Directory part of a path. A last segment without an extension (`test`, `examples/amd`)
// is a directory key such as a module, so it counts too. Java/Kotlin package folders
// below a source root are dropped: they name packages, not test or sample trees.
function directorySegments(filePath) {
  const parts = segments(filePath);
  const last = parts[parts.length - 1] || "";
  const dirs = /\.[a-z0-9]+$/.test(last) ? parts.slice(0, -1) : parts;
  const packageStart = jvmPackageStart(dirs.concat(""));
  return packageStart === -1 ? dirs : dirs.slice(0, packageStart);
}

/** True for files in a test directory or named like a test (`a.test.js`, `a_test.go`, `test_a.py`). */
export function isTestPath(filePath) {
  const parts = segments(filePath);
  if (directorySegments(filePath).some((segment) => TEST_DIRECTORIES.has(segment) || DOTNET_TEST_PROJECT.test(segment))) return true;
  const rawBase = String(filePath || "").replace(/\\/g, "/").split("/").pop() || "";
  if (JVM_DOTNET_TEST_FILE.test(rawBase)) return true;
  const base = parts[parts.length - 1] || "";
  if (base.endsWith(".snap") || base.includes(".snap.")) return true;
  if (/^(test_|spec_)/.test(base)) return true;
  if (/(_test|_spec)\.[a-z0-9]+$/.test(base)) return true;
  if (/\.(test|spec)\.[a-z0-9]+$/.test(base)) return true;
  return false;
}

/**
 * Snapshot, sample, fixture, example, and generated trees.
 * These are dev tooling, like tests: they describe the suite or a demo, not the product.
 * Scan ignores them unless `scan.include_dev_artifacts` is true.
 */
export const DEV_ARTIFACT_DIRECTORIES = new Set([
  "__snapshots__",
  "sample", "samples",
  "example", "examples",
  "fixture", "fixtures", "__fixtures__",
  "e2e-fixture", "e2e-fixtures",
  "generated",
]);

export function isSnapshotPath(filePath) {
  const parts = segments(filePath);
  if (parts.some((segment) => segment === "__snapshots__")) return true;
  const base = parts[parts.length - 1] || "";
  return base.endsWith(".snap") || base.includes(".snap.");
}

export function isDevArtifactPath(filePath) {
  if (isSnapshotPath(filePath)) return true;
  return directorySegments(filePath).some((segment) => DEV_ARTIFACT_DIRECTORIES.has(segment));
}

/** True when a directory above the file is a tooling, example, or docs directory. */
export function isToolingPath(filePath) {
  return directorySegments(filePath).some((segment) => TOOLING_DIRECTORIES.has(segment) || DOTNET_BENCHMARK_PROJECT.test(segment));
}

/**
 * Build-time or example code: runs on a maintainer's machine or in a browser demo, not in
 * the shipped library. Includes `build*.js` scripts and anything under a tooling directory.
 */
export function isBuildOrExamplePath(filePath) {
  if (isToolingPath(filePath)) return true;
  const base = segments(filePath).pop() || "";
  return /^build([-_.]|$)/.test(base);
}

/** Test code or tooling/example code: not part of the product's own architecture. */
export function isNonProductPath(filePath) {
  return isTestPath(filePath) || isToolingPath(filePath);
}

/** `a/b//` → `a/b`. A loop, not `/\/+$/`, which is quadratic on long runs of `/`. */
export function trimTrailingSlashes(value) {
  const text = String(value);
  let end = text.length;
  while (end > 0 && text.charCodeAt(end - 1) === 47) end -= 1;
  return end === text.length ? text : text.slice(0, end);
}
