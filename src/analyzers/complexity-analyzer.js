// Complexity & Code Health analyzer
// Computes per-file cyclomatic complexity, then synthesizes all analyzers
// (dep graph, JSDoc, security) into a per-module health score.

import fs from "node:fs/promises";
import path from "node:path";
import { info } from "../utils/logger.js";

const JS_EXTENSIONS = [".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx"];

// Skip test files, build outputs, etc.
const SKIP_PATTERNS = [
  /node_modules\//,
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /\btest[s]?\//,
  /\bdist\//,
  /\bbuild\//,
  /\.min\.[jt]s$/,
  /\.d\.ts$/,
  /\.repolens\//,
];

function shouldSkip(filePath) {
  return SKIP_PATTERNS.some(p => p.test(filePath));
}

/**
 * Count cyclomatic complexity for a source string.
 * Each decision point adds 1 to the baseline of 1.
 */
export function computeComplexity(source) {
  // Strip comments to avoid false positives
  let stripped = source.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, " "));
  stripped = stripped.replace(/(?<!:)\/\/.*$/gm, "");
  // Strip string literals to avoid matching keywords inside strings
  stripped = stripped.replace(/`[^`]*`/g, '""');
  stripped = stripped.replace(/"(?:[^"\\]|\\.)*"/g, '""');
  stripped = stripped.replace(/'(?:[^'\\]|\\.)*'/g, "''");

  let complexity = 1; // baseline

  // Decision point patterns
  const patterns = [
    /\bif\s*\(/g,
    /\belse\s+if\s*\(/g,
    /\bfor\s*\(/g,
    /\bwhile\s*\(/g,
    /\bcase\s+/g,
    /\bcatch\s*\(/g,
    /(?<!\?)\?\s*(?![.?])/g,   // ternary ? but not optional chaining ?. or nullish ??
    /&&/g,
    /\|\|/g,
    /\?\?/g,                 // nullish coalescing
  ];

  for (const pattern of patterns) {
    const matches = stripped.match(pattern);
    if (matches) complexity += matches.length;
  }

  // Subtract double-counted else-if (already counted by if)
  const elseIfMatches = stripped.match(/\belse\s+if\s*\(/g);
  if (elseIfMatches) complexity -= elseIfMatches.length;

  return complexity;
}

/**
 * Extract function-level complexity from source code.
 * Returns per-function complexity for the top-level functions.
 */
export function extractFunctions(source) {
  const functions = [];
  const lines = source.split("\n");

  // Match exported/declared function signatures
  const funcPattern = /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/g;
  const arrowPattern = /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|\w+)\s*=>/g;

  let match;

  while ((match = funcPattern.exec(source)) !== null) {
    const startLine = source.slice(0, match.index).split("\n").length;
    functions.push({ name: match[1], line: startLine, index: match.index });
  }

  while ((match = arrowPattern.exec(source)) !== null) {
    const startLine = source.slice(0, match.index).split("\n").length;
    functions.push({ name: match[1], line: startLine, index: match.index });
  }

  // Sort by position in file
  functions.sort((a, b) => a.index - b.index);

  // Compute complexity for each function's body (approximation: from start to next function)
  const results = [];
  for (let i = 0; i < functions.length; i++) {
    const start = functions[i].index;
    const end = i + 1 < functions.length ? functions[i + 1].index : source.length;
    const body = source.slice(start, end);
    const complexity = computeComplexity(body);
    results.push({
      name: functions[i].name,
      line: functions[i].line,
      complexity,
    });
  }

  return results;
}

/**
 * Analyze complexity for all JS/TS files in the project.
 * @param {string[]} files - File paths relative to repoRoot
 * @param {string} repoRoot - Absolute path to repo root
 * @returns {Promise<Object>} Complexity analysis results
 */
export async function analyzeComplexity(files, repoRoot) {
  const jsFiles = files
    .filter(f => JS_EXTENSIONS.some(ext => f.endsWith(ext)))
    .filter(f => !shouldSkip(f));

  const result = {
    files: [],
    functions: [],
    filesAnalyzed: jsFiles.length,
  };

  for (const file of jsFiles) {
    let content;
    try {
      content = await fs.readFile(path.join(repoRoot, file), "utf8");
    } catch {
      continue;
    }

    const fileComplexity = computeComplexity(content);
    const lineCount = content.split("\n").length;
    const funcs = extractFunctions(content);

    result.files.push({
      file,
      complexity: fileComplexity,
      lines: lineCount,
      functions: funcs.length,
      maxFunctionComplexity: funcs.length > 0 ? Math.max(...funcs.map(f => f.complexity)) : fileComplexity,
    });

    for (const fn of funcs) {
      result.functions.push({ ...fn, file });
    }
  }

  return result;
}

/**
 * Synthesize signals from all analyzers into per-module health scores.
 *
 * Health score (0–100) is computed from:
 *   - Complexity penalty: high cyclomatic complexity
 *   - Coupling penalty: high fan-in * fan-out product
 *   - Documentation bonus: JSDoc coverage
 *   - Security penalty: findings in this file
 *
 * @param {Object} complexityResult - From analyzeComplexity()
 * @param {Object} depGraph - From analyzeDependencyGraph()
 * @param {Object} jsdocResult - From analyzeJSDoc()
 * @param {Object} securityResult - From analyzeSecurityPatterns()
 * @returns {Object} Code health report
 */
export function computeCodeHealth(complexityResult, depGraph, jsdocResult, securityResult) {
  const modules = [];

  // Build lookup maps
  const depMap = new Map();
  if (depGraph?.nodes) {
    for (const node of depGraph.nodes) {
      depMap.set(node.file, {
        fanIn: node.importedBy?.length || 0,
        fanOut: node.imports?.length || 0,
      });
    }
  }

  const securityByFile = new Map();
  if (securityResult?.findings) {
    for (const finding of securityResult.findings) {
      if (!securityByFile.has(finding.file)) securityByFile.set(finding.file, []);
      securityByFile.get(finding.file).push(finding);
    }
  }

  const jsdocByFile = new Map();
  if (jsdocResult?.byFile) {
    for (const [file, exports] of Object.entries(jsdocResult.byFile)) {
      const total = exports.length;
      const documented = exports.filter(e => e.jsdoc != null).length;
      jsdocByFile.set(file, { total, documented, coverage: total > 0 ? documented / total : 1 });
    }
  }

  for (const fileInfo of complexityResult.files) {
    const { file, complexity, lines, maxFunctionComplexity } = fileInfo;

    // Coupling
    const dep = depMap.get(file) || { fanIn: 0, fanOut: 0 };
    const coupling = dep.fanIn * dep.fanOut;

    // Documentation coverage (default 100% if not tracked)
    const docInfo = jsdocByFile.get(file) || { total: 0, documented: 0, coverage: 1 };

    // Security findings
    const findings = securityByFile.get(file) || [];
    const highFindings = findings.filter(f => f.severity === "high").length;
    const mediumFindings = findings.filter(f => f.severity === "medium").length;

    // Score calculation (0–100, higher is healthier)
    let score = 100;

    // Complexity penalty: -1 per complexity point above 10, -2 above 30
    if (complexity > 10) score -= Math.min(25, (complexity - 10) * 1);
    if (complexity > 30) score -= Math.min(15, (complexity - 30) * 2);

    // Max function complexity penalty: -2 per point above 8
    if (maxFunctionComplexity > 8) score -= Math.min(15, (maxFunctionComplexity - 8) * 2);

    // Coupling penalty: penalize files with high fan-in AND fan-out
    if (coupling > 20) score -= Math.min(15, Math.floor((coupling - 20) / 5));

    // Documentation bonus/penalty
    if (docInfo.total > 0) {
      if (docInfo.coverage < 0.5) score -= 10;
      else if (docInfo.coverage < 0.8) score -= 5;
    }

    // Security penalty
    score -= highFindings * 10;
    score -= mediumFindings * 5;

    score = Math.max(0, Math.min(100, score));

    const grade = score >= 80 ? "A" : score >= 60 ? "B" : score >= 40 ? "C" : score >= 20 ? "D" : "F";

    modules.push({
      file,
      score,
      grade,
      lines,
      complexity,
      maxFunctionComplexity,
      fanIn: dep.fanIn,
      fanOut: dep.fanOut,
      coupling,
      docCoverage: docInfo.total > 0 ? Math.round(docInfo.coverage * 100) : null,
      securityFindings: findings.length,
      highSecurityFindings: highFindings,
    });
  }

  // Sort by score ascending (worst first)
  modules.sort((a, b) => a.score - b.score);

  // Aggregate stats
  const totalFiles = modules.length;
  const avgScore = totalFiles > 0 ? Math.round(modules.reduce((s, m) => s + m.score, 0) / totalFiles) : 100;
  const avgComplexity = totalFiles > 0 ? Math.round(modules.reduce((s, m) => s + m.complexity, 0) / totalFiles) : 0;

  const gradeDistribution = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  for (const m of modules) gradeDistribution[m.grade]++;

  const topComplexFunctions = [...complexityResult.functions]
    .sort((a, b) => b.complexity - a.complexity)
    .slice(0, 15);

  const hotspots = modules.filter(m => m.score < 60).slice(0, 20);

  const summary = totalFiles > 0
    ? `${totalFiles} files analyzed · Average health: ${avgScore}/100 · ${gradeDistribution.A} A, ${gradeDistribution.B} B, ${gradeDistribution.C} C, ${gradeDistribution.D} D, ${gradeDistribution.F} F`
    : "No source files analyzed.";

  info(`Code health: avg ${avgScore}/100 across ${totalFiles} files (${hotspots.length} hotspots)`);

  return {
    modules,
    summary,
    stats: {
      totalFiles,
      avgScore,
      avgComplexity,
      gradeDistribution,
    },
    hotspots,
    topComplexFunctions,
  };
}
