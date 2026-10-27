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

/**
 * Ignore globs for one scan.
 * `include_dev_artifacts: true` keeps the caller's list and does not add the defaults,
 * so a config can scan samples or snapshots on purpose. Other ignore entries always apply.
 */
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
