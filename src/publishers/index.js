import { publishToNotion } from "./publish.js";
import { publishToMarkdown } from "./markdown.js";

export async function publishDocs(cfg, renderedPages) {
  const publishers = cfg.publishers || ["notion"];

  if (publishers.includes("notion")) {
    await publishToNotion(cfg, renderedPages);
  }

  if (publishers.includes("markdown")) {
    await publishToMarkdown(cfg, renderedPages);
  }
}