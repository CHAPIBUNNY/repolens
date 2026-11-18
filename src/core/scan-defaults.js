import { jvmPackageStart } from "../utils/path-roles.js";

// Directories the scan skips unless scan.include_dev_artifacts is true.
// Snapshots, samples, fixtures, examples, and generated output are dev tooling.
// A project's own scan.ignore is still applied. The flag turns off only this list.

export const DEV_ARTIFACT_IGNORE = [
  "**/__snapshots__/**",
  "**/*.snap",
  "**/samples/**",
  "**/sample/**",
  "**/examples/**",
  "**/example/**",
  "**/fixtures/**",
  "**/fixture/**",
  "**/__fixtures__/**",
  "**/e2e-fixtures/**",
  "**/e2e-fixture/**",
  "**/generated/**",
];

const DEV_ARTIFACT_SEGMENTS = new Set(
  DEV_ARTIFACT_IGNORE.filter((pattern) => pattern.endsWith("/**")).map((pattern) => pattern.slice(3, -3)),
);

/**
 * True when the default dev-artifact ignore list skips this path. Same matches as the
 * `DEV_ARTIFACT_IGNORE` globs (case-sensitive folder names, `*.snap` files), except that
 * Java/Kotlin package folders below `src/<set>/<java|kotlin|scala|groovy>/` do not count:
 * `org/springframework/samples/petclinic` and `com/example/demo` are package names.
 */
export function isDefaultDevArtifact(file) {
  const parts = String(file || "").replace(/\\/g, "/").split("/");
  const base = parts.pop() || "";
  if (base.endsWith(".snap") && !base.startsWith(".")) return true;
  const packageStart = jvmPackageStart(parts.concat(base));
  const dirs = packageStart === -1 ? parts : parts.slice(0, packageStart);
  return dirs.some((segment) => DEV_ARTIFACT_SEGMENTS.has(segment));
}

/**
 * Ignore globs for one scan.
 * `include_dev_artifacts: true` keeps the caller's list and does not add the defaults,
 * so a config can scan samples or snapshots on purpose. Other ignore entries always apply.
 */
export function resolveUserScanIgnore(scan = {}) {
  return Array.isArray(scan.ignore) ? scan.ignore.filter((pattern) => typeof pattern === "string") : [];
}

export function resolveScanIgnore(scan = {}) {
  const user = Array.isArray(scan.ignore) ? scan.ignore.filter((pattern) => typeof pattern === "string") : [];
  if (scan.include_dev_artifacts === true) return user;
  const seen = new Set(user);
  const merged = [...user];
  for (const pattern of DEV_ARTIFACT_IGNORE) {
    if (seen.has(pattern)) continue;
    seen.add(pattern);
    merged.push(pattern);
  }
  return merged;
}
