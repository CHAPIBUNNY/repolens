import { trimTrailingSlashes } from "../utils/path-roles.js";

// Module keys for JVM source sets. A Maven/Gradle source set (`<module>/src/main/java`)
// is split by package, one module per top-level package below the package prefix all
// its files share: `api/src/main/java/io/terrakube/api/rs`, `.../plugin`, and so on.
// Grouping a whole Maven module (or `gson/src`) as one module hid every coupling
// between its packages, so every module looked "Isolated".
// Test-like source sets (`src/test/java`, `src/jmh/java`, ...) stay one module each.

const JVM_LANG_DIRS = new Set(["java", "kotlin", "scala", "groovy"]);
const SET_NAME = /^[A-Za-z0-9_.-]+$/;
const JVM_FILE = /\.(java|kt|scala|groovy)$/;
const TEST_LIKE_SET = /^(test|tests|it|jmh|bench|benchmarks?|fixtures)([A-Z]\w*)?$|[a-z0-9](Test|Tests|IT|Jmh|Bench|Benchmarks?|Fixtures)$/;

function norm(file) {
  return String(file || "").replace(/\\/g, "/");
}

/** `{ sourceRoot, rel, set }` for a file in a JVM source set, else null. */
export function jvmSourceSetOf(file) {
  const normalized = norm(file);
  if (!JVM_FILE.test(normalized)) return null;
  const parts = splitJvmSourcePath(normalized);
  if (!parts || !parts.rel) return null;
  return { sourceRoot: parts.sourceRoot, rel: parts.rel, set: parts.set };
}

/**
 * Split `<prefix>/src/<set>/<java|kotlin|scala|groovy>[/<rel>]` at the first source set
 * in the path. `rel` is "" for the source root itself. Null when there is none.
 * Segment parsing, not a regex: a backtracking pattern is slow on paths with many `/`.
 */
export function splitJvmSourcePath(value) {
  const segments = norm(value).split("/");
  for (let i = 0; i + 2 < segments.length; i += 1) {
    if (segments[i] !== "src" || !SET_NAME.test(segments[i + 1]) || !JVM_LANG_DIRS.has(segments[i + 2])) continue;
    const prefix = segments.slice(0, i).join("/");
    const set = segments[i + 1];
    const lang = segments[i + 2];
    const rel = segments.slice(i + 3).join("/");
    return { prefix, set, lang, rel, sourceRoot: `${prefix ? `${prefix}/` : ""}src/${set}/${lang}` };
  }
  return null;
}

function commonDirPrefix(dirs) {
  if (dirs.length === 0) return [];
  let prefix = dirs[0];
  for (const dir of dirs.slice(1)) {
    let i = 0;
    while (i < prefix.length && i < dir.length && prefix[i] === dir[i]) i += 1;
    prefix = prefix.slice(0, i);
    if (prefix.length === 0) break;
  }
  return prefix;
}

/**
 * Returns `file => moduleKey | null`. Null means "not a JVM source file, use the
 * folder rule". A configured module root inside a source set (for example
 * `src/main/java/com/acme`) wins: those files keep the folder rule.
 */
export function buildJvmModuleKeyer(files, moduleRoots = []) {
  const roots = (moduleRoots || []).map((root) => trimTrailingSlashes(norm(root))).filter((root) => root && root !== ".");
  const dirsBySourceRoot = new Map();
  for (const file of files) {
    const info = jvmSourceSetOf(file);
    if (!info) continue;
    const parts = info.rel.split("/").slice(0, -1);
    if (!dirsBySourceRoot.has(info.sourceRoot)) dirsBySourceRoot.set(info.sourceRoot, []);
    // `module-info.java` and other files directly in the source root have no package.
    if (parts.length > 0) dirsBySourceRoot.get(info.sourceRoot).push(parts);
  }
  const prefixBySourceRoot = new Map();
  for (const [sourceRoot, dirs] of dirsBySourceRoot) prefixBySourceRoot.set(sourceRoot, commonDirPrefix(dirs));

  return (file) => {
    const info = jvmSourceSetOf(file);
    if (!info) return null;
    const { sourceRoot, rel, set } = info;
    if (roots.some((root) => root.startsWith(`${sourceRoot}/`))) return null;
    if (TEST_LIKE_SET.test(set)) return sourceRoot;
    const parts = rel.split("/").slice(0, -1);
    if (parts.length === 0) return sourceRoot;
    const prefix = prefixBySourceRoot.get(sourceRoot) || [];
    const base = prefix.length > 0 ? `${sourceRoot}/${prefix.join("/")}` : sourceRoot;
    const next = parts[prefix.length];
    return next ? `${base}/${next}` : base;
  };
}

const MODULE_KEY = /^(?:(.+?)\/)?src\/([A-Za-z0-9_.-]+)\/(java|kotlin|scala|groovy)(?:\/(.+))?$/;

/** `{ moduleDir, set, packagePath }` for a JVM module key, else null. */
export function jvmModuleParts(key) {
  const match = norm(key).match(MODULE_KEY);
  if (!match) return null;
  return { moduleDir: match[1] || "", set: match[2], packagePath: match[4] || "" };
}

/**
 * Short display name for a JVM module key: build module plus the package's last
 * segment (`api/plugin`, `executor/plugin`) or the source set (`api/test`).
 * Null for other keys.
 */
export function jvmModuleShortLabel(key) {
  const parts = jvmModuleParts(key);
  if (!parts) return null;
  const owner = parts.moduleDir ? parts.moduleDir.split("/").pop() : "";
  const segments = parts.packagePath.split("/").filter(Boolean);
  const tail = segments.length > 0 ? segments[segments.length - 1] : parts.set;
  return owner ? `${owner}/${tail}` : tail;
}
