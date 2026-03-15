import { ensurePage, replacePageContent } from "./notion.js";
import { getCurrentBranch, getBranchQualifiedTitle } from "../utils/branch.js";
import { info, warn } from "../utils/logger.js";

// Title map for all document types
const TITLE_MAP = {
  system_overview: "System Overview",
  module_catalog: "Module Catalog",
  api_surface: "API Surface",
  route_map: "Route Map",
  system_map: "System Map",
  arch_diff: "Architecture Diff",
  executive_summary: "Executive Summary",
  business_domains: "Business Domains",
  architecture_overview: "Architecture Overview",
  data_flows: "Data Flows",
  change_impact: "Change Impact",
  developer_onboarding: "Developer Onboarding",
  graphql_schema: "GraphQL Schema",
  type_graph: "Type Graph",
  dependency_graph: "Dependency Graph",
  architecture_drift: "Architecture Drift"
};

export async function publishToNotion(cfg, renderedPages) {
  const parentPageId = process.env.NOTION_PARENT_PAGE_ID;

  if (!parentPageId) {
    throw new Error("Missing NOTION_PARENT_PAGE_ID in tools/repolens/.env");
  }

  const prefix = cfg.project?.docs_title_prefix || cfg.project?.name || "Documentation";
  const currentBranch = getCurrentBranch();
  const includeBranchInTitle = cfg.notion?.includeBranchInTitle !== false; // Default true

  info(`Publishing ${Object.keys(renderedPages).length} documents to Notion...`);

  // Iterate over all rendered pages, not just config-defined ones
  for (const [key, markdown] of Object.entries(renderedPages)) {
    // Skip if content not generated (e.g., disabled feature or generation error)
    if (!markdown || markdown.trim() === "") {
      warn(`Skipping ${key}: No content generated`);
      continue;
    }

    const docTitle = TITLE_MAP[key] || key;
    const baseTitle = `${prefix} — ${docTitle}`;
    const title = getBranchQualifiedTitle(baseTitle, currentBranch, includeBranchInTitle);
    const cacheKey = `${key}-${currentBranch}`; // Branch-scoped cache
    
    info(`Publishing ${key} to Notion (${markdown.length} chars)`);
    
    const pageId = await ensurePage(parentPageId, title, cacheKey);
    await replacePageContent(pageId, markdown);
  }
}