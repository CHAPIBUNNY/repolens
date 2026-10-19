import path from "node:path";

/**
 * True when `target` is `root` or a path inside it.
 * Comparison uses resolved paths so `..`, absolute segments, and
 * platform separators cannot escape the root.
 */
export function isInsideRoot(root, target) {
  const rootResolved = path.resolve(root);
  const targetResolved = path.resolve(target);
  const rel = path.relative(rootResolved, targetResolved);
  return rel === "" || (!rel.startsWith(`..${path.sep}`) && rel !== ".." && !path.isAbsolute(rel));
}

/**
 * Resolve a documentation output directory and keep it inside `root`.
 * Absolute paths and `..` escapes are rejected. An empty value means `.repolens`.
 */
export function resolveOutputDir(root, outputDir = ".repolens") {
  const relative = outputDir == null || outputDir === "" ? ".repolens" : outputDir;
  if (typeof relative !== "string") {
    throw new Error("Output directory must be a string");
  }
  if (relative.includes("\0")) {
    throw new Error("Output directory contains a null byte");
  }
  if (path.isAbsolute(relative)) {
    throw new Error(`Output directory must be a relative path inside the repository (received ${relative})`);
  }

  const rootResolved = path.resolve(root);
  const resolved = path.resolve(rootResolved, relative);
  if (!isInsideRoot(rootResolved, resolved)) {
    throw new Error(`Output directory escapes the repository: ${relative}`);
  }
  return resolved;
}

/**
 * Reduce a document or wiki name to a single path segment.
 */
export function safeFileName(name, fallback = "document.md") {
  if (typeof name !== "string" || name.length === 0) return fallback;
  const normalized = name.replace(/\\/g, "/");
  const base = path.posix.basename(normalized);
  if (!base || base === "." || base === ".." || base.includes("\0") || base.includes("/") || base.includes("\\")) {
    return fallback;
  }
  return base;
}
