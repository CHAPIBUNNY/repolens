// Which scanned source files the import graph and code health can read.
// RepoLens detects and scans many languages, but it builds import graphs and scores code
// health only for JavaScript/TypeScript, Python, and Go. A C# or Java repository must not
// get "no circular dependencies" or "health 100/100" from one incidental docs script.

import path from "node:path";
import { LANGUAGE_PROFILES } from "../core/languages.js";
import { isNonProductPath } from "../utils/path-roles.js";

export const ANALYZED_LANGUAGES_TEXT = "JavaScript/TypeScript, Python, and Go";

const ANALYZED_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".py", ".pyw", ".go"]);

// A code-health badge is one number for the whole repository. Below this share of
// product source files in analyzed languages, `repolens badge` refuses to print it.
// The docs still show the partial graph and scores with a coverage note.
export const BADGE_MIN_SHARE = 0.1;

// Vendored or third-party trees are not the repository's own code, in any language.
export const VENDORED_DIRECTORIES = new Set([
  "vendor", "vendored", "third_party", "third-party", "thirdparty", "3rdparty",
  "deps", "external", "extern", "node_modules", "bower_components",
]);

const LABEL_BY_EXTENSION = new Map();
LABEL_BY_EXTENSION.set(".vue", "Vue");
LABEL_BY_EXTENSION.set(".svelte", "Svelte");
for (const profile of LANGUAGE_PROFILES) {
  const label = profile.id === "java" ? "Java/Kotlin" : profile.id === "cpp" ? "C/C++" : profile.label;
  for (const ext of profile.extensions) {
    if (!LABEL_BY_EXTENSION.has(ext)) LABEL_BY_EXTENSION.set(ext, label);
  }
}

function isDeclarationFile(file) {
  return /\.d\.[cm]?ts$/.test(file);
}

export function isVendoredPath(file) {
  const parts = String(file || "").replace(/\\/g, "/").toLowerCase().split("/");
  parts.pop();
  return parts.some((segment) => VENDORED_DIRECTORIES.has(segment));
}

/**
 * Product source = not a test, docs, tooling, example, or vendored path.
 *
 * - "none": no source files in any known language
 * - "full": every product source file is in an analyzed language
 * - "partial": analyzed-language product code exists next to other languages; analysis
 *   runs and every page says what it did not cover
 * - "unsupported": no analyzed-language product code at all (only a docs script, a test
 *   helper, or vendored files); graph and health are not built
 *
 * @param {string[]} files - scanned file paths
 */
export function computeLanguageCoverage(files) {
  let analyzedFiles = 0;
  let analyzedProductFiles = 0;
  let unanalyzedFiles = 0;
  let unanalyzedProductFiles = 0;
  let vendoredFiles = 0;
  let vendoredAnalyzedFiles = 0;
  const byLabelProduct = new Map();
  const byLabelAll = new Map();

  for (const raw of files || []) {
    const file = String(raw).replace(/\\/g, "/");
    if (isDeclarationFile(file)) continue;
    const ext = path.posix.extname(file).toLowerCase();
    const analyzed = ANALYZED_EXTENSIONS.has(ext);
    const label = analyzed ? null : LABEL_BY_EXTENSION.get(ext);
    if (!analyzed && !label) continue;
    if (isVendoredPath(file)) {
      vendoredFiles += 1;
      if (analyzed) vendoredAnalyzedFiles += 1;
      continue;
    }
    const product = !isNonProductPath(file);
    if (analyzed) {
      analyzedFiles += 1;
      if (product) analyzedProductFiles += 1;
      continue;
    }
    unanalyzedFiles += 1;
    byLabelAll.set(label, (byLabelAll.get(label) || 0) + 1);
    if (product) {
      unanalyzedProductFiles += 1;
      byLabelProduct.set(label, (byLabelProduct.get(label) || 0) + 1);
    }
  }

  // Product files decide everything; a tree with no product files at all (only tests,
  // docs, or tooling) falls back to every non-vendored file.
  const useProduct = analyzedProductFiles + unanalyzedProductFiles > 0;
  const analyzedBase = useProduct ? analyzedProductFiles : analyzedFiles;
  const unanalyzedBase = useProduct ? unanalyzedProductFiles : unanalyzedFiles;
  const byLabel = useProduct ? byLabelProduct : byLabelAll;
  const totalBase = analyzedBase + unanalyzedBase;
  const share = totalBase > 0 ? analyzedBase / totalBase : null;

  const unanalyzedLanguages = [...byLabel.entries()]
    .map(([label, count]) => ({ label, files: count }))
    .sort((a, b) => b.files - a.files || a.label.localeCompare(b.label));

  let status;
  if (totalBase === 0) status = "none";
  else if (unanalyzedBase === 0) status = "full";
  else if (analyzedBase === 0) status = "unsupported";
  else status = "partial";

  return {
    status,
    analyzedFiles,
    analyzedProductFiles,
    unanalyzedFiles,
    unanalyzedProductFiles,
    vendoredFiles,
    vendoredAnalyzedFiles,
    productBased: useProduct,
    analyzedBase,
    totalBase,
    unanalyzedLanguages,
    share,
  };
}

/** Whether one code-health number may stand for the repository. */
export function badgeCoverageOk(coverage) {
  if (!coverage) return true;
  if (coverage.status === "full" || coverage.status === "none") return true;
  if (coverage.status === "unsupported") return false;
  return (coverage.share ?? 0) >= BADGE_MIN_SHARE;
}

/**
 * Short qualifier for claims made from the graph ("no circular dependencies"), or "".
 * Partial: " (analyzed files only: 50 of 650 product source files; C/C++ not analyzed)".
 */
export function coverageScope(coverage) {
  if (!coverage || coverage.status !== "partial") return "";
  return ` (analyzed files only: ${coverage.analyzedBase} of ${coverage.totalBase} ${coverage.productBased ? "product " : ""}source files; ${unanalyzedLanguageNames(coverage)} not analyzed)`;
}

/** "C# (780 files)" / "Java/Kotlin (247 files) and C (3 files)". */
export function describeUnanalyzedLanguages(coverage, limit = 3) {
  const list = (coverage?.unanalyzedLanguages || []).slice(0, limit)
    .map(({ label, files }) => `${label} (${files} ${coverage?.productBased ? "product " : ""}file${files === 1 ? "" : "s"})`);
  if (list.length === 0) return "";
  if (list.length === 1) return list[0];
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

/** Short language names only: "C#", "Java/Kotlin and Scala". */
export function unanalyzedLanguageNames(coverage, limit = 3) {
  const list = (coverage?.unanalyzedLanguages || []).slice(0, limit).map(({ label }) => label);
  if (list.length <= 1) return list[0] || "";
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

/**
 * Files an analyzer should read. When the analyzed languages are only incidental
 * (status "unsupported"), none: the graph or score would describe a docs script,
 * not the repository.
 */
export function filesForAnalysis(files, coverage = computeLanguageCoverage(files)) {
  if (coverage.status === "unsupported") return [];
  return files;
}

function verbFor(coverage) {
  return (coverage?.unanalyzedLanguages || []).length > 1 ? "are" : "is";
}

/**
 * Markdown lines that say what a page did not analyze.
 * `what` is "import analysis" or "code health".
 * Returns [] for full coverage or when there is nothing to say.
 */
export function coverageNotice(coverage, what) {
  if (!coverage) return [];
  const langs = describeUnanalyzedLanguages(coverage);
  if (coverage.status === "unsupported") {
    const n = (coverage.analyzedFiles || 0) + (coverage.vendoredAnalyzedFiles || 0);
    const incidental = n > 0
      ? ` ${n === 1 ? "One file" : `${n} files`} in a supported language ${n === 1 ? "was" : "were"} found only in docs, tests, tooling, examples, or vendored directories, so ${n === 1 ? "it was" : "they were"} not ${what === "code health" ? "scored" : "graphed"} as if ${n === 1 ? "it were" : "they were"} the codebase.`
      : "";
    return [
      `> ${langs} ${verbFor(coverage)} not supported for ${what} yet. RepoLens ${what === "code health" ? "scores" : "builds import graphs for"} ${ANALYZED_LANGUAGES_TEXT} only.`,
      "",
      `Modules and file structure for this repository are still documented in the other pages. This is a language limitation, not a problem with your \`scan.include\` patterns.${incidental}`,
      "",
    ];
  }
  if (coverage.status === "partial") {
    const pct = coverage.share != null ? Math.round(coverage.share * 100) : null;
    return [
      `> **Partial coverage:** ${what} covers ${coverage.analyzedBase} of ${coverage.totalBase} ${coverage.productBased ? "product " : ""}source files${pct != null ? ` (${pct}%)` : ""}, the ${ANALYZED_LANGUAGES_TEXT} ones. ${langs} ${verbFor(coverage)} not analyzed, so results below say nothing about ${coverage.unanalyzedLanguages.length > 1 ? "those languages" : "that language"}.`,
      "",
    ];
  }
  return [];
}

/** One plain-text line for logs and the badge CLI. */
export function coverageLine(coverage, what) {
  if (!coverage || (coverage.status !== "unsupported" && coverage.status !== "partial")) return "";
  const langs = describeUnanalyzedLanguages(coverage);
  if (coverage.status === "unsupported") {
    return `${langs} ${verbFor(coverage)} not supported for ${what} yet (${ANALYZED_LANGUAGES_TEXT} only).`;
  }
  return `${what} covers ${ANALYZED_LANGUAGES_TEXT} only; ${langs} ${verbFor(coverage)} not analyzed.`;
}
