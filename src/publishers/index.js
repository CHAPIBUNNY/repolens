import { publishToNotion } from "./publish.js";
import { publishToMarkdown } from "./markdown.js";
import { publishToConfluence, hasConfluenceSecrets } from "./confluence.js";
import { publishToGitHubWiki, hasGitHubWikiSecrets } from "./github-wiki.js";
import { shouldPublishToNotion, shouldPublishToConfluence, shouldPublishToGitHubWiki, getCurrentBranch } from "../utils/branch.js";
import { info, warn } from "../utils/logger.js";
import { trackPublishing } from "../utils/telemetry.js";
import { collectMetrics } from "../utils/metrics.js";
import { loadDocCache, saveDocCache, filterChangedDocs, logCacheStats } from "../utils/doc-cache.js";
import {
  sendDiscordNotification,
  buildDocUpdateNotification,
  shouldNotify,
} from "../integrations/discord.js";
import path from "node:path";

function hasNotionSecrets() {
  return !!process.env.NOTION_TOKEN && !!process.env.NOTION_PARENT_PAGE_ID;
}

export async function publishDocs(cfg, renderedPages, scanResult, pluginManager = null) {
  const publishers = cfg.publishers || ["markdown", "notion"];
  const currentBranch = getCurrentBranch();
  const publishedTo = [];
  let publishStatus = "success";
  let notionUrl = null;

  // --- Hash-based caching: skip unchanged documents ---
  const cacheDir = path.join(process.cwd(), cfg.documentation?.output_dir || ".repolens");
  const previousCache = await loadDocCache(cacheDir);
  const { changedPages, unchangedKeys, newCache } = filterChangedDocs(renderedPages, previousCache);
  logCacheStats(Object.keys(changedPages).length, unchangedKeys.length);

  // Use changedPages for API publishers (Notion / Confluence / Wiki), full set for Markdown
  const pagesForAPIs = Object.keys(changedPages).length > 0 ? changedPages : renderedPages;

  // Always try Notion publishing if secrets are configured
  if (publishers.includes("notion") || hasNotionSecrets()) {
    if (!hasNotionSecrets()) {
      info("Skipping Notion publish: NOTION_TOKEN or NOTION_PARENT_PAGE_ID not configured");
      info("To enable Notion publishing, set these environment variables or GitHub Actions secrets");
    } else if (shouldPublishToNotion(cfg, currentBranch)) {
      info(`Publishing to Notion from branch: ${currentBranch}`);
      try {
        await publishToNotion(cfg, pagesForAPIs);
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

  // Confluence publishing (opt-in if secrets configured)
  if (publishers.includes("confluence") || hasConfluenceSecrets()) {
    if (!hasConfluenceSecrets()) {
      info("Skipping Confluence publish: Required environment variables not configured");
      info("To enable Confluence publishing, set CONFLUENCE_URL, CONFLUENCE_EMAIL, CONFLUENCE_API_TOKEN, and CONFLUENCE_SPACE_KEY");
    } else if (shouldPublishToConfluence(cfg, currentBranch)) {
      info(`Publishing to Confluence from branch: ${currentBranch}`);
      try {
        await publishToConfluence(cfg, pagesForAPIs);
        publishedTo.push("confluence");
      } catch (err) {
        publishStatus = "failure";
        throw err;
      }
    } else {
      const allowedBranches = cfg.confluence?.branches?.join(", ") || "none configured";
      warn(`Skipping Confluence publish: branch "${currentBranch}" not in allowed list (${allowedBranches})`);
      info("To publish from this branch, add it to confluence.branches in .repolens.yml");
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

  // GitHub Wiki publishing (opt-in if secrets configured)
  if (publishers.includes("github_wiki") || hasGitHubWikiSecrets() && publishers.includes("github_wiki")) {
    if (!hasGitHubWikiSecrets()) {
      info("Skipping GitHub Wiki publish: GITHUB_TOKEN not configured");
      info("In GitHub Actions, add GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }} to your env");
    } else if (shouldPublishToGitHubWiki(cfg, currentBranch)) {
      info(`Publishing to GitHub Wiki from branch: ${currentBranch}`);
      try {
        await publishToGitHubWiki(cfg, pagesForAPIs);
        publishedTo.push("github_wiki");
      } catch (err) {
        publishStatus = "failure";
        throw err;
      }
    } else {
      const allowedBranches = cfg.github_wiki?.branches?.join(", ") || "none configured";
      warn(`Skipping GitHub Wiki publish: branch "${currentBranch}" not in allowed list (${allowedBranches})`);
      info("To publish from this branch, add it to github_wiki.branches in .repolens.yml");
    }
  }

  // Run plugin publishers
  if (pluginManager) {
    const pluginPublishers = pluginManager.getPublishers();
    for (const [key, publisher] of Object.entries(pluginPublishers)) {
      if (publishers.includes(key)) {
        try {
          info(`Publishing via plugin: ${key}`);
          await publisher.publish(cfg, renderedPages);
          publishedTo.push(key);
        } catch (err) {
          warn(`Plugin publisher "${key}" failed: ${err.message}`);
          publishStatus = "failure";
        }
      }
    }
  }

  // Save document hash cache for next run
  await saveDocCache(cacheDir, newCache);

  // Collect metrics and send Discord notification
  try {
    info("Collecting documentation metrics...");
    const docsPath = path.join(process.cwd(), ".repolens");
    const historyPath = path.join(docsPath, "metrics-history.json");
    
    const metrics = await collectMetrics(scanResult, renderedPages, docsPath, historyPath);
    
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
          });
          
          await sendDiscordNotification(webhookUrl, notification);
        } else {
          info(`Skipping Discord notification: change ${changePercent?.toFixed(1) || 0}% below threshold ${significantThreshold}%`);
        }
    } else if (!webhookUrl && discordConfig.enabled !== false) {
      info("Discord webhook not configured. Set DISCORD_WEBHOOK_URL environment variable to enable notifications.");
    }
  } catch (err) {
    warn(`Failed to send notifications: ${err.message}`);
    // Don't fail the whole publish if notifications fail
  }
  
  // Track publishing metrics
  trackPublishing(publishedTo, publishStatus);

  // Run afterPublish hook
  if (pluginManager) {
    await pluginManager.runHook("afterPublish", { publishedTo, publishStatus });
  }
}