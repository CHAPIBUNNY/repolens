import { ensurePage, replacePageContent } from "./notion.js";
import { getCurrentBranch, getBranchQualifiedTitle } from "../utils/branch.js";
import { renderMermaidToSvg, getGitHubRawUrl } from "../utils/mermaid.js";
import path from "node:path";

async function prepareDiagramUrl(content, cfg, pageKey) {
  // If content has mermaid code, generate SVG and get URL
  if (typeof content === 'object' && content.mermaid) {
    const outputPath = path.join(cfg.__repoRoot, ".repolens", "diagrams", `${pageKey}.svg`);
    await renderMermaidToSvg(content.mermaid, outputPath);
    
    // Try to construct GitHub URL if we can detect repo info
    // This allows Notion to display the committed SVG
    const repoPath = `.repolens/diagrams/${pageKey}.svg`;
    
    // Try to get repo info from environment or config
    const owner = process.env.GITHUB_REPOSITORY_OWNER || cfg.github?.owner;
    const repo = process.env.GITHUB_REPOSITORY?.split('/')[1] || cfg.github?.repo;
    const branch = getCurrentBranch();
    
    if (owner && repo) {
      return getGitHubRawUrl(repoPath, owner, repo, branch);
    }
    
    // Fallback to mermaid.ink if we can't construct GitHub URL
    return null;
  }
  
  return null;
}

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
    const content = renderedPages[page.key];
    
    // Generate diagram URL if applicable
    const diagramUrl = await prepareDiagramUrl(content, cfg, page.key);
    
    // Handle both string content and object with {markdown, mermaid}
    if (typeof content === 'object' && content.mermaid) {
      await replacePageContent(pageId, content.markdown, content.mermaid, diagramUrl);
    } else {
      await replacePageContent(pageId, typeof content === 'string' ? content : content.markdown);
    }
  }
}