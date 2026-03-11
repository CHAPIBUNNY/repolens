import fetch from "node-fetch";
import fs from "node:fs/promises";
import path from "node:path";
import { log } from "../utils/logger.js";
import { fetchWithRetry } from "../utils/retry.js";
import { executeNotionRequest } from "../utils/rate-limit.js";
import { createRepoLensError } from "../utils/errors.js";

function notionHeaders() {
  const token = process.env.NOTION_TOKEN;
  const version = process.env.NOTION_VERSION || "2022-06-28";

  if (!token) {
    throw createRepoLensError("NOTION_TOKEN_MISSING");
  }

  return {
    Authorization: `Bearer ${token}`,
    "Notion-Version": version,
    "Content-Type": "application/json"
  };
}

async function notionRequest(method, url, body) {
  return await executeNotionRequest(async () => {
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
  });
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

function parseInlineRichText(text) {
  // Parse inline markdown: **bold**, *italic*, `code` into Notion rich_text annotations
  const segments = [];
  let remaining = text;

  while (remaining.length > 0) {
    // Find the earliest inline marker
    const boldIdx = remaining.indexOf("**");
    const codeIdx = remaining.indexOf("`");
    const italicIdx = remaining.indexOf("*");

    // Collect candidate positions (only real matches)
    const candidates = [];
    if (boldIdx !== -1) candidates.push({ type: "bold", idx: boldIdx });
    if (codeIdx !== -1) candidates.push({ type: "code", idx: codeIdx });
    if (italicIdx !== -1 && italicIdx !== boldIdx) candidates.push({ type: "italic", idx: italicIdx });

    if (candidates.length === 0) {
      // No more markers — push rest as plain text
      if (remaining) segments.push({ type: "text", text: { content: remaining } });
      break;
    }

    // Pick the earliest marker
    candidates.sort((a, b) => a.idx - b.idx);
    const first = candidates[0];

    // Push any text before the marker as plain
    if (first.idx > 0) {
      segments.push({ type: "text", text: { content: remaining.slice(0, first.idx) } });
    }

    if (first.type === "bold") {
      const endBold = remaining.indexOf("**", first.idx + 2);
      if (endBold === -1) {
        // Unmatched — treat as plain text
        segments.push({ type: "text", text: { content: remaining.slice(first.idx) } });
        break;
      }
      const inner = remaining.slice(first.idx + 2, endBold);
      segments.push({ type: "text", text: { content: inner }, annotations: { bold: true } });
      remaining = remaining.slice(endBold + 2);
    } else if (first.type === "code") {
      const endCode = remaining.indexOf("`", first.idx + 1);
      if (endCode === -1) {
        segments.push({ type: "text", text: { content: remaining.slice(first.idx) } });
        break;
      }
      const inner = remaining.slice(first.idx + 1, endCode);
      segments.push({ type: "text", text: { content: inner }, annotations: { code: true } });
      remaining = remaining.slice(endCode + 1);
    } else if (first.type === "italic") {
      const endItalic = remaining.indexOf("*", first.idx + 1);
      if (endItalic === -1 || remaining[first.idx + 1] === "*") {
        // Unmatched or actually a bold marker
        segments.push({ type: "text", text: { content: remaining.slice(first.idx, first.idx + 1) } });
        remaining = remaining.slice(first.idx + 1);
      } else {
        const inner = remaining.slice(first.idx + 1, endItalic);
        segments.push({ type: "text", text: { content: inner }, annotations: { italic: true } });
        remaining = remaining.slice(endItalic + 1);
      }
    }
  }

  return segments;
}

function markdownToNotionBlocks(markdown) {
  // Safety check: handle undefined/null markdown
  if (!markdown || typeof markdown !== 'string') {
    console.warn(`Warning: markdownToNotionBlocks received invalid markdown: ${typeof markdown}`);
    return [];
  }
  
  const lines = markdown.split("\n");
  const blocks = [];
  let i = 0;

  while (i < lines.length && blocks.length < 100) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) {
      i++;
      continue;
    }

    // Handle code blocks (```language...```)
    if (trimmed.startsWith("```")) {
      const language = trimmed.slice(3).trim() || "plain text";
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
            language: language,
            caption: []
          }
        });
      }

      i++; // Move past closing ```
      continue;
    }

    // Handle dividers (--- or ***)
    if (/^[-*_]{3,}$/.test(trimmed)) {
      blocks.push({
        object: "block",
        type: "divider",
        divider: {}
      });
      i++;
      continue;
    }

    // Handle tables (| header | header |)
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      const tableRows = [];
      while (i < lines.length && lines[i].trim().startsWith("|") && lines[i].trim().endsWith("|")) {
        const row = lines[i].trim();
        // Skip separator rows (|---|---|)
        if (/^\|[\s\-:|]+\|$/.test(row)) {
          i++;
          continue;
        }
        const cells = row.split("|").slice(1, -1).map(c => c.trim());
        tableRows.push(cells);
        i++;
      }

      if (tableRows.length > 0) {
        const columnCount = tableRows[0].length;
        const tableBlock = {
          object: "block",
          type: "table",
          table: {
            table_width: columnCount,
            has_column_header: true,
            has_row_header: false,
            children: tableRows.map((row, rowIdx) => ({
              object: "block",
              type: "table_row",
              table_row: {
                cells: row.slice(0, columnCount).map(cell => parseInlineRichText(cell))
              }
            }))
          }
        };
        // Pad rows that have fewer cells than the header
        for (const child of tableBlock.table.children) {
          while (child.table_row.cells.length < columnCount) {
            child.table_row.cells.push([{ type: "text", text: { content: "" } }]);
          }
        }
        blocks.push(tableBlock);
      }
      continue;
    }

    // Handle headings
    if (trimmed.startsWith("### ")) {
      blocks.push({
        object: "block",
        type: "heading_3",
        heading_3: {
          rich_text: parseInlineRichText(trimmed.replace(/^### /, ""))
        }
      });
      i++;
      continue;
    }

    if (trimmed.startsWith("## ")) {
      blocks.push({
        object: "block",
        type: "heading_2",
        heading_2: {
          rich_text: parseInlineRichText(trimmed.replace(/^## /, ""))
        }
      });
      i++;
      continue;
    }

    if (trimmed.startsWith("# ")) {
      blocks.push({
        object: "block",
        type: "heading_1",
        heading_1: {
          rich_text: parseInlineRichText(trimmed.replace(/^# /, ""))
        }
      });
      i++;
      continue;
    }

    // Handle blockquotes (> text) → Notion callout block
    if (trimmed.startsWith("> ")) {
      const quoteLines = [];
      while (i < lines.length && lines[i].trim().startsWith("> ")) {
        quoteLines.push(lines[i].trim().replace(/^> /, ""));
        i++;
      }
      blocks.push({
        object: "block",
        type: "callout",
        callout: {
          rich_text: parseInlineRichText(quoteLines.join(" ")),
          icon: { emoji: "💡" }
        }
      });
      continue;
    }

    // Handle numbered lists (1. text, 2. text, etc.)
    if (/^\d+\.\s/.test(trimmed)) {
      blocks.push({
        object: "block",
        type: "numbered_list_item",
        numbered_list_item: {
          rich_text: parseInlineRichText(trimmed.replace(/^\d+\.\s/, ""))
        }
      });
      i++;
      continue;
    }

    // Handle bullet lists (- text or * text)
    if (/^[-*]\s/.test(trimmed)) {
      blocks.push({
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: {
          rich_text: parseInlineRichText(trimmed.replace(/^[-*]\s/, ""))
        }
      });
      i++;
      continue;
    }

    // Handle regular paragraphs with inline rich text
    blocks.push({
      object: "block",
      type: "paragraph",
      paragraph: {
        rich_text: parseInlineRichText(trimmed)
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

