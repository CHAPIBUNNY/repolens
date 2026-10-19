import path from "node:path";
import { isInsideRoot, resolveOutputDir } from "../utils/safe-path.js";

/**
 * Workspace root for the MCP server.
 * REPOLENS_WORKSPACE wins over the process working directory.
 */
export function resolveWorkspaceRoot(explicit) {
  const candidate = explicit || process.env.REPOLENS_WORKSPACE || process.cwd();
  if (typeof candidate !== "string" || candidate.length === 0) {
    throw new Error("Workspace root must be a path string");
  }
  if (candidate.includes("\0")) {
    throw new Error("Workspace root contains a null byte");
  }
  return path.resolve(candidate);
}

/**
 * Resolve `requested` and require it to stay inside `workspaceRoot`.
 * An empty value is the workspace root itself.
 */
export function resolveInsideWorkspace(workspaceRoot, requested, label = "path") {
  const root = path.resolve(workspaceRoot);
  if (!isInsideRoot(root, root)) {
    throw new Error("Workspace root is not a directory path");
  }
  if (requested == null || requested === "" || requested === ".") {
    return root;
  }
  if (typeof requested !== "string") {
    throw new Error(`${label} must be a string`);
  }
  if (requested.includes("\0")) {
    throw new Error(`${label} contains a null byte`);
  }
  const resolved = path.resolve(root, requested);
  if (!isInsideRoot(root, resolved)) {
    throw new Error(`${label} escapes the workspace: ${requested}`);
  }
  return resolved;
}

/**
 * Validate a documentation output directory and return the relative
 * path `resolveOutputDir` will accept later.
 */
export function resolveDocsOutputDir(projectRoot, outputDir) {
  const relative = outputDir == null || outputDir === "" ? ".repolens" : outputDir;
  resolveOutputDir(projectRoot, relative);
  return relative;
}
