// Path roles: is a file test code, or tooling/example code rather than the product?
// Shared by the dependency graph, flow inference, pattern inference, and security scan
// so tests and examples never drive hub lists, coupling advice, or severity.

const TEST_DIRECTORIES = new Set([
  "test", "tests", "spec", "specs", "__tests__", "__mocks__", "fixtures", "testdata", "e2e", "cypress",
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
  if (/^(test_|spec_)/.test(base)) return true;
  if (/(_test|_spec)\.[a-z0-9]+$/.test(base)) return true;
  if (/\.(test|spec)\.[a-z0-9]+$/.test(base)) return true;
  return false;
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
