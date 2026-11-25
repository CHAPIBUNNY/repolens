// Documentation websites that live next to the product (Docusaurus, VitePress, Astro).
// A config at the repository root is the product, so it is never a docs-site root.

import fg from "fast-glob";
import path from "node:path";
import { isDevArtifactPath, isNonProductPath } from "../utils/path-roles.js";

export const DOCS_SITE_GLOBS = [
  "**/docusaurus.config.{js,ts,mjs,cjs}",
  "**/.vitepress/config.{js,ts,mjs,mts}",
  "**/astro.config.{js,mjs,cjs,ts,mts}",
];

function norm(file) {
  return String(file || "").replace(/\\/g, "/");
}

/**
 * Directories that are a documentation website, not the product.
 * The repository root itself is never one.
 * @param {string} repoRoot
 * @returns {Promise<string[]>} repository-relative roots, sorted
 */
export async function findDocsSiteRoots(repoRoot) {
  const roots = new Set();
  let found = [];
  try {
    found = await fg(DOCS_SITE_GLOBS, {
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

export function isUnderDocsRoot(file, roots) {
  const normalized = norm(file);
  return (roots || []).some((root) => normalized === root || normalized.startsWith(`${root}/`));
}

/**
 * Drop documentation-website files when the repository has product source outside them.
 * A repository that is only a docs site keeps those files.
 * @returns {Promise<{ files: string[], roots: string[], excluded: boolean }>}
 */
export async function excludeDocsSiteFiles(files, repoRoot) {
  const list = files || [];
  const roots = await findDocsSiteRoots(repoRoot);
  if (roots.length === 0) return { files: list, roots, excluded: false };
  const outside = list.some((file) => !isUnderDocsRoot(file, roots)
    && !isNonProductPath(file)
    && !isDevArtifactPath(file));
  if (!outside) return { files: list, roots, excluded: false };
  return {
    files: list.filter((file) => !isUnderDocsRoot(file, roots)),
    roots,
    excluded: true,
  };
}
