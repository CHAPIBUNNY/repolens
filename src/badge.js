import fs from "node:fs/promises";
import path from "node:path";
import { analyzeComplexity, computeCodeHealth } from "./analyzers/complexity-analyzer.js";
import { analyzeDependencyGraph } from "./analyzers/dependency-graph.js";
import { analyzeJSDoc } from "./analyzers/jsdoc-analyzer.js";
import { analyzeSecurityPatterns } from "./analyzers/security-patterns.js";
import { GALLERY_URL, REPO_URL } from "./delivery/comment-constants.js";

const SOURCE_EXT = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".py", ".pyw", ".go"]);
const SKIP_DIR = new Set([
  "node_modules", ".git", "dist", "build", "vendor", "target", "coverage",
  ".repolens", "__pycache__", ".cache",
  "__snapshots__", "samples", "sample", "examples", "example",
  "fixtures", "fixture", "__fixtures__", "e2e-fixtures", "e2e-fixture", "generated",
]);

const COLOR_HEX = {
  brightgreen: "#4c1",
  green: "#97ca00",
  yellow: "#dfb317",
  orange: "#fe7d37",
  red: "#e05d44",
  lightgrey: "#9f9f9f",
};

export function healthColor(score) {
  if (score == null || Number.isNaN(Number(score))) return "lightgrey";
  const value = Number(score);
  if (value >= 80) return "brightgreen";
  if (value >= 60) return "green";
  if (value >= 40) return "yellow";
  if (value >= 20) return "orange";
  return "red";
}

export function shieldsEndpoint({ score, label = "code health" } = {}) {
  const message = score == null || Number.isNaN(Number(score)) ? "n/a" : String(Math.round(Number(score)));
  return {
    schemaVersion: 1,
    label,
    message,
    color: healthColor(score),
  };
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Flat square SVG badge. No rounded corners.
 * The shields.io endpoint JSON is the portable form; this SVG is a direct embed.
 */
export function badgeSvg({ label = "code health", message = "n/a", color = "lightgrey" } = {}) {
  const labelText = String(label).slice(0, 40);
  const valueText = String(message).slice(0, 24);
  const char = 7;
  const pad = 8;
  const labelWidth = pad * 2 + labelText.length * char;
  const valueWidth = pad * 2 + Math.max(valueText.length, 1) * char;
  const height = 20;
  const fill = COLOR_HEX[color] || COLOR_HEX.lightgrey;
  const width = labelWidth + valueWidth;
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" role="img" aria-label="${escapeXml(labelText)}: ${escapeXml(valueText)}">`,
    `  <title>${escapeXml(labelText)}: ${escapeXml(valueText)}</title>`,
    `  <rect width="${labelWidth}" height="${height}" fill="#1565C0"/>`,
    `  <rect x="${labelWidth}" width="${valueWidth}" height="${height}" fill="${fill}"/>`,
    `  <g fill="#ffffff" text-anchor="middle" font-family="Verdana,DejaVu Sans,sans-serif" font-size="11">`,
    `    <text x="${labelWidth / 2}" y="14">${escapeXml(labelText)}</text>`,
    `    <text x="${labelWidth + valueWidth / 2}" y="14">${escapeXml(valueText)}</text>`,
    `  </g>`,
    `</svg>`,
    ``,
  ].join("\n");
}

export function badgeMarkdown({
  endpointUrl,
  linkUrl = REPO_URL,
  label = "code health",
  name,
} = {}) {
  const alt = name ? `${name} ${label}` : label;
  const href = linkUrl || REPO_URL;
  if (!endpointUrl) {
    return `[![${alt}](https://img.shields.io/endpoint?url=BADGE_JSON_URL&style=flat-square)](${href})`;
  }
  const src = `https://img.shields.io/endpoint?url=${encodeURIComponent(endpointUrl)}&style=flat-square`;
  return `[![${alt}](${src})](${href})`;
}

export function compactHealth(health) {
  const files = health?.stats?.totalFiles || 0;
  if (!files) {
    return {
      score: null,
      files: 0,
      summary: health?.summary || "No source files analyzed.",
      grades: health?.stats?.gradeDistribution || null,
      hotspots: [],
    };
  }
  return {
    score: health.stats.avgScore,
    files,
    summary: health.summary,
    grades: health.stats.gradeDistribution,
    hotspots: (health.hotspots || []).slice(0, 12).map((item) => ({
      file: item.file,
      score: item.score,
      grade: item.grade,
    })),
  };
}

export async function listScoreFiles(root, { maxFiles = 2500 } = {}) {
  const out = [];
  const stack = [root];
  let capped = false;
  while (stack.length) {
    if (out.length >= maxFiles) {
      capped = true;
      break;
    }
    const dir = stack.pop();
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIR.has(entry.name)) continue;
        stack.push(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (entry.name.endsWith(".snap")) continue;
      if (!SOURCE_EXT.has(path.extname(entry.name))) continue;
      if (out.length >= maxFiles) {
        capped = true;
        break;
      }
      const rel = path.relative(root, full).replace(/\\/g, "/");
      out.push(rel);
    }
  }
  out.sort();
  return { files: out, capped };
}

export async function scoreRepository(root, { files, maxFiles = 2500 } = {}) {
  let list = files;
  let capped = false;
  if (!list) {
    const walked = await listScoreFiles(root, { maxFiles });
    list = walked.files;
    capped = walked.capped;
  }
  const complexity = await analyzeComplexity(list, root);
  const depGraph = await analyzeDependencyGraph(list, root);
  const jsdoc = await analyzeJSDoc(list, root);
  const security = await analyzeSecurityPatterns(list, root);
  const health = computeCodeHealth(complexity, depGraph, jsdoc, security);
  return { health, depGraph, files: list, capped };
}

function resolveOutPaths(outPath) {
  const target = outPath || "repolens-badge.json";
  if (target.endsWith("/") || target.endsWith(path.sep)) {
    return {
      jsonPath: path.join(target, "repolens-badge.json"),
      svgPath: path.join(target, "repolens-badge.svg"),
    };
  }
  if (target.endsWith(".svg")) {
    return {
      jsonPath: target.replace(/\.svg$/, ".json"),
      svgPath: target,
    };
  }
  if (target.endsWith(".json")) {
    return {
      jsonPath: target,
      svgPath: target.replace(/\.json$/, ".svg"),
    };
  }
  return {
    jsonPath: path.join(target, "repolens-badge.json"),
    svgPath: path.join(target, "repolens-badge.svg"),
  };
}

/**
 * Print or write the code-health badge.
 * Returns a process exit code. JSON goes to stdout unless --out is set.
 */
export async function runBadgeCli({
  target = process.cwd(),
  format = "json",
  out,
  url = "",
  link = "",
  label = "code health",
  name,
} = {}) {
  process.env.REPOLENS_LOG_STDERR = "1";
  const allowed = new Set(["json", "svg", "markdown", "all"]);
  if (!allowed.has(format)) {
    console.error("format must be json, svg, markdown, or all");
    return 2;
  }
  let scored;
  try {
    scored = await scoreRepository(target);
  } catch (error) {
    console.error(error.message || String(error));
    return 1;
  }
  const total = scored.health?.stats?.totalFiles || 0;
  if (!total) {
    console.error("No source files analyzed.");
    console.error("Code health covers JavaScript, TypeScript, Python, and Go. Empty documentation was not scored.");
    return 2;
  }
  const endpoint = shieldsEndpoint({ score: scored.health.stats.avgScore, label });
  const markdown = badgeMarkdown({
    endpointUrl: url || "",
    linkUrl: link || GALLERY_URL,
    label,
    name,
  });
  const svg = badgeSvg(endpoint);
  const json = `${JSON.stringify(endpoint, null, 2)}\n`;

  if (format === "markdown") {
    console.log(markdown);
    return 0;
  }
  if (format === "json" && !out) {
    process.stdout.write(json);
    return 0;
  }
  if (format === "svg" && !out) {
    process.stdout.write(svg);
    return 0;
  }

  const paths = resolveOutPaths(out || "repolens-badge.json");
  await fs.mkdir(path.dirname(path.resolve(paths.jsonPath)), { recursive: true });
  if (format === "json" || format === "all") {
    await fs.writeFile(paths.jsonPath, json);
  }
  if (format === "svg" || format === "all") {
    await fs.writeFile(paths.svgPath, svg);
  }
  if (format === "all" || format === "json" || format === "svg") {
    console.error(`Wrote ${format === "svg" ? paths.svgPath : paths.jsonPath}${format === "all" ? ` and ${paths.svgPath}` : ""}`);
  }
  if (format === "all") {
    console.log(markdown);
    if (!url) {
      console.error("Pass --url (or the badge-url action input) with the public HTTPS URL of the JSON file before embedding the snippet. shields.io fetches that URL.");
    }
  }
  return 0;
}
