import { ensurePage, replacePageContent } from "./notion.js";
import { getCurrentBranch, getBranchQualifiedTitle } from "../utils/branch.js";
import { renderMermaidToSvg, getGitHubRawUrl } from "../utils/mermaid.js";
import fetch from "node-fetch";
import path from "node:path";
import { log } from "../utils/logger.js";

async function prepareDiagramUrl(content, cfg, pageKey) {
  // If content has mermaid code, generate SVG and get URL
  if (typeof content === 'object' && content.mermaid) {
    const outputPath = path.join(cfg.__repoRoot, ".repolens", "diagrams", `${pageKey}.svg`);
    const svgPath = await renderMermaidToSvg(content.mermaid, outputPath);
    
    if (!svgPath) {
      // Mermaid CLI not available, will use mermaid.ink fallback
      return null;
    }
    
    // Try to construct GitHub URL if we can detect repo info
    const repoPath = `.repolens/diagrams/${pageKey}.svg`;
    const owner = process.env.GITHUB_REPOSITORY_OWNER || cfg.github?.owner;
    const repo = process.env.GITHUB_REPOSITORY?.split('/')[1] || cfg.github?.repo;
    const branch = getCurrentBranch();
    
    if (owner && repo) {
      const githubUrl = getGitHubRawUrl(repoPath, owner, repo, branch);
      
      // Check if the URL is accessible (file might not be committed yet)
      try {
        const response = await fetch(githubUrl, { method: 'HEAD', timeout: 3000 });
        if (response.ok) {
          log(`Using GitHub-hosted SVG: ${githubUrl}`);
          return githubUrl;
        } else {
          log(`GitHub URL not yet accessible (${response.status}), using mermaid.ink fallback`);
          return null; // Fall back to mermaid.ink
        }
      } catch (error) {
        log(`GitHub URL check failed: ${error.message}, using mermaid.ink fallback`);
        return null; // Fall back to mermaid.ink
      }
    }
    
    // No GitHub info, use fallback
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