// Dependency graph analysis with cycle detection
// Parses import/require statements, builds a directed graph, detects cycles via DFS

import fs from "node:fs/promises";
import path from "node:path";
import { info, warn } from "../utils/logger.js";

const CODE_EXTENSIONS = new Set([".js", ".ts", ".jsx", ".tsx", ".mjs", ".cjs"]);

// Patterns for extracting imports
const IMPORT_PATTERNS = [
  // ES module: import ... from "..."
  /import\s+(?:[\w*{},\s]+\s+from\s+)?['"]([^'"]+)['"]/g,
  // Dynamic import: import("...")
  /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  // CommonJS: require("...")
  /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  // Re-export: export ... from "..."
  /export\s+(?:[\w*{},\s]+\s+from\s+)?['"]([^'"]+)['"]/g,
];

async function readFileSafe(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

function isRelativeImport(specifier) {
  return specifier.startsWith("./") || specifier.startsWith("../");
}

function resolveImportPath(importerFile, specifier) {
  // Only resolve relative imports — skip node_modules / bare specifiers
  if (!isRelativeImport(specifier)) return null;

  const importerDir = path.dirname(importerFile);
  let resolved = path.posix.join(importerDir, specifier);

  // Normalize path separators
  resolved = resolved.replace(/\\/g, "/");

  // Strip known extensions for dedup — we normalize to extensionless keys
  resolved = resolved.replace(/\.(js|ts|jsx|tsx|mjs|cjs)$/, "");

  // Strip /index suffix
  resolved = resolved.replace(/\/index$/, "");

  return resolved;
}

function normalizeFileKey(file) {
  // Normalize a source file to a key that can match resolved imports
  let key = file.replace(/\\/g, "/");
  key = key.replace(/\.(js|ts|jsx|tsx|mjs|cjs)$/, "");
  key = key.replace(/\/index$/, "");
  return key;
}

export async function analyzeDependencyGraph(files, repoRoot) {
  const result = {
    nodes: [],       // { key, file, imports: string[], importedBy: string[] }
    edges: [],       // { from, to }
    cycles: [],      // [ [a, b, c, a], ... ]
    externalDeps: [],// sorted unique bare-specifier imports
    stats: null,
    summary: null,
  };

  const codeFiles = files.filter(f => {
    const ext = path.extname(f);
    return CODE_EXTENSIONS.has(ext);
  });

  if (codeFiles.length === 0) return result;

  // Build adjacency: fileKey → Set<fileKey>
  const adjacency = new Map();
  const fileKeyToFile = new Map();
  const allFileKeys = new Set();
  const externalSet = new Set();

  // Register all known file keys
  for (const file of codeFiles) {
    const key = normalizeFileKey(file);
    allFileKeys.add(key);
    fileKeyToFile.set(key, file);
    if (!adjacency.has(key)) adjacency.set(key, new Set());
  }

  // Parse imports and build edges
  for (const file of codeFiles) {
    const content = await readFileSafe(path.join(repoRoot, file));
    if (!content) continue;

    const fromKey = normalizeFileKey(file);

    for (const pattern of IMPORT_PATTERNS) {
      // Reset lastIndex since we reuse regex objects
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(content)) !== null) {
        const specifier = match[1];

        if (isRelativeImport(specifier)) {
          const resolved = resolveImportPath(file, specifier);
          if (resolved && allFileKeys.has(resolved)) {
            adjacency.get(fromKey).add(resolved);
          }
        } else if (!specifier.startsWith("node:")) {
          // Bare specifier → external dependency
          // Normalize scoped packages: @scope/pkg/path → @scope/pkg
          const parts = specifier.startsWith("@") ? specifier.split("/").slice(0, 2) : specifier.split("/").slice(0, 1);
          externalSet.add(parts.join("/"));
        }
      }
    }
  }

  // Build nodes and edges
  const importedByMap = new Map();
  for (const key of allFileKeys) {
    importedByMap.set(key, []);
  }

  for (const [fromKey, deps] of adjacency) {
    for (const toKey of deps) {
      result.edges.push({ from: fromKey, to: toKey });
      if (importedByMap.has(toKey)) {
        importedByMap.get(toKey).push(fromKey);
      }
    }
  }

  for (const key of allFileKeys) {
    result.nodes.push({
      key,
      file: fileKeyToFile.get(key) || key,
      imports: [...(adjacency.get(key) || [])],
      importedBy: importedByMap.get(key) || [],
    });
  }

  result.externalDeps = [...externalSet].sort();

  // Detect cycles using iterative DFS (Tarjan-lite / coloring)
  result.cycles = detectCycles(adjacency);

  // Stats
  const totalImports = result.edges.length;
  const orphans = result.nodes.filter(n => n.imports.length === 0 && n.importedBy.length === 0);
  const hubThreshold = Math.max(5, Math.floor(result.nodes.length * 0.1));
  const hubs = result.nodes
    .filter(n => n.importedBy.length >= hubThreshold)
    .sort((a, b) => b.importedBy.length - a.importedBy.length)
    .slice(0, 10)
    .map(n => ({ key: n.key, importedBy: n.importedBy.length }));

  result.stats = {
    totalFiles: codeFiles.length,
    totalEdges: totalImports,
    externalDeps: result.externalDeps.length,
    cycles: result.cycles.length,
    orphanFiles: orphans.length,
    hubs,
  };

  result.summary = buildSummary(result);

  if (result.cycles.length > 0) {
    warn(`Dependency graph: ${result.cycles.length} circular dependency cycle(s) detected`);
  } else {
    info(`Dependency graph: ${totalImports} edges across ${codeFiles.length} files, no cycles`);
  }

  return result;
}

/**
 * Detect all cycles in a directed graph using DFS with 3-color marking.
 * Returns an array of cycle paths (each path ends where it started).
 */
function detectCycles(adjacency) {
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map();
  const parent = new Map();
  const cycles = [];

  for (const node of adjacency.keys()) {
    color.set(node, WHITE);
  }

  for (const startNode of adjacency.keys()) {
    if (color.get(startNode) !== WHITE) continue;

    // Iterative DFS
    const stack = [{ node: startNode, neighbors: [...(adjacency.get(startNode) || [])], idx: 0 }];
    color.set(startNode, GRAY);
    parent.set(startNode, null);

    while (stack.length > 0) {
      const frame = stack[stack.length - 1];

      if (frame.idx >= frame.neighbors.length) {
        // All neighbors processed — mark black and backtrack
        color.set(frame.node, BLACK);
        stack.pop();
        continue;
      }

      const neighbor = frame.neighbors[frame.idx++];

      if (color.get(neighbor) === GRAY) {
        // Back edge → cycle found. Reconstruct the cycle path.
        const cyclePath = [neighbor];
        for (let i = stack.length - 1; i >= 0; i--) {
          cyclePath.push(stack[i].node);
          if (stack[i].node === neighbor) break;
        }
        cyclePath.reverse();
        // Only keep reasonably short cycles to avoid noise
        if (cyclePath.length <= 20) {
          cycles.push(cyclePath);
        }
        // Cap cycles to prevent runaway in huge graphs
        if (cycles.length >= 50) return cycles;
      } else if (color.get(neighbor) === WHITE) {
        color.set(neighbor, GRAY);
        parent.set(neighbor, frame.node);
        stack.push({ node: neighbor, neighbors: [...(adjacency.get(neighbor) || [])], idx: 0 });
      }
    }
  }

  return cycles;
}

function buildSummary(result) {
  const parts = [
    `${result.stats.totalFiles} files`,
    `${result.stats.totalEdges} imports`,
    `${result.stats.externalDeps} external packages`,
  ];
  if (result.stats.cycles > 0) {
    parts.push(`⚠️ ${result.stats.cycles} circular dependency cycle(s)`);
  } else {
    parts.push("✓ no circular dependencies");
  }
  if (result.stats.orphanFiles > 0) {
    parts.push(`${result.stats.orphanFiles} orphan file(s)`);
  }
  return parts.join(" · ");
}
