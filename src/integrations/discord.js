/**
 * Discord Integration for RepoLens
 * Sends rich embed notifications to Discord channels via webhooks
 */

import fetch from "node-fetch";
import { info, warn, error } from "../utils/logger.js";

/**
 * Send a notification to Discord webhook
 * @param {string} webhookUrl - Discord webhook URL
 * @param {object} payload - Notification payload
 * @returns {Promise<boolean>} - Success status
 */
export async function sendDiscordNotification(webhookUrl, payload) {
  if (!webhookUrl) {
    warn("Discord webhook URL not configured, skipping notification");
    return false;
  }

  try {
    const embed = buildEmbed(payload);
    const body = {
      username: "RepoLens",
      avatar_url: "https://raw.githubusercontent.com/CHAPIBUNNY/repolens/main/.github/repolens-icon.png",
      embeds: [embed],
    };

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      error(`Discord webhook failed (${response.status}): ${text}`);
      return false;
    }

    info("✓ Discord notification sent");
    return true;
  } catch (err) {
    error(`Discord notification failed: ${err.message}`);
    return false;
  }
}

/**
 * Build Discord embed from payload
 * @param {object} payload - Notification data
 * @returns {object} - Discord embed object
 */
function buildEmbed(payload) {
  const {
    title,
    description,
    color,
    fields = [],
    timestamp = new Date().toISOString(),
    footer,
    url,
  } = payload;

  // Color mapping: success (green), warning (yellow), error (red), info (blue)
  const colorMap = {
    success: 0x27ae60,
    warning: 0xf39c12,
    error: 0xe74c3c,
    info: 0x3498db,
  };

  return {
    title: title || "RABITAI Documentation Updated",
    description: description || "Documentation has been regenerated",
    color: typeof color === "string" ? colorMap[color] || colorMap.info : color || colorMap.info,
    fields: fields.map((field) => ({
      name: field.name,
      value: field.value,
      inline: field.inline !== false, // Default to inline
    })),
    timestamp,
    footer: footer
      ? { text: footer }
      : { text: "RABITAI 🐰" },
    url: url || undefined,
  };
}

/**
 * Build documentation update notification
 * @param {object} options - Notification options
 * @returns {object} - Notification payload
 */
export function buildDocUpdateNotification(options) {
  const {
    branch,
    commitSha,
    commitMessage,
    filesScanned,
    modulesDetected,
    coverage,
    notionUrl,
    changePercent,
  } = options;

  const fields = [];

  // Branch and commit
  if (branch) {
    fields.push({
      name: "📌 Branch",
      value: `\`${branch}\``,
      inline: true,
    });
  }

  if (commitSha) {
    fields.push({
      name: "🔖 Commit",
      value: `\`${commitSha.substring(0, 7)}\``,
      inline: true,
    });
  }

  // Repository stats
  if (filesScanned !== undefined) {
    fields.push({
      name: "📁 Files Scanned",
      value: filesScanned.toLocaleString(),
      inline: true,
    });
  }

  if (modulesDetected !== undefined) {
    fields.push({
      name: "📦 Modules Detected",
      value: modulesDetected.toLocaleString(),
      inline: true,
    });
  }

  // Coverage
  if (coverage !== undefined) {
    const coverageEmoji = coverage >= 80 ? "🟢" : coverage >= 60 ? "🟡" : "🔴";
    fields.push({
      name: `${coverageEmoji} Coverage`,
      value: `${coverage.toFixed(1)}%`,
      inline: true,
    });
  }

  // Change percent
  if (changePercent !== undefined) {
    const changeEmoji = changePercent >= 20 ? "⚠️" : "📊";
    fields.push({
      name: `${changeEmoji} Changes`,
      value: `${changePercent.toFixed(1)}%`,
      inline: true,
    });
  }

  // Links
  const links = [];
  if (notionUrl) {
    links.push(`[📚 Notion Docs](${notionUrl})`);
  }

  if (links.length > 0) {
    fields.push({
      name: "🔗 Quick Links",
      value: links.join(" • "),
      inline: false,
    });
  }

  // Determine color based on change magnitude
  let color = "success";
  if (changePercent !== undefined) {
    if (changePercent >= 20) {
      color = "warning";
    } else if (changePercent >= 50) {
      color = "error";
    }
  }

  return {
    title: "📐 Documentation Updated",
    description: commitMessage
      ? `*${commitMessage.split("\n")[0].substring(0, 100)}${commitMessage.length > 100 ? "..." : ""}*`
      : "Architecture documentation has been regenerated",
    color,
    fields,
  };
}

/**
 * Build error notification
 * @param {object} options - Error options
 * @returns {object} - Notification payload
 */
export function buildErrorNotification(options) {
  const { errorMessage, command, branch, commitSha } = options;

  const fields = [];

  if (command) {
    fields.push({
      name: "⚙️ Command",
      value: `\`${command}\``,
      inline: true,
    });
  }

  if (branch) {
    fields.push({
      name: "📌 Branch",
      value: `\`${branch}\``,
      inline: true,
    });
  }

  if (commitSha) {
    fields.push({
      name: "🔖 Commit",
      value: `\`${commitSha.substring(0, 7)}\``,
      inline: true,
    });
  }

  if (errorMessage) {
    fields.push({
      name: "❌ Error",
      value: `\`\`\`${errorMessage.substring(0, 500)}\`\`\``,
      inline: false,
    });
  }

  return {
    title: "🚨 RABITAI Error",
    description: "Documentation generation failed",
    color: "error",
    fields,
  };
}

/**
 * Should send notification based on change threshold
 * @param {number} changePercent - Percentage of changes
 * @param {string} notifyOn - Notification policy (always, significant, never)
 * @param {number} significantThreshold - Threshold for significant changes (default: 10)
 * @returns {boolean} - Whether to send notification
 */
export function shouldNotify(changePercent, notifyOn = "significant", significantThreshold = 10) {
  if (notifyOn === "always") return true;
  if (notifyOn === "never") return false;
  if (notifyOn === "significant") {
    return changePercent === undefined || changePercent >= significantThreshold;
  }
  return false;
}
