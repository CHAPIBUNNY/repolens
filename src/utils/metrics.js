/**
 * Metrics Collection for RepoLens
 * Calculates coverage, health scores, staleness, section completeness, and quality issues
 */

import fs from "node:fs/promises";
import path from "node:path";
import { info, warn } from "./logger.js";

/** All possible document keys that RepoLens can generate */
const ALL_DOCUMENT_KEYS = [
  "system_overview",
  "module_catalog",
  "api_surface",
  "route_map",
  "system_map",
  "arch_diff",
  "executive_summary",
  "business_domains",
  "architecture_overview",
  "data_flows",
  "change_impact",
  "developer_onboarding",
  "graphql_schema",
  "type_graph",
  "dependency_graph",
  "architecture_drift",
];

/**
 * Calculate documentation coverage
 * @param {object} scanResult - Repository scan result
 * @param {object} docs - Generated documentation
 * @returns {object} - Coverage metrics
 */
export function calculateCoverage(scanResult, docs) {
  const { modules = [], api = [], pages = [], filesCount = 0 } = scanResult;

  // Module coverage: modules with descriptions vs total
  const modulesWithDocs = modules.filter((m) => m.description || m.files?.length > 0).length;
  const moduleCoverage = modules.length > 0 ? (modulesWithDocs / modules.length) * 100 : 0;

  // API coverage: endpoints with descriptions vs total
  const apisWithDocs = api.filter((a) => a.description || a.method).length;
  const apiCoverage = api.length > 0 ? (apisWithDocs / api.length) * 100 : 100;

  // Page coverage: pages with descriptions vs total
  const pagesWithDocs = pages.filter((p) => p.description || p.component).length;
  const pageCoverage = pages.length > 0 ? (pagesWithDocs / pages.length) * 100 : 100;

  // Overall coverage (weighted average)
  const weights = {
    modules: 0.5,
    api: 0.3,
    pages: 0.2,
  };

  const overallCoverage =
    moduleCoverage * weights.modules +
    apiCoverage * weights.api +
    pageCoverage * weights.pages;

  return {
    overall: overallCoverage,
    modules: moduleCoverage,
    api: apiCoverage,
    pages: pageCoverage,
    counts: {
      modules: modules.length,
      modulesDocumented: modulesWithDocs,
      api: api.length,
      apiDocumented: apisWithDocs,
      pages: pages.length,
      pagesDocumented: pagesWithDocs,
      files: filesCount,
    },
  };
}

/**
 * Calculate health score (0-100)
 * Weights: coverage 35%, freshness 25%, quality 25%, section completeness 15%
 * @param {object} metrics - All metrics data
 * @returns {number} - Health score
 */
export function calculateHealthScore(metrics) {
  const { coverage, freshness, quality, sectionCompleteness } = metrics;

  const coverageScore = coverage.overall * 0.35;
  const freshnessScore = freshness.score * 0.25;
  const qualityScore = quality.score * 0.25;
  const completenessScore = (sectionCompleteness?.percentage || 0) * 0.15;

  const healthScore = coverageScore + freshnessScore + qualityScore + completenessScore;

  return Math.round(Math.min(100, Math.max(0, healthScore)));
}

/**
 * Detect stale documentation
 * @param {string} docsPath - Path to documentation directory
 * @param {number} staleThreshold - Days before considering stale (default: 90)
 * @returns {Promise<object>} - Freshness metrics
 */
export async function detectStaleness(docsPath, staleThreshold = 90) {
  try {
    const now = Date.now();
    const staleMs = staleThreshold * 24 * 60 * 60 * 1000;

    // Check if docs directory exists
    try {
      await fs.access(docsPath);
    } catch {
      // No docs yet
      return {
        lastUpdated: null,
        daysSinceUpdate: null,
        isStale: true,
        score: 0,
        files: [],
      };
    }

    // Read all markdown files
    const files = await fs.readdir(docsPath);
    const mdFiles = files.filter((f) => f.endsWith(".md"));

    if (mdFiles.length === 0) {
      return {
        lastUpdated: null,
        daysSinceUpdate: null,
        isStale: true,
        score: 0,
        files: [],
      };
    }

    // Get modification times
    const fileStats = await Promise.all(
      mdFiles.map(async (file) => {
        const filePath = path.join(docsPath, file);
        const stats = await fs.stat(filePath);
        return {
          file,
          mtime: stats.mtime.getTime(),
          daysSince: Math.floor((now - stats.mtime.getTime()) / (24 * 60 * 60 * 1000)),
        };
      })
    );

    // Find most recently updated file
    const newest = fileStats.reduce((a, b) => (a.mtime > b.mtime ? a : b));
    const daysSinceUpdate = newest.daysSince;
    const isStale = daysSinceUpdate > staleThreshold;

    // Calculate freshness score (100 at 0 days, 0 at staleThreshold days)
    const score = Math.max(0, 100 - (daysSinceUpdate / staleThreshold) * 100);

    // Find stale files
    const staleFiles = fileStats.filter((f) => f.daysSince > staleThreshold);

    return {
      lastUpdated: new Date(newest.mtime),
      daysSinceUpdate,
      isStale,
      score: Math.round(score),
      staleFiles: staleFiles.map((f) => ({
        file: f.file,
        daysSince: f.daysSince,
      })),
    };
  } catch (err) {
    warn(`Failed to detect staleness: ${err.message}`);
    return {
      lastUpdated: null,
      daysSinceUpdate: null,
      isStale: true,
      score: 0,
      staleFiles: [],
    };
  }
}

/**
 * Find quality issues
 * @param {object} scanResult - Repository scan result
 * @param {object} docs - Generated documentation
 * @returns {object} - Quality analysis
 */
export function analyzeQuality(scanResult, docs) {
  const issues = [];
  const { modules = [], api = [], pages = [] } = scanResult;

  // Check for undocumented modules
  const undocumentedModules = modules.filter((m) => !m.description && m.files?.length > 0);
  if (undocumentedModules.length > 0) {
    issues.push({
      type: "undocumented_modules",
      severity: "medium",
      count: undocumentedModules.length,
      message: `${undocumentedModules.length} modules lack descriptions`,
      items: undocumentedModules.slice(0, 5).map((m) => m.name || m.path),
    });
  }

  // Check for undocumented APIs
  const undocumentedApis = api.filter((a) => !a.description && !a.handler);
  if (undocumentedApis.length > 0) {
    issues.push({
      type: "undocumented_apis",
      severity: "high",
      count: undocumentedApis.length,
      message: `${undocumentedApis.length} API endpoints lack documentation`,
      items: undocumentedApis.slice(0, 5).map((a) => `${a.method || "GET"} ${a.path}`),
    });
  }

  // Check for undocumented pages
  const undocumentedPages = pages.filter((p) => !p.description && !p.component);
  if (undocumentedPages.length > 0) {
    issues.push({
      type: "undocumented_pages",
      severity: "low",
      count: undocumentedPages.length,
      message: `${undocumentedPages.length} pages lack descriptions`,
      items: undocumentedPages.slice(0, 5).map((p) => p.path),
    });
  }

  // Check for empty modules
  const emptyModules = modules.filter((m) => !m.files || m.files.length === 0);
  if (emptyModules.length > 0) {
    issues.push({
      type: "empty_modules",
      severity: "low",
      count: emptyModules.length,
      message: `${emptyModules.length} modules contain no files`,
      items: emptyModules.slice(0, 5).map((m) => m.name || m.path),
    });
  }

  // Calculate quality score (100 - penalty for issues)
  const penalties = {
    high: 10,
    medium: 5,
    low: 2,
  };

  const totalPenalty = issues.reduce((sum, issue) => {
    return sum + penalties[issue.severity] * Math.min(issue.count, 5);
  }, 0);

  const score = Math.max(0, 100 - totalPenalty);

  return {
    score: Math.round(score),
    issues,
    summary: {
      total: issues.length,
      high: issues.filter((i) => i.severity === "high").length,
      medium: issues.filter((i) => i.severity === "medium").length,
      low: issues.filter((i) => i.severity === "low").length,
    },
  };
}

/**
 * Track metrics over time
 * @param {object} metrics - Current metrics
 * @param {string} historyPath - Path to metrics history file
 * @returns {Promise<object>} - Updated history with trends
 */
export async function trackMetrics(metrics, historyPath) {
  try {
    // Load existing history
    let history = [];
    try {
      const data = await fs.readFile(historyPath, "utf-8");
      history = JSON.parse(data);
    } catch {
      // No history yet, start fresh
      history = [];
    }

    // Add current metrics to history
    const timestamp = new Date().toISOString();
    history.push({
      timestamp,
      coverage: metrics.coverage.overall,
      healthScore: metrics.healthScore,
      filesCount: metrics.coverage.counts.files,
      modulesCount: metrics.coverage.counts.modules,
    });

    // Keep last 90 days (assuming daily runs)
    if (history.length > 90) {
      history = history.slice(-90);
    }

    // Save updated history
    await fs.mkdir(path.dirname(historyPath), { recursive: true });
    await fs.writeFile(historyPath, JSON.stringify(history, null, 2));

    // Calculate trends
    const trends = calculateTrends(history);

    return { history, trends };
  } catch (err) {
    warn(`Failed to track metrics: ${err.message}`);
    return { history: [], trends: {} };
  }
}

/**
 * Calculate trends from history
 * @param {array} history - Metrics history
 * @returns {object} - Trend analysis
 */
function calculateTrends(history) {
  if (history.length < 2) {
    return {
      coverage: { direction: "stable", change: 0 },
      healthScore: { direction: "stable", change: 0 },
    };
  }

  const latest = history[history.length - 1];
  const previous = history[history.length - 2];

  const coverageChange = latest.coverage - previous.coverage;
  const healthChange = latest.healthScore - previous.healthScore;

  return {
    coverage: {
      direction: coverageChange > 1 ? "up" : coverageChange < -1 ? "down" : "stable",
      change: coverageChange.toFixed(1),
    },
    healthScore: {
      direction: healthChange > 2 ? "up" : healthChange < -2 ? "down" : "stable",
      change: healthChange.toFixed(0),
    },
  };
}

/**
 * Calculate section completeness — how many of the possible document types were generated.
 * @param {object} docs - Rendered pages map (key → content)
 * @returns {object} - Section completeness metrics
 */
export function calculateSectionCompleteness(docs) {
  const generated = Object.keys(docs || {}).filter(
    (k) => docs[k] && docs[k].trim().length > 0
  );
  const total = ALL_DOCUMENT_KEYS.length;
  const present = generated.filter((k) => ALL_DOCUMENT_KEYS.includes(k)).length;
  const missing = ALL_DOCUMENT_KEYS.filter((k) => !generated.includes(k));

  return {
    generated: present,
    total,
    percentage: total > 0 ? Math.round((present / total) * 100) : 0,
    missing,
  };
}

/**
 * Collect all metrics
 * @param {object} scanResult - Repository scan result
 * @param {object} docs - Generated documentation
 * @param {string} docsPath - Path to documentation directory
 * @param {string} historyPath - Path to metrics history file
 * @returns {Promise<object>} - Complete metrics data
 */
export async function collectMetrics(scanResult, docs, docsPath, historyPath) {
  info("Collecting metrics...");

  const coverage = calculateCoverage(scanResult, docs);
  const freshness = await detectStaleness(docsPath);
  const quality = analyzeQuality(scanResult, docs);
  const sectionCompleteness = calculateSectionCompleteness(docs);

  const metrics = {
    coverage,
    freshness,
    quality,
    sectionCompleteness,
    timestamp: new Date().toISOString(),
  };

  metrics.healthScore = calculateHealthScore(metrics);

  // Track over time
  const { history, trends } = await trackMetrics(metrics, historyPath);
  metrics.history = history;
  metrics.trends = trends;

  // Save latest metrics snapshot for external tooling
  try {
    const snapshotPath = path.join(docsPath, "metrics.json");
    await fs.mkdir(docsPath, { recursive: true });
    await fs.writeFile(snapshotPath, JSON.stringify({
      healthScore: metrics.healthScore,
      coverage: metrics.coverage,
      sectionCompleteness: metrics.sectionCompleteness,
      quality: { score: metrics.quality.score, summary: metrics.quality.summary },
      freshness: { score: metrics.freshness.score, isStale: metrics.freshness.isStale, daysSinceUpdate: metrics.freshness.daysSinceUpdate },
      timestamp: metrics.timestamp,
    }, null, 2));
  } catch (err) {
    warn(`Failed to save metrics snapshot: ${err.message}`);
  }

  info(`✓ Health Score: ${metrics.healthScore}/100`);
  info(`✓ Coverage: ${metrics.coverage.overall.toFixed(1)}%`);
  info(`✓ Sections: ${sectionCompleteness.generated}/${sectionCompleteness.total} document types generated`);

  return metrics;
}
