/**
 * Dashboard Generator for RepoLens
 * Creates interactive HTML dashboard with metrics, trends, and quality analysis
 */

import fs from "node:fs/promises";
import path from "node:path";
import { info } from "../utils/logger.js";

/**
 * Generate complete dashboard
 * @param {object} metrics - Complete metrics data
 * @param {object} config - RepoLens configuration
 * @param {string} outputPath - Path to write dashboard
 * @returns {Promise<void>}
 */
export async function generateDashboard(metrics, config, outputPath) {
  info("Generating documentation dashboard...");

  const html = buildDashboardHTML(metrics, config);

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, html);

  info(`✓ Dashboard generated: ${outputPath}`);
}

/**
 * Build complete HTML dashboard
 * @param {object} metrics - Metrics data
 * @param {object} config - Configuration
 * @returns {string} - HTML content
 */
function buildDashboardHTML(metrics, config) {
  const { healthScore, coverage, freshness, quality, trends = {}, history = [] } = metrics;
  const projectName = config.project?.name || "Project";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${projectName} - Documentation Dashboard</title>
  <style>
    ${getCSS()}
  </style>
</head>
<body>
  <div class="container">
    <header class="header">
      <div class="header-content">
        <h1>📊 ${projectName}</h1>
        <p class="subtitle">Documentation Health Dashboard</p>
      </div>
      <div class="header-meta">
        <span class="timestamp">Last updated: ${new Date(metrics.timestamp).toLocaleString()}</span>
      </div>
    </header>

    <div class="grid">
      <!-- Health Score Card -->
      <div class="card large">
        <div class="card-header">
          <h2>🎯 Health Score</h2>
        </div>
        <div class="card-body">
          <div class="score-display">
            <div class="score-circle ${getScoreClass(healthScore)}">
              <span class="score-value">${healthScore}</span>
              <span class="score-max">/100</span>
            </div>
            <div class="score-status">
              <span class="status-badge ${getScoreClass(healthScore)}">
                ${getScoreLabel(healthScore)}
              </span>
              ${trends.healthScore ? `
                <span class="trend ${trends.healthScore.direction}">
                  ${getTrendIcon(trends.healthScore.direction)} ${trends.healthScore.change}
                </span>
              ` : ""}
            </div>
          </div>
          <div class="score-breakdown">
            <div class="breakdown-item">
              <span class="label">Coverage</span>
              <span class="value">${coverage.overall.toFixed(1)}%</span>
            </div>
            <div class="breakdown-item">
              <span class="label">Freshness</span>
              <span class="value">${freshness.score}/100</span>
            </div>
            <div class="breakdown-item">
              <span class="label">Quality</span>
              <span class="value">${quality.score}/100</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Coverage Card -->
      <div class="card">
        <div class="card-header">
          <h2>📈 Coverage</h2>
        </div>
        <div class="card-body">
          <div class="coverage-stat">
            <div class="stat-header">
              <span class="stat-label">Overall Coverage</span>
              <span class="stat-value ${getScoreClass(coverage.overall)}">${coverage.overall.toFixed(1)}%</span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill ${getScoreClass(coverage.overall)}" style="width: ${coverage.overall}%"></div>
            </div>
          </div>
          
          <div class="coverage-details">
            <div class="detail-row">
              <span class="detail-label">📦 Modules</span>
              <span class="detail-value">${coverage.counts.modulesDocumented}/${coverage.counts.modules}</span>
              <span class="detail-percent">${coverage.modules.toFixed(0)}%</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">🔌 APIs</span>
              <span class="detail-value">${coverage.counts.apiDocumented}/${coverage.counts.api}</span>
              <span class="detail-percent">${coverage.api.toFixed(0)}%</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">📄 Pages</span>
              <span class="detail-value">${coverage.counts.pagesDocumented}/${coverage.counts.pages}</span>
              <span class="detail-percent">${coverage.pages.toFixed(0)}%</span>
            </div>
            <div class="detail-row total">
              <span class="detail-label">📁 Total Files</span>
              <span class="detail-value">${coverage.counts.files.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Freshness Card -->
      <div class="card">
        <div class="card-header">
          <h2>⏰ Freshness</h2>
        </div>
        <div class="card-body">
          ${freshness.lastUpdated ? `
            <div class="freshness-info">
              <div class="info-row">
                <span class="label">Last Updated</span>
                <span class="value">${new Date(freshness.lastUpdated).toLocaleDateString()}</span>
              </div>
              <div class="info-row">
                <span class="label">Days Since Update</span>
                <span class="value ${freshness.isStale ? 'stale' : 'fresh'}">${freshness.daysSinceUpdate} days</span>
              </div>
              <div class="info-row">
                <span class="label">Status</span>
                <span class="status-badge ${freshness.isStale ? 'warning' : 'success'}">
                  ${freshness.isStale ? '⚠️ Stale' : '✅ Fresh'}
                </span>
              </div>
            </div>
            ${freshness.staleFiles && freshness.staleFiles.length > 0 ? `
              <div class="stale-files">
                <p class="stale-title">Stale Files:</p>
                <ul>
                  ${freshness.staleFiles.slice(0, 5).map(f => `
                    <li>${f.file} <span class="days">(${f.daysSince} days)</span></li>
                  `).join('')}
                </ul>
              </div>
            ` : ''}
          ` : `
            <div class="empty-state">
              <p>No documentation found yet</p>
              <p class="hint">Run <code>repolens publish</code> to generate</p>
            </div>
          `}
        </div>
      </div>

      <!-- Quality Issues Card -->
      <div class="card">
        <div class="card-header">
          <h2>🔍 Quality Issues</h2>
          <span class="badge">${quality.issues.length}</span>
        </div>
        <div class="card-body">
          ${quality.issues.length > 0 ? `
            <div class="issues-summary">
              <div class="issue-count high">${quality.summary.high} High</div>
              <div class="issue-count medium">${quality.summary.medium} Medium</div>
              <div class="issue-count low">${quality.summary.low} Low</div>
            </div>
            <div class="issues-list">
              ${quality.issues.map(issue => `
                <div class="issue-item ${issue.severity}">
                  <div class="issue-header">
                    <span class="issue-icon">${getIssueIcon(issue.severity)}</span>
                    <span class="issue-message">${issue.message}</span>
                  </div>
                  ${issue.items && issue.items.length > 0 ? `
                    <ul class="issue-items">
                      ${issue.items.map(item => `<li>${item}</li>`).join('')}
                      ${issue.count > issue.items.length ? `<li class="more">...and ${issue.count - issue.items.length} more</li>` : ''}
                    </ul>
                  ` : ''}
                </div>
              `).join('')}
            </div>
          ` : `
            <div class="empty-state success">
              <p>✨ No quality issues detected!</p>
              <p class="hint">Your documentation is in great shape</p>
            </div>
          `}
        </div>
      </div>

      <!-- Trend Chart Card -->
      ${history.length >= 2 ? `
        <div class="card wide">
          <div class="card-header">
            <h2>📊 Trends</h2>
            <span class="badge">${history.length} data points</span>
          </div>
          <div class="card-body">
            ${generateTrendChart(history)}
          </div>
        </div>
      ` : ''}

      <!-- Quick Links Card -->
      <div class="card">
        <div class="card-header">
          <h2>🔗 Quick Links</h2>
        </div>
        <div class="card-body">
          <div class="quick-links">
            ${config.github ? `
              <a href="https://github.com/${config.github.owner}/${config.github.repo}" class="link-button" target="_blank">
                <span class="link-icon">💻</span>
                <span class="link-text">GitHub Repository</span>
              </a>
            ` : ''}
            <a href="../" class="link-button">
              <span class="link-icon">📚</span>
              <span class="link-text">Markdown Docs</span>
            </a>
            ${process.env.NOTION_PARENT_PAGE_ID ? `
              <a href="https://notion.so/${process.env.NOTION_PARENT_PAGE_ID}" class="link-button" target="_blank">
                <span class="link-icon">📝</span>
                <span class="link-text">Notion Docs</span>
              </a>
            ` : ''}
            <a href="https://github.com/CHAPIBUNNY/repolens" class="link-button" target="_blank">
              <span class="link-icon">🔍</span>
              <span class="link-text">RepoLens Docs</span>
            </a>
          </div>
        </div>
      </div>
    </div>

    <footer class="footer">
      <p>Generated by <a href="https://github.com/CHAPIBUNNY/repolens" target="_blank">RepoLens</a> 🔍</p>
    </footer>
  </div>
</body>
</html>`;
}

/**
 * Generate trend chart SVG
 * @param {array} history - Metrics history
 * @returns {string} - SVG chart HTML
 */
function generateTrendChart(history) {
  const width = 800;
  const height = 300;
  const padding = 40;
  const chartWidth = width - (padding * 2);
  const chartHeight = height - (padding * 2);

  // Extract coverage and health score data
  const coverageData = history.map(h => h.coverage || 0);
  const healthData = history.map(h => h.healthScore || 0);

  // Calculate scales
  const xScale = chartWidth / (history.length - 1 || 1);
  const yScale = chartHeight / 100;

  // Generate path data
  const coveragePath = coverageData.map((val, i) => {
    const x = padding + (i * xScale);
    const y = height - padding - (val * yScale);
    return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
  }).join(' ');

  const healthPath = healthData.map((val, i) => {
    const x = padding + (i * xScale);
    const y = height - padding - (val * yScale);
    return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
  }).join(' ');

  return `
    <div class="chart-container">
      <svg width="100%" height="300" viewBox="0 0 ${width} ${height}">
        <!-- Grid lines -->
        ${[0, 25, 50, 75, 100].map(val => `
          <line x1="${padding}" y1="${height - padding - (val * yScale)}" 
                x2="${width - padding}" y2="${height - padding - (val * yScale)}" 
                stroke="#e0e0e0" stroke-width="1" stroke-dasharray="4"/>
          <text x="${padding - 10}" y="${height - padding - (val * yScale) + 5}" 
                text-anchor="end" font-size="12" fill="#666">${val}</text>
        `).join('')}
        
        <!-- Coverage line -->
        <path d="${coveragePath}" fill="none" stroke="#3498db" stroke-width="3"/>
        ${coverageData.map((val, i) => `
          <circle cx="${padding + (i * xScale)}" cy="${height - padding - (val * yScale)}" 
                  r="4" fill="#3498db"/>
        `).join('')}
        
        <!-- Health score line -->
        <path d="${healthPath}" fill="none" stroke="#27ae60" stroke-width="3"/>
        ${healthData.map((val, i) => `
          <circle cx="${padding + (i * xScale)}" cy="${height - padding - (val * yScale)}" 
                  r="4" fill="#27ae60"/>
        `).join('')}
        
        <!-- Legend -->
        <g transform="translate(${width - 150}, 20)">
          <circle cx="0" cy="0" r="5" fill="#3498db"/>
          <text x="15" y="5" font-size="14" fill="#333">Coverage</text>
          <circle cx="0" cy="25" r="5" fill="#27ae60"/>
          <text x="15" y="30" font-size="14" fill="#333">Health Score</text>
        </g>
      </svg>
      <p class="chart-caption">Coverage and Health Score trends over the last ${history.length} updates</p>
    </div>
  `;
}

/**
 * Get CSS styles
 * @returns {string} - CSS content
 */
function getCSS() {
  return `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
      color: #333;
    }
    
    .container {
      max-width: 1400px;
      margin: 0 auto;
    }
    
    .header {
      background: white;
      border-radius: 12px;
      padding: 30px;
      margin-bottom: 24px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .header h1 {
      font-size: 32px;
      color: #333;
      margin-bottom: 8px;
    }
    
    .subtitle {
      color: #666;
      font-size: 16px;
    }
    
    .timestamp {
      color: #999;
      font-size: 14px;
    }
    
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
      gap: 24px;
     margin-bottom: 24px;
    }
    
    .card {
      background: white;
      border-radius: 12px;
      padding: 24px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
      transition: transform 0.2s, box-shadow 0.2s;
    }
    
    .card:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 12px rgba(0,0,0,0.15);
    }
    
    .card.large {
      grid-column: span 2;
    }
    
    .card.wide {
      grid-column: 1 / -1;
    }
    
    @media (max-width: 768px) {
      .card.large, .card.wide { grid-column: 1; }
      .grid { grid-template-columns: 1fr; }
    }
    
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      padding-bottom: 16px;
      border-bottom: 2px solid #f0f0f0;
    }
    
    .card-header h2 {
      font-size: 20px;
      color: #333;
    }
    
    .badge {
      background: #e0e7ff;
      color: #4f46e5;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 14px;
      font-weight: 600;
    }
    
    .score-display {
      display: flex;
      align-items: center;
      gap: 32px;
      margin-bottom: 24px;
    }
    
    .score-circle {
      width: 140px;
      height: 140px;
      border-radius: 50%;
      border: 8px solid;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    
    .score-circle.excellent { border-color: #27ae60; color: #27ae60; }
    .score-circle.good { border-color: #3498db; color: #3498db; }
    .score-circle.fair { border-color: #f39c12; color: #f39c12; }
    .score-circle.poor { border-color: #e74c3c; color: #e74c3c; }
    
    .score-value {
      font-size: 48px;
      font-weight: 700;
      line-height: 1;
    }
    
    .score-max {
      font-size: 18px;
      font-weight: 600;
      opacity: 0.7;
    }
    
    .score-status {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    
    .status-badge {
      padding: 8px 16px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 16px;
      text-align: center;
    }
    
    .status-badge.excellent { background: #d4edda; color: #27ae60; }
    .status-badge.good { background: #d1ecf1; color: #3498db; }
    .status-badge.fair { background: #fff3cd; color: #f39c12; }
    .status-badge.poor { background: #f8d7da; color: #e74c3c; }
    .status-badge.success { background: #d4edda; color: #27ae60; }
    .status-badge.warning { background: #fff3cd; color: #f39c12; }
    
    .trend {
      font-size: 14px;
      font-weight: 600;
      padding: 4px 8px;
      border-radius: 4px;
    }
    
    .trend.up { background: #d4edda; color: #27ae60; }
    .trend.down { background: #f8d7da; color: #e74c3c; }
    .trend.stable { background: #e2e3e5; color: #666; }
    
    .score-breakdown {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
    }
    
    .breakdown-item {
      text-align: center;
      padding: 16px;
      background: #f8f9fa;
      border-radius: 8px;
    }
    
    .breakdown-item .label {
      display: block;
      font-size: 14px;
      color: #666;
      margin-bottom: 8px;
    }
    
    .breakdown-item .value {
      display: block;
      font-size: 24px;
      font-weight: 700;
      color: #333;
    }
    
    .progress-bar {
      width: 100%;
      height: 12px;
      background: #e0e0e0;
      border-radius: 6px;
      overflow: hidden;
      margin: 8px 0 16px 0;
    }
    
    .progress-fill {
      height: 100%;
      border-radius: 6px;
      transition: width 0.3s ease;
    }
    
    .progress-fill.excellent { background: #27ae60; }
    .progress-fill.good { background: #3498db; }
    .progress-fill.fair { background: #f39c12; }
    .progress-fill.poor { background: #e74c3c; }
    
    .coverage-details {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    
    .detail-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 0;
      border-bottom: 1px solid #f0f0f0;
    }
    
    .detail-row.total {
      border-top: 2px solid #e0e0e0;
      border-bottom: none;
      padding-top: 12px;
      margin-top: 8px;
      font-weight: 600;
    }
    
    .detail-label {
      color: #666;
      font-size: 14px;
    }
    
    .detail-value {
      color: #333;
      font-weight: 600;
    }
    
    .detail-percent {
      color: #999;
      font-size: 14px;
    }
    
    .freshness-info, .info-row {
      display: flex;
      justify-content: space-between;
      padding: 12px 0;
      border-bottom: 1px solid #f0f0f0;
    }
    
    .info-row .label {
      color: #666;
      font-weight: 500;
    }
    
    .info-row .value {
      color: #333;
      font-weight: 600;
    }
    
    .info-row .value.stale { color: #e74c3c; }
    .info-row .value.fresh { color: #27ae60; }
    
    .stale-files {
      margin-top: 16px;
      padding: 16px;
      background: #fff3cd;
      border-radius: 8px;
    }
    
    .stale-title {
      font-weight: 600;
      margin-bottom: 8px;
      color: #856404;
    }
    
    .stale-files ul {
      list-style: none;
      padding-left: 0;
    }
    
    .stale-files li {
      padding: 4px 0;
      color: #856404;
      font-size: 14px;
    }
    
    .stale-files .days {
      color: #666;
      font-size: 12px;
    }
    
    .issues-summary {
      display: flex;
      gap: 12px;
      margin-bottom: 16px;
    }
    
    .issue-count {
      flex: 1;
      padding: 12px;
      border-radius: 8px;
      text-align: center;
      font-weight: 600;
    }
    
    .issue-count.high { background: #f8d7da; color: #e74c3c; }
    .issue-count.medium { background: #fff3cd; color: #f39c12; }
    .issue-count.low { background: #d1ecf1; color: #3498db; }
    
    .issues-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    
    .issue-item {
      padding: 12px;
      border-left: 4px solid;
      border-radius: 4px;
      background: #f8f9fa;
    }
    
    .issue-item.high { border-color: #e74c3c; }
    .issue-item.medium { border-color: #f39c12; }
    .issue-item.low { border-color: #3498db; }
    
    .issue-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }
    
    .issue-icon {
      font-size: 16px;
    }
    
    .issue-message {
      font-weight: 600;
      color: #333;
      font-size: 14px;
    }
    
    .issue-items {
      list-style: none;
      padding-left: 24px;
      font-size: 13px;
      color: #666;
    }
    
    .issue-items li {
      padding: 2px 0;
    }
    
    .issue-items .more {
      font-style: italic;
      color: #999;
    }
    
    .chart-container {
      width: 100%;
    }
    
    .chart-caption {
      text-align: center;
      color: #666;
      font-size: 14px;
      margin-top: 12px;
    }
    
    .quick-links {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 12px;
    }
    
    .link-button {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px;
      background: #f8f9fa;
      border-radius: 8px;
      text-decoration: none;
      color: #333;
      transition: all 0.2s;
    }
    
    .link-button:hover {
      background: #e9ecef;
      transform: translateY(-2px);
    }
    
    .link-icon {
      font-size: 24px;
    }
    
    .link-text {
      font-weight: 600;
      font-size: 14px;
    }
    
    .empty-state {
      text-align: center;
      padding: 32px;
      color: #999;
    }
    
    .empty-state p {
      margin-bottom: 8px;
    }
    
    .empty-state .hint {
      font-size: 14px;
      color: #bbb;
    }
    
    .empty-state code {
      background: #f0f0f0;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 13px;
    }
    
    .empty-state.success {
      color: #27ae60;
    }
    
    .footer {
      text-align: center;
      padding: 24px;
      color: white;
      font-size: 14px;
    }
    
    .footer a {
      color: white;
      text-decoration: underline;
    }
  `;
}

/**
 * Get score classification
 * @param {number} score - Score value
 * @returns {string} - CSS class name
 */
function getScoreClass(score) {
  if (score >= 80) return "excellent";
  if (score >= 60) return "good";
  if (score >= 40) return "fair";
  return "poor";
}

/**
 * Get score label
 * @param {number} score - Score value
 * @returns {string} - Label text
 */
function getScoreLabel(score) {
  if (score >= 80) return "✨ Excellent";
  if (score >= 60) return "👍 Good";
  if (score >= 40) return "⚠️ Fair";
  return "❌ Needs Work";
}

/**
 * Get trend icon
 * @param {string} direction - Trend direction
 * @returns {string} - Icon
 */
function getTrendIcon(direction) {
  if (direction === "up") return "📈";
  if (direction === "down") return "📉";
  return "➡️";
}

/**
 * Get issue icon
 * @param {string} severity - Issue severity
 * @returns {string} - Icon
 */
function getIssueIcon(severity) {
  if (severity === "high") return "🔴";
  if (severity === "medium") return "🟡";
  return "🔵";
}
