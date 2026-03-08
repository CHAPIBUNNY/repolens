import { ensurePage, replacePageContent } from "./notion.js";
import { getCurrentBranch, getBranchQualifiedTitle } from "../utils/branch.js";

export async function publishToNotion(cfg, renderedPages) {
  const parentPageId = process.env.NOTION_PARENT_PAGE_ID;

  if (!parentPageId) {
    throw new Error("Missing NOTION_PARENT_PAGE_ID in tools/repolens/.env");
  }

  const prefix = cfg.project.docs_title_prefix || "RepoLens";
  const currentBranch = getCurrentBranch();
  const includeBranchInTitle = cfg.notion?.includeBranchInTitle !== false; // Default true

  for (const page of cfg.outputs.pages) {
    const baseTitle = `${prefix} — ${page.title}`;
    const title = getBranchQualifiedTitle(baseTitle, currentBranch, includeBranchInTitle);
    const cacheKey = `${page.key}-${currentBranch}`; // Branch-scoped cache
    
    const pageId = await ensurePage(parentPageId, title, cacheKey);
    await replacePageContent(pageId, renderedPages[page.key]);
  }
}