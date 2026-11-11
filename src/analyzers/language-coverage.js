// Which scanned source files the import graph and code health can read.
// RepoLens detects and scans many languages, but it builds import graphs and scores code
// health only for JavaScript/TypeScript, Python, and Go. A C# or Java repository must not
// get "no circular dependencies" or "health 100/100" from one incidental docs script.

import path from "node:path";
import { LANGUAGE_PROFILES } from "../core/languages.js";
import { isNonProductPath } from "../utils/path-roles.js";

export const ANALYZED_LANGUAGES_TEXT = "JavaScript/TypeScript, Python, and Go";

const ANALYZED_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".py", ".pyw", ".go"]);

// Below this share of product source files, analyzed-language files are incidental
// (a docs script, a build helper) and do not stand for the repository.
export const INCIDENTAL_SHARE = 0.1;

const LABEL_BY_EXTENSION = new Map();
LABEL_BY_EXTENSION.set(".vue", "Vue");
LABEL_BY_EXTENSION.set(".svelte", "Svelte");
// Vue and Svelte components sit next to JavaScript/TypeScript that is analyzed, so they
// never make the analyzed files "incidental" on their own.
const COMPANION_LABELS = new Set(["Vue", "Svelte"]);
for (const profile of LANGUAGE_PROFILES) {
  const label = profile.id === "java" ? "Java/Kotlin" : profile.id === "cpp" ? "C/C++" : profile.label;
  for (const ext of profile.extensions) {
    if (!LABEL_BY_EXTENSION.has(ext)) LABEL_BY_EXTENSION.set(ext, label);
  }
}

function isDeclarationFile(file) {
  return /\.d\.[cm]?ts$/.test(file);
}

/**
 * @param {string[]} files - scanned file paths
 * @returns {{
 *   status: "none" | "full" | "partial" | "unsupported",
 *   analyzedFiles: number, analyzedProductFiles: number,
 *   unanalyzedFiles: number, unanalyzedProductFiles: number,
 *   unanalyzedLanguages: { label: string, files: number }[],
 *   share: number | null,
 * }}
 */
export function computeLanguageCoverage(files) {
  let analyzedFiles = 0;
  let analyzedProductFiles = 0;
  let unanalyzedFiles = 0;
  let unanalyzedProductFiles = 0;
  let foreignFiles = 0;
  let foreignProductFiles = 0;
  const byLabel = new Map();

  for (const raw of files || []) {
    const file = String(raw).replace(/\\/g, "/");
    if (isDeclarationFile(file)) continue;
    const ext = path.posix.extname(file).toLowerCase();
    const product = !isNonProductPath(file);
    if (ANALYZED_EXTENSIONS.has(ext)) {
      analyzedFiles += 1;
      if (product) analyzedProductFiles += 1;
      continue;
    }
    const label = LABEL_BY_EXTENSION.get(ext);
    if (!label) continue;
    unanalyzedFiles += 1;
    if (product) unanalyzedProductFiles += 1;
    if (!COMPANION_LABELS.has(label)) {
      foreignFiles += 1;
      if (product) foreignProductFiles += 1;
    }
    byLabel.set(label, (byLabel.get(label) || 0) + 1);
  }

  const unanalyzedLanguages = [...byLabel.entries()]
    .map(([label, count]) => ({ label, files: count }))
    .sort((a, b) => b.files - a.files || a.label.localeCompare(b.label));

  // Product files decide the share; when every file is test/docs/tooling, use all files.
  const useProduct = analyzedProductFiles + unanalyzedProductFiles > 0;
  const analyzedBase = useProduct ? analyzedProductFiles : analyzedFiles;
  const unanalyzedBase = useProduct ? unanalyzedProductFiles : unanalyzedFiles;
  const foreignBase = useProduct ? foreignProductFiles : foreignFiles;
  const totalBase = analyzedBase + unanalyzedBase;
  const share = totalBase > 0 ? analyzedBase / totalBase : null;

  let status;
  if (analyzedFiles + unanalyzedFiles === 0) status = "none";
  else if (unanalyzedFiles === 0) status = "full";
  else if (analyzedBase === 0) status = "unsupported";
  else if (share < INCIDENTAL_SHARE && foreignBase * 2 >= unanalyzedBase) status = "unsupported";
  else status = "partial";

  return {
    status,
    analyzedFiles,
    analyzedProductFiles,
    unanalyzedFiles,
    unanalyzedProductFiles,
    unanalyzedLanguages,
    share,
  };
}

/** "C# (780 files)" / "Java/Kotlin (247 files) and C (3 files)". */
export function describeUnanalyzedLanguages(coverage, limit = 3) {
  const list = (coverage?.unanalyzedLanguages || []).slice(0, limit)
    .map(({ label, files }) => `${label} (${files} file${files === 1 ? "" : "s"})`);
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
    const n = coverage.analyzedFiles;
    const incidental = n > 0
      ? ` ${n === 1 ? "One file" : `${n} files`} in a supported language ${n === 1 ? "was" : "were"} found, but ${n === 1 ? "it is" : "they are"} incidental (docs, tooling, tests, or a small share of the code), so ${n === 1 ? "it was" : "they were"} not scored as if ${n === 1 ? "it were" : "they were"} the codebase.`
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
      `> **Partial coverage:** ${what} covers the ${ANALYZED_LANGUAGES_TEXT} files only${pct != null ? ` (about ${pct}% of product source files)` : ""}. ${langs} ${verbFor(coverage)} not analyzed, so results below do not include ${coverage.unanalyzedLanguages.length > 1 ? "those languages" : "that language"}.`,
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
