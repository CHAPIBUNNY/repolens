// Architecture drift detection
// Compares current scan snapshot against a stored reference baseline
// Flags structural changes: new/removed modules, dependency shifts, API surface changes

import fs from "node:fs/promises";
import path from "node:path";
import { info, warn } from "../utils/logger.js";

const BASELINE_FILENAME = "architecture-baseline.json";

/**
 * Save the current architecture state as a baseline for future drift detection.
 * @param {object} snapshot - The architecture snapshot to save
 * @param {string} outputDir - Directory to save the baseline (typically .repolens/)
 */
export async function saveBaseline(snapshot, outputDir) {
  const baselinePath = path.join(outputDir, BASELINE_FILENAME);
  const baseline = {
    version: 1,
    timestamp: new Date().toISOString(),
    ...snapshot,
  };
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(baselinePath, JSON.stringify(baseline, null, 2), "utf8");
  info(`Architecture baseline saved to ${baselinePath}`);
  return baselinePath;
}

/**
 * Load a previously saved baseline. Returns null if none exists.
 */
export async function loadBaseline(outputDir) {
  const baselinePath = path.join(outputDir, BASELINE_FILENAME);
  try {
    const raw = await fs.readFile(baselinePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Build an architecture snapshot from scan results and analysis outputs.
 * This is the canonical representation used for drift comparison.
 */
export function buildSnapshot(scanResult, depGraph, graphqlResult, tsResult) {
  return {
    modules: (scanResult.modules || []).map(m => m.key).sort(),
    moduleFileCounts: Object.fromEntries(
      (scanResult.modules || []).map(m => [m.key, m.fileCount])
    ),
    filesCount: scanResult.filesCount || 0,
    apiEndpoints: (scanResult.api || []).map(a => `${a.methods.join(",")}:${a.path}`).sort(),
    pages: (scanResult.pages || []).map(p => p.path).sort(),
    externalApis: (scanResult.externalApis || []).map(e => e.name).sort(),
    frameworks: scanResult.metadata?.frameworks || [],
    depGraphEdgeCount: depGraph?.edges?.length || 0,
    depGraphCycleCount: depGraph?.cycles?.length || 0,
    externalDeps: depGraph?.externalDeps || [],
    graphqlTypes: graphqlResult?.detected ? graphqlResult.types.map(t => t.name).sort() : [],
    graphqlQueries: graphqlResult?.detected ? graphqlResult.queries.map(q => q.name).sort() : [],
    graphqlMutations: graphqlResult?.detected ? graphqlResult.mutations.map(m => m.name).sort() : [],
    tsInterfaces: tsResult?.detected ? tsResult.interfaces.map(i => i.name).sort() : [],
    tsClasses: tsResult?.detected ? tsResult.classes.map(c => c.name).sort() : [],
  };
}

/**
 * Compare a current snapshot against a stored baseline and produce drift analysis.
 */
export function detectDrift(baseline, current) {
  if (!baseline) {
    return {
      hasBaseline: false,
      drifts: [],
      summary: "No baseline found. Run `repolens publish` once to establish a baseline.",
    };
  }

  const drifts = [];

  // Module drift
  const baseModules = new Set(baseline.modules || []);
  const currModules = new Set(current.modules || []);
  const addedModules = [...currModules].filter(m => !baseModules.has(m));
  const removedModules = [...baseModules].filter(m => !currModules.has(m));
  if (addedModules.length > 0) {
    drifts.push({ category: "modules", type: "added", items: addedModules, severity: "info" });
  }
  if (removedModules.length > 0) {
    drifts.push({ category: "modules", type: "removed", items: removedModules, severity: "warning" });
  }

  // Significant module size changes (>50% file count change)
  for (const mod of current.modules || []) {
    const baseCount = baseline.moduleFileCounts?.[mod] || 0;
    const currCount = current.moduleFileCounts?.[mod] || 0;
    if (baseCount > 0 && currCount > 0) {
      const changeRatio = Math.abs(currCount - baseCount) / baseCount;
      if (changeRatio > 0.5) {
        drifts.push({
          category: "modules",
          type: "size-change",
          items: [`${mod}: ${baseCount} → ${currCount} files (${changeRatio > 0 ? "+" : ""}${Math.round(changeRatio * 100)}%)`],
          severity: changeRatio > 1.0 ? "warning" : "info",
        });
      }
    }
  }

  // API endpoint drift
  const baseApis = new Set(baseline.apiEndpoints || []);
  const currApis = new Set(current.apiEndpoints || []);
  const addedApis = [...currApis].filter(a => !baseApis.has(a));
  const removedApis = [...baseApis].filter(a => !currApis.has(a));
  if (addedApis.length > 0) {
    drifts.push({ category: "api", type: "added", items: addedApis, severity: "info" });
  }
  if (removedApis.length > 0) {
    drifts.push({ category: "api", type: "removed", items: removedApis, severity: "warning" });
  }

  // Page drift
  const basePages = new Set(baseline.pages || []);
  const currPages = new Set(current.pages || []);
  const addedPages = [...currPages].filter(p => !basePages.has(p));
  const removedPages = [...basePages].filter(p => !currPages.has(p));
  if (addedPages.length > 0) {
    drifts.push({ category: "pages", type: "added", items: addedPages, severity: "info" });
  }
  if (removedPages.length > 0) {
    drifts.push({ category: "pages", type: "removed", items: removedPages, severity: "warning" });
  }

  // External dependency drift
  const baseDeps = new Set(baseline.externalDeps || []);
  const currDeps = new Set(current.externalDeps || []);
  const addedDeps = [...currDeps].filter(d => !baseDeps.has(d));
  const removedDeps = [...baseDeps].filter(d => !currDeps.has(d));
  if (addedDeps.length > 0) {
    drifts.push({ category: "dependencies", type: "added", items: addedDeps, severity: "info" });
  }
  if (removedDeps.length > 0) {
    drifts.push({ category: "dependencies", type: "removed", items: removedDeps, severity: "warning" });
  }

  // Framework changes
  const baseFrameworks = new Set(baseline.frameworks || []);
  const currFrameworks = new Set(current.frameworks || []);
  const addedFrameworks = [...currFrameworks].filter(f => !baseFrameworks.has(f));
  const removedFrameworks = [...baseFrameworks].filter(f => !currFrameworks.has(f));
  if (addedFrameworks.length > 0) {
    drifts.push({ category: "frameworks", type: "added", items: addedFrameworks, severity: "info" });
  }
  if (removedFrameworks.length > 0) {
    drifts.push({ category: "frameworks", type: "removed", items: removedFrameworks, severity: "critical" });
  }

  // Circular dependency drift
  const baseCycles = baseline.depGraphCycleCount || 0;
  const currCycles = current.depGraphCycleCount || 0;
  if (currCycles > baseCycles) {
    drifts.push({
      category: "cycles",
      type: "increased",
      items: [`${baseCycles} → ${currCycles} circular dependencies`],
      severity: "warning",
    });
  } else if (currCycles < baseCycles) {
    drifts.push({
      category: "cycles",
      type: "decreased",
      items: [`${baseCycles} → ${currCycles} circular dependencies`],
      severity: "info",
    });
  }

  // GraphQL schema drift
  const baseGqlTypes = new Set(baseline.graphqlTypes || []);
  const currGqlTypes = new Set(current.graphqlTypes || []);
  const addedTypes = [...currGqlTypes].filter(t => !baseGqlTypes.has(t));
  const removedTypes = [...baseGqlTypes].filter(t => !currGqlTypes.has(t));
  if (addedTypes.length > 0 || removedTypes.length > 0) {
    drifts.push({
      category: "graphql",
      type: "schema-changed",
      items: [
        ...(addedTypes.length ? [`+${addedTypes.length} types: ${addedTypes.join(", ")}`] : []),
        ...(removedTypes.length ? [`-${removedTypes.length} types: ${removedTypes.join(", ")}`] : []),
      ],
      severity: removedTypes.length > 0 ? "warning" : "info",
    });
  }

  // Overall file count change
  const baseFiles = baseline.filesCount || 0;
  const currFiles = current.filesCount || 0;
  if (baseFiles > 0 && currFiles > 0) {
    const fileChange = Math.abs(currFiles - baseFiles) / baseFiles;
    if (fileChange > 0.2) {
      drifts.push({
        category: "scale",
        type: "file-count-change",
        items: [`${baseFiles} → ${currFiles} files (${currFiles > baseFiles ? "+" : ""}${Math.round(fileChange * 100)}%)`],
        severity: fileChange > 0.5 ? "warning" : "info",
      });
    }
  }

  const summary = drifts.length === 0
    ? "No architecture drift detected since last baseline."
    : `${drifts.length} drift(s) detected: ${drifts.filter(d => d.severity === "critical").length} critical, ${drifts.filter(d => d.severity === "warning").length} warning(s), ${drifts.filter(d => d.severity === "info").length} informational`;

  if (drifts.length > 0) {
    warn(`Architecture drift: ${summary}`);
  } else {
    info("Architecture drift: no drift detected");
  }

  return {
    hasBaseline: true,
    baselineTimestamp: baseline.timestamp,
    drifts,
    summary,
  };
}
