import { publishToNotion } from "./publish.js";
import { publishToMarkdown } from "./markdown.js";
import { shouldPublishToNotion, getCurrentBranch } from "../utils/branch.js";
import { info, warn } from "../utils/logger.js";
import { trackPublishing } from "../utils/telemetry.js";
import { collectMetrics } from "../utils/metrics.js";
import { generateDashboard } from "../renderers/renderDashboard.js";
import { publishDashboardToNotion } from "./notion.js";
import {
  sendDiscordNotification,
  buildDocUpdateNotification,
  shouldNotify,
} from "../integrations/discord.js";
import path from "node:path";

function hasNotionSecrets() {
  return !!process.env.NOTION_TOKEN && !!process.env.NOTION_PARENT_PAGE_ID;
}

export async function publishDocs(cfg, renderedPages, scanResult) {
  const publishers = cfg.publishers || ["markdown", "notion"];
  const currentBranch = getCurrentBranch();
  const publishedTo = [];
  let publishStatus = "success";
  let notionUrl = null;

  // Always try Notion publishing if secrets are configured
  if (publishers.includes("notion") || hasNotionSecrets()) {
    if (!hasNotionSecrets()) {
      info("Skipping Notion publish: NOTION_TOKEN or NOTION_PARENT_PAGE_ID not configured");
      info("To enable Notion publishing, set these environment variables or GitHub Actions secrets");
    } else if (shouldPublishToNotion(cfg, currentBranch)) {
      info(`Publishing to Notion from branch: ${currentBranch}`);
      try {
        await publishToNotion(cfg, renderedPages);
        publishedTo.push("notion");
        // Build Notion URL if published
        if (process.env.NOTION_PARENT_PAGE_ID) {
          notionUrl = `https://notion.so/${process.env.NOTION_PARENT_PAGE_ID}`;
        }
      } catch (err) {
        publishStatus = "failure";
        throw err;
      }
    } else {
      const allowedBranches = cfg.notion?.branches?.join(", ") || "none configured";
      warn(`Skipping Notion publish: branch "${currentBranch}" not in allowed list (${allowedBranches})`);
      info("To publish from this branch, add it to notion.branches in .repolens.yml");
    }
  }

  // Always generate markdown output
  if (publishers.includes("markdown") || !publishers.includes("notion")) {
    try {
      await publishToMarkdown(cfg, renderedPages);
      publishedTo.push("markdown");
    } catch (err) {
      publishStatus = "failure";
      throw err;
    }
  }

  // Collect metrics and generate dashboard (Phase 4)
  const dashboardEnabled = cfg.dashboard?.enabled !== false; // Default true
  if (dashboardEnabled) {
    try {
      info("Collecting documentation metrics...");
      const docsPath = path.join(process.cwd(), ".repolens");
      const historyPath = path.join(docsPath, "metrics-history.json");
      
      const metrics = await collectMetrics(scanResult, renderedPages, docsPath, historyPath);
      
      // Generate dashboard
      const dashboardPath = path.join(docsPath, "dashboard", "index.html");
      await generateDashboard(metrics, cfg, dashboardPath);
      
      // Publish dashboard to Notion if enabled
      if (hasNotionSecrets() && shouldPublishToNotion(cfg, currentBranch)) {
        try {
          const parentPageId = process.env.NOTION_PARENT_PAGE_ID;
          await publishDashboardToNotion(parentPageId, metrics, cfg);
          info("✓ Dashboard published to Notion");
        } catch (err) {
          warn(`Failed to publish dashboard to Notion: ${err.message}`);
          // Don't fail the whole publish if Notion dashboard fails
        }
      }
      
      // Send Discord notification if configured
      const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
      const discordConfig = cfg.discord || {};
      const discordEnabled = discordConfig.enabled !== false; // Default true if webhook configured
      const notifyOn = discordConfig.notifyOn || "significant";
      const significantThreshold = discordConfig.significantThreshold || 10;
      
      // Check if we should send notification for this branch
      const allowedBranches = discordConfig.branches || [currentBranch]; // Default to current branch
      const branchAllowed = allowedBranches.some(pattern => {
        if (pattern.includes("*")) {
          const regex = new RegExp(`^${pattern.replace(/\*/g, ".*")}$`);
          return regex.test(currentBranch);
        }
        return pattern === currentBranch;
      });
      
      if (webhookUrl && discordEnabled && branchAllowed) {
        // Calculate change percent (if we have history)
        const changePercent = metrics.history.length >= 2
          ? Math.abs(metrics.history[metrics.history.length - 1].coverage - metrics.history[metrics.history.length - 2].coverage)
          : undefined;
        
        if (shouldNotify(changePercent, notifyOn, significantThreshold)) {
          const githubOwner = cfg.github?.owner || process.env.GITHUB_REPOSITORY?.split("/")[0];
          const githubRepo = cfg.github?.repo || process.env.GITHUB_REPOSITORY?.split("/")[1];
          const dashboardUrl = githubOwner && githubRepo
            ? `https://${githubOwner}.github.io/${githubRepo}/`
            : undefined;
          
          const notification = buildDocUpdateNotification({
            branch: currentBranch,
            commitSha: process.env.GITHUB_SHA || process.env.CI_COMMIT_SHA,
            commitMessage: process.env.GITHUB_EVENT_NAME === "push"
              ? process.env.GITHUB_EVENT_HEAD_COMMIT_MESSAGE
              : undefined,
            filesScanned: scanResult.filesCount,
            modulesDetected: scanResult.modules?.length || 0,
            coverage: metrics.coverage.overall,
            notionUrl,
            dashboardUrl,
            changePercent,
          });
          
          await sendDiscordNotification(webhookUrl, notification);
        } else {
          info(`Skipping Discord notification: change ${changePercent?.toFixed(1) || 0}% below threshold ${significantThreshold}%`);
        }
      } else if (!webhookUrl && discordConfig.enabled !== false) {
        info("Discord webhook not configured. Set DISCORD_WEBHOOK_URL environment variable to enable notifications.");
      }
    } catch (err) {
      warn(`Failed to generate dashboard or send notifications: ${err.message}`);
      // Don't fail the whole publish if dashboard/notifications fail
    }
  }
  
  // Track publishing metrics
  trackPublishing(publishedTo, publishStatus);
}