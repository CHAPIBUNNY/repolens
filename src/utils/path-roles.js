// Path roles: is a file test code, or tooling/example code rather than the product?
// Shared by the dependency graph, flow inference, pattern inference, and security scan
// so tests and examples never drive hub lists, coupling advice, or severity.

const TEST_DIRECTORIES = new Set([
  "test", "tests", "spec", "specs", "__tests__", "__mocks__", "fixtures", "fixture", "__fixtures__",
  "testdata", "e2e", "e2e-fixture", "e2e-fixtures", "cypress", "__snapshots__",
]);

// Directories holding tooling, samples, and docs. Code in here describes a build script
// or an example, not how the product works.
export const TOOLING_DIRECTORIES = new Set([
  "doc", "docs", "doc-gen", "docgen", "scripts", "script", "tools", "tooling",
  "example", "examples", "demo", "demos", "sample", "samples",
  "benchmark", "benchmarks", "bench", "fixtures", "tasks",
]);

function segments(filePath) {
  return String(filePath || "").replace(/\\/g, "/").toLowerCase().split("/");
}

// Directory part of a path. A last segment without an extension (`test`, `examples/amd`)
// is a directory key such as a module, so it counts too.
function directorySegments(filePath) {
  const parts = segments(filePath);
  const last = parts[parts.length - 1] || "";
  return /\.[a-z0-9]+$/.test(last) ? parts.slice(0, -1) : parts;
}

/** True for files in a test directory or named like a test (`a.test.js`, `a_test.go`, `test_a.py`). */
export function isTestPath(filePath) {
  const parts = segments(filePath);
  if (directorySegments(filePath).some((segment) => TEST_DIRECTORIES.has(segment))) return true;
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
  return directorySegments(filePath).some((segment) => TOOLING_DIRECTORIES.has(segment));
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
