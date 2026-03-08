import fetch from "node-fetch";
import fs from "node:fs/promises";
import path from "node:path";
import { log } from "../utils/logger.js";
import { fetchWithRetry } from "../utils/retry.js";

function notionHeaders() {
  const token = process.env.NOTION_TOKEN;
  const version = process.env.NOTION_VERSION || "2022-06-28";

  if (!token) {
    throw new Error("Missing NOTION_TOKEN in tools/repolens/.env or GitHub Actions secrets");
  }

  return {
    Authorization: `Bearer ${token}`,
    "Notion-Version": version,
    "Content-Type": "application/json"
  };
}

async function notionRequest(method, url, body) {
  const res = await fetchWithRetry(`https://api.notion.com/v1${url}`, {
    method,
    headers: notionHeaders(),
    body: body ? JSON.stringify(body) : undefined
  }, {
    retries: 3,
    baseDelayMs: 500,
    maxDelayMs: 4000,
    label: `Notion ${method} ${url}`
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Notion API error ${res.status}: ${text}`);
  }

  return await res.json();
}

const CACHE_DIR = path.join(process.cwd(), ".cache");
const CACHE_FILE = path.join(CACHE_DIR, "notion-pages.json");

async function readCache() {
  try {
    const raw = await fs.readFile(CACHE_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function writeCache(cache) {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2), "utf8");
}

async function getChildBlocks(blockId) {
  const results = [];
  let cursor = undefined;

  while (true) {
    const suffix = cursor ? `?start_cursor=${cursor}` : "";
    const response = await notionRequest("GET", `/blocks/${blockId}/children${suffix}`);

    if (response.results?.length) {
      results.push(...response.results);
    }

    if (!response.has_more || !response.next_cursor) {
      break;
    }

    cursor = response.next_cursor;
  }

  return results;
}

async function findExistingChildPageByTitle(parentPageId, title) {
  const children = await getChildBlocks(parentPageId);

  log(`Looking for child page: "${title}"`);
  log(`Parent has ${children.length} child blocks`);

  for (const child of children) {
    if (child.type === "child_page") {
      const childTitle = child.child_page?.title?.trim();
      log(`Found child page block: "${childTitle}" (${child.id})`);

      if (childTitle === title) {
        log(`Reusing existing page: "${title}" (${child.id})`);
        return child.id;
      }
    }
  }

  log(`No existing child page found for "${title}"`);
  return null;
}

export async function ensurePage(parentPageId, title, cacheKey) {
  const cache = await readCache();

  if (cache[cacheKey]) {
    log(`Using cached page ID for ${cacheKey}: ${cache[cacheKey]}`);
    return cache[cacheKey];
  }

  const existingId = await findExistingChildPageByTitle(parentPageId, title);

  if (existingId) {
    cache[cacheKey] = existingId;
    await writeCache(cache);
    return existingId;
  }

  log(`Creating NEW page for "${title}"`);

  const created = await notionRequest("POST", "/pages", {
    parent: { page_id: parentPageId },
    properties: {
      title: {
        title: [
          {
            text: {
              content: title
            }
          }
        ]
      }
    }
  });

  cache[cacheKey] = created.id;
  await writeCache(cache);

  log(`Created page "${title}" with ID ${created.id}`);
  return created.id;
}

async function archiveBlock(blockId) {
  return notionRequest("PATCH", `/blocks/${blockId}`, {
    archived: true
  });
}

async function unarchivePage(pageId) {
  try {
    return await notionRequest("PATCH", `/pages/${pageId}`, {
      archived: false
    });
  } catch (error) {
    // If page is already unarchived, ignore error
    log(`Note: Could not unarchive page ${pageId}: ${error.message}`);
  }
}

export async function clearPage(pageId) {
  const children = await getChildBlocks(pageId);

  // Only archive blocks that are not already archived
  const unarchivedBlocks = children.filter(child => !child.archived);
  
  for (const child of unarchivedBlocks) {
    await archiveBlock(child.id);
  }
}

function markdownToNotionBlocks(markdown) {
  const lines = markdown.split("\n");
  const blocks = [];
  let i = 0;

  while (i < lines.length && blocks.length < 100) {
    const line = lines[i].trim();

    // Skip empty lines
    if (!line) {
      i++;
      continue;
    }

    // Handle code blocks (```language...```)
    if (line.startsWith("```")) {
      const language = line.slice(3).trim() || "plain text";
      const codeLines = [];
      i++; // Move past opening ```

      // Collect code block content
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }

      // Create Notion code block
      const codeContent = codeLines.join("\n");
      if (codeContent.trim()) {
        blocks.push({
          object: "block",
          type: "code",
          code: {
            rich_text: [
              {
                type: "text",
                text: {
                  content: codeContent.slice(0, 2000) // Notion limit
                }
              }
            ],
            language: language === "mermaid" ? "plain text" : language,
            caption: language === "mermaid" ? [
              {
                type: "text",
                text: {
                  content: "Mermaid diagram - paste into mermaid.live to visualize"
                }
              }
            ] : []
          }
        });
      }

      i++; // Move past closing ```
      continue;
    }

    // Handle headings
    if (line.startsWith("# ")) {
      blocks.push({
        object: "block",
        type: "heading_1",
        heading_1: {
          rich_text: [
            {
              type: "text",
              text: {
                content: line.replace(/^# /, "")
              }
            }
          ]
        }
      });
      i++;
      continue;
    }

    if (line.startsWith("## ")) {
      blocks.push({
        object: "block",
        type: "heading_2",
        heading_2: {
          rich_text: [
            {
              type: "text",
              text: {
                content: line.replace(/^## /, "")
              }
            }
          ]
        }
      });
      i++;
      continue;
    }

    // Handle bullet lists
    if (line.startsWith("- ")) {
      blocks.push({
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: {
          rich_text: [
            {
              type: "text",
              text: {
                content: line.replace(/^- /, "")
              }
            }
          ]
        }
      });
      i++;
      continue;
    }

    // Handle regular paragraphs
    blocks.push({
      object: "block",
      type: "paragraph",
      paragraph: {
        rich_text: [
          {
            type: "text",
            text: {
              content: line
            }
          }
        ]
      }
    });
    i++;
  }

  return blocks;
}

export async function replacePageContent(pageId, markdown) {
  // Ensure page is unarchived before editing
  await unarchivePage(pageId);
  
  await clearPage(pageId);

  const children = markdownToNotionBlocks(markdown);

  if (!children.length) return;

  for (let i = 0; i < children.length; i += 50) {
    const chunk = children.slice(i, i + 50);

    await notionRequest("PATCH", `/blocks/${pageId}/children`, {
      children: chunk
    });
  }
}