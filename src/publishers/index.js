import { publishToNotion } from "./publish.js";
import { publishToMarkdown } from "./markdown.js";
import { shouldPublishToNotion, getCurrentBranch } from "../utils/branch.js";
import { info, warn } from "../utils/logger.js";

export async function publishDocs(cfg, renderedPages) {
  const publishers = cfg.publishers || ["notion"];
  const currentBranch = getCurrentBranch();

  if (publishers.includes("notion")) {
    if (shouldPublishToNotion(cfg, currentBranch)) {
      info(`Publishing to Notion from branch: ${currentBranch}`);
      await publishToNotion(cfg, renderedPages);
    } else {
      const allowedBranches = cfg.notion?.branches?.join(", ") || "none configured";
      warn(`Skipping Notion publish: branch "${currentBranch}" not in allowed list (${allowedBranches})`);
      info("To publish from this branch, add it to notion.branches in .repolens.yml");
    }
  }

  if (publishers.includes("markdown")) {
    await publishToMarkdown(cfg, renderedPages);
  }
}