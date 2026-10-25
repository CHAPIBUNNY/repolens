// Dependency graph analysis with cycle detection.
// JavaScript, TypeScript, Python, and Go imports become edges.
// Comments and strings are ignored. Type-only TypeScript imports are not edges.

import fs from "node:fs/promises";
import path from "node:path";
import { info, warn } from "../utils/logger.js";
import {
  extractJsImports,
  externalPackageName,
  extractPythonImports,
  extractGoImports,
  indexPythonModules,
  resolvePythonImport,
  goPackageDir,
  isGoStdlib,
  parseGoModule,
} from "./import-parsers.js";
import { isNonProductPath } from "../utils/path-roles.js";

const JS_EXTENSIONS = new Set([".js", ".ts", ".jsx", ".tsx", ".mjs", ".cjs"]);
const PY_EXTENSIONS = new Set([".py", ".pyw"]);
const GO_EXTENSIONS = new Set([".go"]);

async function readFileSafe(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

function isGoTestFile(file) {
  return String(file).replace(/\\/g, "/").endsWith("_test.go");
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

function emptyResult() {
  return {
    nodes: [],
    edges: [],
    cycles: [],
    externalDeps: [],
    externalRuntime: [],
    externalDev: [],
    stats: null,
    summary: null,
  };
}

async function loadGoModule(repoRoot) {
  const text = await readFileSafe(path.join(repoRoot, "go.mod"));
  return parseGoModule(text);
}

function goPackageImportPath(file, modulePath) {
  const norm = String(file || "").replace(/\\/g, "/");
  if (!norm.endsWith(".go")) return null;
  const dir = path.posix.dirname(norm);
  const rel = dir === "." ? "" : dir;
  if (modulePath) return rel ? `${modulePath}/${rel}` : modulePath;
  return rel || ".";
}

// Hubs describe the product. Test helpers, examples, and build scripts are neither hubs
// nor reasons for a product file to count as one.
function aggregateHubs(nodes, fileKeyToFile, modulePath, hubThreshold) {
  const groups = new Map();
  for (const node of nodes) {
    if (isNonProductPath(node.file || node.key)) continue;
    const pkg = goPackageImportPath(node.file, modulePath);
    const key = pkg || node.key;
    if (!groups.has(key)) groups.set(key, new Set());
    const importers = groups.get(key);
    for (const importer of node.importedBy || []) {
      const importerFile = fileKeyToFile.get(importer) || importer;
      if (isNonProductPath(importerFile)) continue;
      if (pkg && goPackageImportPath(importerFile, modulePath) === pkg) continue;
      importers.add(importer);
    }
  }
  return [...groups.entries()]
    .map(([key, importers]) => ({ key, importedBy: importers.size }))
    .filter((hub) => hub.importedBy >= hubThreshold)
    .sort((a, b) => b.importedBy - a.importedBy)
    .slice(0, 10);
}

function goFilesInDir(goFiles, dir) {
  const target = dir || "";
  return goFiles.filter((file) => {
    const fileDir = path.posix.dirname(file.replace(/\\/g, "/"));
    const normalized = fileDir === "." ? "" : fileDir;
    return normalized === target;
  });
}

export async function analyzeDependencyGraph(files, repoRoot) {
  const result = emptyResult();

  const jsFiles = files.filter((file) => JS_EXTENSIONS.has(path.extname(file)));
  const pyFiles = files.filter((file) => PY_EXTENSIONS.has(path.extname(file)));
  const goFiles = files.filter((file) => GO_EXTENSIONS.has(path.extname(file)) && !isGoTestFile(file));
  const codeFiles = [...jsFiles, ...pyFiles, ...goFiles];

  if (codeFiles.length === 0) return result;

  const adjacency = new Map();
  const fileKeyToFile = new Map();
  const allFileKeys = new Set();
  const externalSet = new Set();
  const externalByKey = new Map();

  function register(file) {
    const key = normalizeFileKey(file);
    allFileKeys.add(key);
    if (!fileKeyToFile.has(key)) fileKeyToFile.set(key, file);
    if (!adjacency.has(key)) adjacency.set(key, new Set());
    if (!externalByKey.has(key)) externalByKey.set(key, new Set());
    return key;
  }

  function addExternal(fromKey, name) {
    if (!name) return;
    externalSet.add(name);
    externalByKey.get(fromKey).add(name);
  }

  function addEdge(fromKey, toKey) {
    if (!toKey || toKey === fromKey || !allFileKeys.has(toKey)) return;
    adjacency.get(fromKey).add(toKey);
  }

  for (const file of codeFiles) register(file);

  // A package importing its own name (examples, docs, tests written like user code)
  // is not a dependency. Resolve the nearest package.json for each file.
  const packageNameByDir = new Map();
  async function ownPackageName(file) {
    let dir = path.dirname(file);
    const visited = [];
    for (;;) {
      if (packageNameByDir.has(dir)) {
        const cached = packageNameByDir.get(dir);
        for (const d of visited) packageNameByDir.set(d, cached);
        return cached;
      }
      visited.push(dir);
      const raw = await readFileSafe(path.join(repoRoot, dir, "package.json"));
      if (raw) {
        let name = null;
        try {
          const parsed = JSON.parse(raw);
          if (typeof parsed?.name === "string") name = parsed.name;
        } catch {
          // invalid package.json: keep walking up
        }
        if (name) {
          for (const d of visited) packageNameByDir.set(d, name);
          return name;
        }
      }
      if (dir === "." || dir === "" || dir === path.dirname(dir)) break;
      dir = path.dirname(dir);
    }
    for (const d of visited) packageNameByDir.set(d, null);
    return null;
  }

  const pyIndex = indexPythonModules(pyFiles);
  const goModulePath = goFiles.length > 0 ? await loadGoModule(repoRoot) : null;

  for (const file of jsFiles) {
    const content = await readFileSafe(path.join(repoRoot, file));
    if (!content) continue;
    const fromKey = normalizeFileKey(file);
    const selfName = await ownPackageName(file);
    for (const imported of extractJsImports(content)) {
      if (imported.typeOnly) continue;
      if (isRelativeImport(imported.specifier)) {
        addEdge(fromKey, resolveImportPath(file, imported.specifier));
      } else {
        const name = externalPackageName(imported.specifier);
        if (name && name === selfName) continue;
        addExternal(fromKey, name);
      }
    }
  }

  for (const file of pyFiles) {
    const content = await readFileSafe(path.join(repoRoot, file));
    if (!content) continue;
    const fromKey = normalizeFileKey(file);
    for (const imported of extractPythonImports(content)) {
      if (imported.typeOnly) continue;
      const resolved = resolvePythonImport(file, imported, pyIndex);
      if (resolved.kind === "internal") addEdge(fromKey, normalizeFileKey(resolved.file));
      else if (resolved.kind === "external") addExternal(fromKey, resolved.name);
    }
  }

  for (const file of goFiles) {
    const content = await readFileSafe(path.join(repoRoot, file));
    if (!content) continue;
    const fromKey = normalizeFileKey(file);
    for (const importPath of extractGoImports(content)) {
      const dir = goPackageDir(importPath, goModulePath, "");
      if (dir !== null) {
        for (const target of goFilesInDir(goFiles, dir)) {
          addEdge(fromKey, normalizeFileKey(target));
        }
        continue;
      }
      if (!isGoStdlib(importPath)) addExternal(fromKey, importPath);
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
      externalImports: [...(externalByKey.get(key) || [])].sort(),
    });
  }

  result.externalDeps = [...externalSet].sort();

  // Detect cycles using iterative DFS (Tarjan-lite / coloring)
  result.cycles = detectCycles(adjacency);

  // Stats
  const totalImports = result.edges.length;
  const orphans = result.nodes.filter(n => n.imports.length === 0 && n.importedBy.length === 0);
  const sourceNodeCount = result.nodes.filter((n) => !isNonProductPath(n.file || n.key)).length;
  const hubThreshold = Math.max(5, Math.round(sourceNodeCount * 0.07));
  const hubs = aggregateHubs(result.nodes, fileKeyToFile, goModulePath, hubThreshold);

  // Runtime vs development packages, from the nearest package.json.
  const { runtime: externalRuntime, dev: externalDev } = await splitExternalDeps(result, repoRoot);
  result.externalRuntime = externalRuntime;
  result.externalDev = externalDev;

  result.stats = {
    totalFiles: codeFiles.length,
    sourceFiles: codeFiles.filter((file) => !isNonProductPath(file)).length,
    totalEdges: totalImports,
    externalDeps: result.externalDeps.length,
    externalRuntime: externalRuntime.length,
    externalDev: externalDev.length,
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
 * Split external packages into runtime dependencies and development tooling.
 * A package declared in `devDependencies` is development tooling. One declared in
 * `dependencies`, `optionalDependencies`, or `peerDependencies` is runtime. An undeclared
 * package is runtime when a product file (not a test, example, or build script) imports it.
 * Without a root package.json (Python, Go) every package counts as runtime.
 */
async function splitExternalDeps(result, repoRoot) {
  const raw = await readFileSafe(path.join(repoRoot, "package.json"));
  let pkg = null;
  try { pkg = raw ? JSON.parse(raw) : null; } catch { pkg = null; }
  if (!pkg) return { runtime: [...result.externalDeps], dev: [] };

  const declaredRuntime = new Set([
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.optionalDependencies || {}),
    ...Object.keys(pkg.peerDependencies || {}),
  ]);
  const declaredDev = new Set(Object.keys(pkg.devDependencies || {}));

  const productImports = new Set();
  for (const node of result.nodes) {
    if (isNonProductPath(node.file || node.key) || isBuildScript(node.file || node.key)) continue;
    for (const name of node.externalImports || []) productImports.add(name);
  }

  const runtime = [];
  const dev = [];
  for (const name of result.externalDeps) {
    if (declaredRuntime.has(name)) runtime.push(name);
    else if (declaredDev.has(name)) dev.push(name);
    else if (productImports.has(name)) runtime.push(name);
    else dev.push(name);
  }
  return { runtime, dev };
}

function isBuildScript(file) {
  const base = String(file || "").replace(/\\/g, "/").split("/").pop() || "";
  return /^build([-_.]|$)/i.test(base) || /\.config\.[cm]?[jt]s$/i.test(base);
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
