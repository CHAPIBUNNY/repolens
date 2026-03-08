import { ensurePage, replacePageContent } from "./notion.js";

export async function publishToNotion(cfg, renderedPages) {
  const parentPageId = process.env.NOTION_PARENT_PAGE_ID;

  if (!parentPageId) {
    throw new Error("Missing NOTION_PARENT_PAGE_ID in tools/repolens/.env");
  }

  const prefix = cfg.project.docs_title_prefix || "RepoLens";

  for (const page of cfg.outputs.pages) {
    const title = `${prefix} — ${page.title}`;
    const pageId = await ensurePage(parentPageId, title, page.key);
    await replacePageContent(pageId, renderedPages[page.key]);
  }
}