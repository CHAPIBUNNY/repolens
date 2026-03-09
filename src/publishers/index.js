import { publishToNotion } from "./publish.js";
import { publishToMarkdown } from "./markdown.js";
import { shouldPublishToNotion, getCurrentBranch } from "../utils/branch.js";
import { info, warn } from "../utils/logger.js";
import { trackPublishing } from "../utils/telemetry.js";

function hasNotionSecrets() {
  return !!process.env.NOTION_TOKEN && !!process.env.NOTION_PARENT_PAGE_ID;
}

export async function publishDocs(cfg, renderedPages) {
  const publishers = cfg.publishers || ["markdown", "notion"];
  const currentBranch = getCurrentBranch();
  const publishedTo = [];
  let publishStatus = "success";

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
  
  // Track publishing metrics
  trackPublishing(publishedTo, publishStatus);
}