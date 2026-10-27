// Cycle priority.
//
// Not every circular import is a refactor. The heuristic:
//
// 1. Type-only. Every edge in the cycle is `import type` or `export type`.
//    There is no runtime cycle. Priority: Low. Wording: type-only imports; verify.
//    These stay out of the runtime cycle list (`cycles` / `stats.cycles`).
//
// 2. Recursive-descent pair (mutual recursion). The cycle stays inside two parent
//    directories, and those two directories import each other in both directions
//    with many edges (at least 2 each way) and both directions are call-heavy
//    (at least 2 calls of the imported bindings each way). Schema getters calling
//    resolvers that call getters is this shape. The pair is small: two folders,
//    not a chain across the repo. Priority: Low. Wording: mutual recursion,
//    probably intentional; verify.
//
// 3. Large multi-module cycle. The cycle touches 3 or more parent directories.
//    Priority: High refactor.
//
// 4. Anything else (a short accidental cycle, one import each way, no real call
//    traffic) is Medium: review, not a blanket high-priority refactor.
//
// "Folder" is the file's parent directory. `index.ts` stays in its own directory
// after the graph strips the `/index` suffix. Call counts use ESM bindings
// (`import { fn }` then `fn(` or `ns.fn(`). A `require()` edge has no binding
// names, so it does not count as call-heavy.

export const MUTUAL_EDGE_MINIMUM = 2;
export const MUTUAL_CALL_MINIMUM = 2;
export const HIGH_FOLDER_MINIMUM = 3;

export function folderOfFile(file) {
  const norm = String(file || "").replace(/\\/g, "/");
  const slash = norm.lastIndexOf("/");
  if (slash <= 0) return ".";
  return norm.slice(0, slash);
}

function cycleNodes(path) {
  if (!Array.isArray(path) || path.length < 2) return [];
  return path[0] === path[path.length - 1] ? path.slice(0, -1) : path.slice();
}

function report(path, priority, kind, label) {
  return { path, priority, kind, label, priorityLine: priorityLine(priority, label) };
}

export function priorityLine(priority, label) {
  if (priority === "high") return "Priority: High refactor";
  const text = label || "review";
  const name = priority === "low" ? "Low" : "Medium";
  return `Priority: ${name} — ${text}`;
}

/**
 * Classify one runtime cycle.
 * `edges` are runtime import edges: { from, to, fromFile, toFile, calls }.
 * `fileForKey(key)` returns the source path used for the parent directory.
 */
export function classifyRuntimeCycle(path, edges, fileForKey) {
  const nodes = cycleNodes(path);
  const folders = nodes.map((key) => folderOfFile(fileForKey(key)));
  const uniqueFolders = [...new Set(folders)];

  if (uniqueFolders.length >= HIGH_FOLDER_MINIMUM) {
    return report(path, "high", "multi-module", "large multi-module cycle");
  }

  if (uniqueFolders.length === 2 && isRecursiveDescentPair(uniqueFolders[0], uniqueFolders[1], edges)) {
    return report(path, "low", "mutual-recursion", "mutual recursion, probably intentional; verify");
  }

  return report(path, "medium", "small", "small cycle; review");
}

export function isRecursiveDescentPair(folderA, folderB, edges) {
  let ab = 0;
  let ba = 0;
  let callsAB = 0;
  let callsBA = 0;
  for (const edge of edges || []) {
    if (edge.typeOnly) continue;
    const from = folderOfFile(edge.fromFile || edge.from);
    const to = folderOfFile(edge.toFile || edge.to);
    if (from === folderA && to === folderB) {
      ab += 1;
      callsAB += edge.calls || 0;
    } else if (from === folderB && to === folderA) {
      ba += 1;
      callsBA += edge.calls || 0;
    }
  }
  return ab >= MUTUAL_EDGE_MINIMUM
    && ba >= MUTUAL_EDGE_MINIMUM
    && callsAB >= MUTUAL_CALL_MINIMUM
    && callsBA >= MUTUAL_CALL_MINIMUM;
}

export function classifyRuntimeCycles(cycles, edges, fileForKey) {
  return (cycles || []).map((path) => classifyRuntimeCycle(path, edges, fileForKey));
}

export function typeOnlyReport(path) {
  return report(path, "low", "type-only", "type-only imports; verify");
}

export function priorityCounts(reports) {
  const counts = { high: 0, medium: 0, low: 0 };
  for (const item of reports || []) {
    if (item.priority === "high") counts.high += 1;
    else if (item.priority === "low") counts.low += 1;
    else counts.medium += 1;
  }
  return counts;
}

export function hasCyclePriorities(stats) {
  return Boolean(stats) && (stats.highCycles != null || stats.mediumCycles != null || stats.lowCycles != null);
}

/** Points removed from the architecture health score. Low-priority cycles do not count. */
export function cycleHealthPenalty(stats) {
  if (!stats) return 0;
  if (!hasCyclePriorities(stats)) {
    return stats.cycles > 0 ? Math.min(30, stats.cycles * 10) : 0;
  }
  const high = stats.highCycles || 0;
  const medium = stats.mediumCycles || 0;
  return Math.min(30, high * 10 + medium * 5);
}

export function cycleStatusCell(stats) {
  if (!stats || stats.cycles === 0) return { mark: "✅", advice: "Clean module boundaries" };
  if (hasCyclePriorities(stats) && (stats.highCycles || 0) === 0 && (stats.lowCycles || 0) > 0 && !(stats.mediumCycles > 0)) {
    return { mark: "🟡", advice: "mutual recursion, probably intentional; verify" };
  }
  if (hasCyclePriorities(stats) && (stats.highCycles || 0) === 0) {
    return { mark: "🟡", advice: "Small cycle; review" };
  }
  return { mark: "🔴", advice: "Refactor to break cycles" };
}

export function cycleConcern(stats) {
  if (!stats || !(stats.cycles > 0)) return null;
  const noun = `circular dependenc${stats.cycles === 1 ? "y" : "ies"}`;
  if (!hasCyclePriorities(stats)) {
    return `**Circular dependencies detected** — ${stats.cycles} ${noun} create tight coupling, complicate testing, and hinder refactoring. Priority: High.`;
  }
  if ((stats.highCycles || 0) > 0) {
    const high = stats.highCycles;
    const highNoun = `circular dependenc${high === 1 ? "y" : "ies"}`;
    return `**Circular dependencies detected** — ${high} large multi-module ${highNoun}. Priority: High refactor.`;
  }
  if ((stats.lowCycles || 0) > 0 && !(stats.mediumCycles > 0)) {
    return `**Circular dependencies detected** — ${stats.cycles} ${noun}. mutual recursion, probably intentional; verify. Priority: Low.`;
  }
  return `**Circular dependencies detected** — ${stats.cycles} ${noun}. Priority: Medium.`;
}

export function cycleInsight(stats) {
  if (!stats || !(stats.cycles > 0)) return null;
  if (!hasCyclePriorities(stats)) {
    return `🔴 **Architectural concern** — ${stats.cycles} circular dependenc${stats.cycles === 1 ? "y" : "ies"} detected. These create tight coupling and make testing difficult.`;
  }
  if ((stats.highCycles || 0) === 0) {
    return `🟡 **Circular dependencies** — ${stats.cycles} detected. mutual recursion, probably intentional; verify. Priority: Low.`;
  }
  return `🔴 **Architectural concern** — ${stats.highCycles} large multi-module circular dependenc${stats.highCycles === 1 ? "y" : "ies"} detected. Priority: High refactor.`;
}
