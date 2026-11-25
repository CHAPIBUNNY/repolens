// Complexity & Code Health analyzer
// Computes per-file cyclomatic complexity, then synthesizes all analyzers
// (dep graph, JSDoc, security) into a per-module health score.

import fs from "node:fs/promises";
import { computeLanguageCoverage, coverageLine, filesForAnalysis, unanalyzedLanguageNames } from "./language-coverage.js";
import { excludeDocsSiteFiles } from "../core/docs-site.js";
import path from "node:path";
import { info } from "../utils/logger.js";
import { isTestPath } from "../utils/path-roles.js";
import { stripCLike, isJavaMetadataFile, isGeneratedCSharpFile } from "./java-csharp.js";

const LANGUAGE_BY_EXTENSION = {
  ".js": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".ts": "javascript",
  ".tsx": "javascript",
  ".jsx": "javascript",
  ".py": "python",
  ".pyw": "python",
  ".go": "go",
  ".java": "java",
  ".cs": "csharp",
};

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
  /__pycache__\//,
  /(?:^|\/)test_[^/]*\.py$/,
  /_test\.py$/,
  /_test\.go$/,
];

function shouldSkip(filePath) {
  if (SKIP_PATTERNS.some(p => p.test(filePath))) return true;
  // Java and C#: test source sets and projects (`src/test/java`, `Foo.Tests/`, `BarTest.java`),
  // package/module descriptors, and generated C#.
  const language = languageForFile(filePath);
  if (language === "java") return isTestPath(filePath) || isJavaMetadataFile(filePath);
  if (language === "csharp") return isTestPath(filePath) || isGeneratedCSharpFile(filePath);
  return false;
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

function blankExceptNewlines(match) {
  return match.replace(/[^\n]/g, " ");
}

function stripPythonNoise(source) {
  let stripped = source.replace(/"""[\s\S]*?"""/g, blankExceptNewlines);
  stripped = stripped.replace(/'''[\s\S]*?'''/g, blankExceptNewlines);
  stripped = stripped.replace(/"(?:[^"\\\n]|\\.)*"/g, '""');
  stripped = stripped.replace(/'(?:[^'\\\n]|\\.)*'/g, "''");
  stripped = stripped.replace(/#.*$/gm, "");
  return stripped;
}

function stripGoNoise(source) {
  let stripped = source.replace(/`[^`]*`/g, blankExceptNewlines);
  stripped = stripped.replace(/"(?:[^"\\\n]|\\.)*"/g, '""');
  stripped = stripped.replace(/'(?:[^'\\\n]|\\.)*'/g, "''");
  stripped = stripped.replace(/\/\*[\s\S]*?\*\//g, blankExceptNewlines);
  stripped = stripped.replace(/\/\/.*$/gm, "");
  return stripped;
}

/**
 * Cyclomatic complexity for Python. Regex approximation: if, elif, for,
 * while, except, and, or. Comments and strings are ignored.
 */
export function computePythonComplexity(source) {
  const stripped = stripPythonNoise(source);
  let complexity = 1;
  const patterns = [
    /\bif\b/g,
    /\belif\b/g,
    /\bfor\b/g,
    /\bwhile\b/g,
    /\bexcept\b/g,
    /\band\b/g,
    /\bor\b/g,
  ];
  for (const pattern of patterns) {
    const matches = stripped.match(pattern);
    if (matches) complexity += matches.length;
  }
  return complexity;
}

/**
 * Cyclomatic complexity for Go. Regex approximation: if, for, case
 * (switch and select branches), &&, and ||. Comments and strings are ignored.
 */
export function computeGoComplexity(source) {
  const stripped = stripGoNoise(source);
  let complexity = 1;
  const patterns = [
    /\bif\b/g,
    /\bfor\b/g,
    /\bcase\b/g,
    /&&/g,
    /\|\|/g,
  ];
  for (const pattern of patterns) {
    const matches = stripped.match(pattern);
    if (matches) complexity += matches.length;
  }
  return complexity;
}

/**
 * Cyclomatic complexity for Java and C#. Regex approximation: if, for, foreach, while,
 * case, catch, the conditional operator, &&, ||, and ?? (C#). Comments, strings, and C#
 * preprocessor lines are ignored. Generic wildcards (`List<?>`, `? extends T`) and
 * nullable types (`int?`, `a?.b`) are not conditionals.
 */
export function computeCLikeComplexity(source, lang = "java") {
  const stripped = stripCLike(source, lang);
  let complexity = 1;
  const patterns = [
    /\bif\s*\(/g,
    /\bfor\s*\(/g,
    /\bforeach\s*\(/g,
    /\bwhile\s*\(/g,
    /\bcase\b/g,
    /\bcatch\b/g,
    /&&/g,
    /\|\|/g,
    // Conditional operator: whitespace before `?`, not `?.`, `??`, or `?[`, and not a
    // generic wildcard (`<?`, `, ?`).
    /(?<=[\w)\]])\s+\?(?![?.[>,)])\s/g,
  ];
  if (lang === "csharp") patterns.push(/\?\?/g);
  for (const pattern of patterns) {
    const matches = stripped.match(pattern);
    if (matches) complexity += matches.length;
  }
  return complexity;
}

// Names that look like `name(` but are statements or operators, not methods.
const CLIKE_NOT_METHODS = new Set([
  "if", "for", "while", "switch", "catch", "return", "new", "throw", "else", "try", "do", "case",
  "this", "super", "base", "default",
]);
const NOT_METHODS_BY_LANGUAGE = {
  java: new Set(["synchronized", "assert"]),
  csharp: new Set(["foreach", "using", "lock", "fixed", "checked", "unchecked", "nameof", "typeof", "sizeof", "await", "yield", "when"]),
};

// A word before the name that makes the line a statement (`return foo(`, `new Foo(`), not
// a declaration. Modifiers such as `default` (Java interface methods) and `synchronized`
// are declarations.
const CLIKE_STATEMENT_WORDS = new Set([
  "return", "new", "throw", "else", "await", "yield", "case", "in", "is", "as", "when", "goto",
  "if", "while", "for", "foreach", "using", "lock",
]);

/**
 * Java and C# methods and constructors: a declaration (`[modifiers] [type] Name(...)`)
 * followed by a body `{` or an expression body `=>`, not a call or a control statement.
 */
export function extractCLikeFunctions(source, lang = "java") {
  const stripped = stripCLike(source, lang);
  const re = /^[ \t]*((?:[@\w<>[\],.?]+[ \t]+)+)([A-Za-z_$][\w$]*)[ \t]*(?:<[^()\n]*>)?[ \t]*\(/gm;
  const found = [];
  let match;
  let lineCursor = 0;
  let lineNumber = 1;
  while ((match = re.exec(stripped)) !== null) {
    const name = match[2];
    let prefix = match[1];
    for (let k = 0; k < 5 && /<[^<>]*>/.test(prefix); k += 1) prefix = prefix.replace(/<[^<>]*>/g, "");
    const prefixTokens = prefix.trim().split(/\s+/).filter(Boolean);
    if (CLIKE_NOT_METHODS.has(name) || NOT_METHODS_BY_LANGUAGE[lang]?.has(name)) continue;
    if (prefixTokens.some((t) => CLIKE_STATEMENT_WORDS.has(t))) continue;
    if (prefixTokens.some((t) => /^(class|interface|enum|record|struct|namespace|delegate|event)$/.test(t))) continue;
    // Find the matching `)` and look at what follows.
    let depth = 0;
    let i = match.index + match[0].length - 1;
    for (; i < stripped.length; i += 1) {
      const ch = stripped[i];
      if (ch === "(") depth += 1;
      else if (ch === ")") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    const rest = stripped.slice(i + 1, i + 400);
    const tail = rest.match(/^\s*(?:throws\s+[\w.,\s<>]+?|where\s+[^{;]+?|:\s*(?:base|this)\s*\([^)]*\))?\s*(\{|=>)/);
    if (!tail) continue;
    // Line number, counted incrementally (a slice per method is quadratic on big files).
    for (; lineCursor < match.index; lineCursor += 1) if (stripped.charCodeAt(lineCursor) === 10) lineNumber += 1;
    found.push({ name, line: lineNumber, index: match.index });
  }
  found.sort((a, b) => a.index - b.index);
  return found.map((fn, idx) => {
    const end = idx + 1 < found.length ? found[idx + 1].index : source.length;
    return { name: fn.name, line: fn.line, complexity: computeCLikeComplexity(source.slice(fn.index, end), lang) };
  });
}

function languageForFile(file) {
  return LANGUAGE_BY_EXTENSION[path.extname(file).toLowerCase()] || null;
}

function complexityForLanguage(language, source) {
  if (language === "python") return computePythonComplexity(source);
  if (language === "go") return computeGoComplexity(source);
  if (language === "java" || language === "csharp") return computeCLikeComplexity(source, language);
  return computeComplexity(source);
}

function collectFunctions(source, pattern, nameGroup, complexityFn) {
  const functions = [];
  let match;
  while ((match = pattern.exec(source)) !== null) {
    const startLine = source.slice(0, match.index).split("\n").length;
    functions.push({ name: match[nameGroup], line: startLine, index: match.index });
  }
  functions.sort((a, b) => a.index - b.index);
  return functions.map((fn, i) => {
    const end = i + 1 < functions.length ? functions[i + 1].index : source.length;
    return {
      name: fn.name,
      line: fn.line,
      complexity: complexityFn(source.slice(fn.index, end)),
    };
  });
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

/** Python `def` / `async def` names and their approximate complexity. */
export function extractPythonFunctions(source) {
  return collectFunctions(
    source,
    /^[ \t]*(?:async[ \t]+)?def[ \t]+(\w+)[ \t]*\(/gm,
    1,
    computePythonComplexity,
  );
}

/** Go `func Name` and `func (recv) Name` declarations. */
export function extractGoFunctions(source) {
  return collectFunctions(
    source,
    /^func[ \t]+(?:\([^)\n]*\)[ \t]+)?(\w+)[ \t]*\(/gm,
    1,
    computeGoComplexity,
  );
}

function functionsForLanguage(language, source) {
  if (language === "python") return extractPythonFunctions(source);
  if (language === "go") return extractGoFunctions(source);
  if (language === "java" || language === "csharp") return extractCLikeFunctions(source, language);
  return extractFunctions(source);
}

/**
 * Analyze complexity for JavaScript/TypeScript, Python, Go, Java, and C# files.
 * @param {string[]} files - File paths relative to repoRoot
 * @param {string} repoRoot - Absolute path to repo root
 * @returns {Promise<Object>} Complexity analysis results
 */
export async function analyzeComplexity(files, repoRoot, { coverageFiles = files } = {}) {
  const scoped = await excludeDocsSiteFiles(files, repoRoot);
  const coverageScoped = coverageFiles === files
    ? scoped
    : await excludeDocsSiteFiles(coverageFiles || files, repoRoot);
  files = scoped.files;
  const coverage = computeLanguageCoverage(coverageScoped.files);
  const sourceFiles = filesForAnalysis(files, coverage)
    .filter(f => languageForFile(f))
    .filter(f => !shouldSkip(f));

  const result = {
    files: [],
    functions: [],
    filesAnalyzed: sourceFiles.length,
    coverage,
  };

  for (const file of sourceFiles) {
    let content;
    try {
      content = await fs.readFile(path.join(repoRoot, file), "utf8");
    } catch {
      continue;
    }

    const language = languageForFile(file);
    const fileComplexity = complexityForLanguage(language, content);
    const lineCount = content.split("\n").length;
    const funcs = functionsForLanguage(language, content);

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
  const avgScore = totalFiles > 0 ? Math.round(modules.reduce((s, m) => s + m.score, 0) / totalFiles) : null;
  const avgComplexity = totalFiles > 0 ? Math.round(modules.reduce((s, m) => s + m.complexity, 0) / totalFiles) : 0;

  const gradeDistribution = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  for (const m of modules) gradeDistribution[m.grade]++;

  const topComplexFunctions = [...complexityResult.functions]
    .sort((a, b) => b.complexity - a.complexity)
    .slice(0, 15);

  const hotspots = modules.filter(m => m.score < 60).slice(0, 20);

  const coverage = complexityResult.coverage || null;
  let summary = totalFiles > 0
    ? `${totalFiles} files analyzed · Average health: ${avgScore}/100 · ${gradeDistribution.A} A, ${gradeDistribution.B} B, ${gradeDistribution.C} C, ${gradeDistribution.D} D, ${gradeDistribution.F} F`
    : "No source files analyzed.";
  if (totalFiles > 0 && coverage?.status === "partial") {
    summary += ` · ${unanalyzedLanguageNames(coverage)} not scored`;
  }
  if (totalFiles === 0 && coverage?.status === "unsupported") {
    summary = `Not scored: ${coverageLine(coverage, "code health")}`;
  }

  if (totalFiles === 0 && coverage?.status === "unsupported") {
    info(`Code health: not scored — ${coverageLine(coverage, "code health")}`);
  } else if (totalFiles === 0) {
    info("Code health: no source files analyzed.");
  } else {
    info(`Code health: avg ${avgScore}/100 across ${totalFiles} files (${hotspots.length} hotspots)`);
  }

  return {
    modules,
    summary,
    coverage,
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
