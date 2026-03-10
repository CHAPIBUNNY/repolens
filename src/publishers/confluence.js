import fetch from "node-fetch";
import fs from "node:fs/promises";
import path from "node:path";
import { log, info, warn } from "../utils/logger.js";
import { fetchWithRetry } from "../utils/retry.js";
import { getCurrentBranch, getBranchQualifiedTitle } from "../utils/branch.js";
import { createRepoLensError } from "../utils/errors.js";

/**
 * Confluence Publisher for RepoLens
 * 
 * Supports: Atlassian Cloud (REST API v1)
 * Content Format: Storage Format (Confluence's HTML-like format)
 * Authentication: Email + API Token
 * 
 * Environment Variables Required:
 * - CONFLUENCE_URL: Your Confluence base URL (e.g., https://your-company.atlassian.net/wiki)
 * - CONFLUENCE_EMAIL: Your Atlassian account email
 * - CONFLUENCE_API_TOKEN: API token from https://id.atlassian.com/manage-profile/security/api-tokens
 * - CONFLUENCE_SPACE_KEY: Space key where docs will be published (e.g., DOCS, ENG)
 * - CONFLUENCE_PARENT_PAGE_ID: Parent page ID under which RepoLens docs will be created
 */

function confluenceHeaders() {
  const email = process.env.CONFLUENCE_EMAIL;
  const token = process.env.CONFLUENCE_API_TOKEN;

  if (!email || !token) {
    throw createRepoLensError("CONFLUENCE_SECRETS_MISSING");
  }

  // Basic Auth for Atlassian Cloud: base64(email:api_token)
  const auth = Buffer.from(`${email}:${token}`).toString("base64");

  return {
    Authorization: `Basic ${auth}`,
    "Content-Type": "application/json",
    Accept: "application/json"
  };
}

function getConfluenceBaseUrl() {
  const url = process.env.CONFLUENCE_URL;
  if (!url) {
    throw new Error(
      "Missing CONFLUENCE_URL. Set this to your Confluence base URL. " +
      "Examples:\n" +
      "  - Cloud: https://your-company.atlassian.net/wiki\n" +
      "  - Server: https://confluence.yourcompany.com"
    );
  }
  
  // Normalize URL (remove trailing slash, ensure /wiki for Cloud)
  let normalized = url.replace(/\/+$/, "");
  
  // For Atlassian Cloud, ensure /wiki is present
  if (normalized.includes("atlassian.net") && !normalized.endsWith("/wiki")) {
    normalized = `${normalized}/wiki`;
  }
  
  return normalized;
}

async function confluenceRequest(method, endpoint, body = null) {
  const baseUrl = getConfluenceBaseUrl();
  const url = `${baseUrl}/rest/api${endpoint}`;
  
  log(`Confluence API: ${method} ${endpoint}`);
  
  const res = await fetchWithRetry(
    url,
    {
      method,
      headers: confluenceHeaders(),
      body: body ? JSON.stringify(body) : undefined
    },
    {
      retries: 3,
      baseDelayMs: 1000,
      maxDelayMs: 5000,
      label: `Confluence ${method} ${endpoint}`
    }
  );

  if (!res.ok) {
    const text = await res.text();
    let errorMsg = `Confluence API error ${res.status}: ${text}`;
    
    // Provide helpful error messages
    if (res.status === 401) {
      errorMsg += "\n\nAuthentication failed. Please check:\n" +
        "  1. CONFLUENCE_EMAIL is correct\n" +
        "  2. CONFLUENCE_API_TOKEN is valid (generate new one if needed)\n" +
        "  3. For Cloud: Use your Atlassian account email\n" +
        "  4. For Server: Use your username instead of email";
    } else if (res.status === 404) {
      errorMsg += "\n\nPage or space not found. Please check:\n" +
        "  1. CONFLUENCE_SPACE_KEY is correct\n" +
        "  2. CONFLUENCE_PARENT_PAGE_ID exists\n" +
        "  3. You have access to this space";
    } else if (res.status === 403) {
      errorMsg += "\n\nPermission denied. Please ensure:\n" +
        "  1. Your Confluence user has edit permissions in the space\n" +
        "  2. The space is not restricted";
    }
    
    throw new Error(errorMsg);
  }

  return await res.json();
}

// Cache management (similar to Notion)
const CACHE_DIR = path.join(process.cwd(), ".cache");

function getCacheFile() {
  const branch = getCurrentBranch();
  return path.join(CACHE_DIR, `confluence-pages-${branch}.json`);
}

async function readCache() {
  try {
    const cacheFile = getCacheFile();
    const raw = await fs.readFile(cacheFile, "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function writeCache(cache) {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  const cacheFile = getCacheFile();
  await fs.writeFile(cacheFile, JSON.stringify(cache, null, 2), "utf8");
}

// Convert Markdown to Confluence Storage Format
function markdownToConfluenceStorage(markdown) {
  // Basic Markdown → Storage Format conversion
  // Storage Format is Confluence's HTML-like format
  
  // STEP 1: Extract and convert code blocks FIRST (before escaping)
  const codeBlocks = [];
  let html = markdown.replace(/```(\w+)?\n([\s\S]+?)```/g, (match, lang, code) => {
    const language = lang || "none";
    const placeholder = `<<<CODE_BLOCK_${codeBlocks.length}>>>`;
    codeBlocks.push(`<ac:structured-macro ac:name="code"><ac:parameter ac:name="language">${language}</ac:parameter><ac:plain-text-body><![CDATA[${code}]]></ac:plain-text-body></ac:structured-macro>`);
    return placeholder;
  });
  
  // STEP 2: Now escape HTML entities (won't affect code blocks)
  html = html
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    
    // Headers
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    
    // Bold
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    
    // Italic
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    
    // Inline code
    .replace(/`(.+?)`/g, "<code>$1</code>")
    
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    
    // Horizontal rules
    .replace(/^---$/gm, "<hr />")
    
    // Lists - unordered
    .replace(/^- (.+)$/gm, "<ul><li>$1</li></ul>")
    
    // Lists - ordered
    .replace(/^\d+\. (.+)$/gm, "<ol><li>$1</li></ol>")
    
    // Paragraphs (lines followed by blank line)
    .replace(/^([^<\n].+)$/gm, "<p>$1</p>")
    
    // Clean up consecutive list tags
    .replace(/<\/ul>\s*<ul>/g, "")
    .replace(/<\/ol>\s*<ol>/g, "")
    
    // Line breaks
    .replace(/\n/g, "");

  // STEP 3: Restore code blocks
  codeBlocks.forEach((block, index) => {
    html = html.replace(`&lt;&lt;&lt;CODE_BLOCK_${index}&gt;&gt;&gt;`, block);
  });

  return html;
}

// Find existing page by title
async function findPageByTitle(spaceKey, title) {
  try {
    const result = await confluenceRequest(
      "GET",
      `/content?spaceKey=${spaceKey}&title=${encodeURIComponent(title)}&expand=version`
    );
    
    if (result.results && result.results.length > 0) {
      return result.results[0];
    }
    return null;
  } catch (err) {
    warn(`Could not search for existing page "${title}": ${err.message}`);
    return null;
  }
}

// Create a new Confluence page
async function createPage(spaceKey, parentPageId, title, storageContent) {
  const body = {
    type: "page",
    title: title,
    space: { key: spaceKey },
    body: {
      storage: {
        value: storageContent,
        representation: "storage"
      }
    }
  };

  // Add parent if specified
  if (parentPageId) {
    body.ancestors = [{ id: parentPageId }];
  }

  const page = await confluenceRequest("POST", "/content", body);
  info(`✓ Created Confluence page: ${title}`);
  return page;
}

// Update an existing Confluence page
async function updatePage(pageId, title, storageContent, currentVersion) {
  const body = {
    version: {
      number: currentVersion + 1
    },
    title: title,
    type: "page",
    body: {
      storage: {
        value: storageContent,
        representation: "storage"
      }
    }
  };

  const page = await confluenceRequest("PUT", `/content/${pageId}`, body);
  info(`✓ Updated Confluence page: ${title} (v${currentVersion + 1})`);
  return page;
}

// Publish a single document page
async function publishPage(cfg, key, markdown, cache) {
  const spaceKey = process.env.CONFLUENCE_SPACE_KEY;
  const parentPageId = process.env.CONFLUENCE_PARENT_PAGE_ID;
  
  if (!spaceKey) {
    throw new Error("Missing CONFLUENCE_SPACE_KEY environment variable");
  }

  // Get human-readable title
  const titleMap = {
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
    developer_onboarding: "Developer Onboarding"
  };

  let title = titleMap[key] || key;
  
  // Add project prefix if configured
  if (cfg.project?.docs_title_prefix) {
    title = `${cfg.project.docs_title_prefix} — ${title}`;
  }

  // Add branch qualifier for non-main branches
  const currentBranch = getCurrentBranch();
  title = getBranchQualifiedTitle(title, currentBranch, cfg);

  // Convert Markdown to Confluence Storage Format
  const storageContent = markdownToConfluenceStorage(markdown);

  // Check cache first
  let existingPage = cache[key];
  
  // If not in cache, search by title
  if (!existingPage) {
    existingPage = await findPageByTitle(spaceKey, title);
    
    if (existingPage) {
      // Found it, update cache
      cache[key] = {
        id: existingPage.id,
        title: existingPage.title,
        version: existingPage.version.number
      };
      // Update existingPage to match cache structure (version as number)
      existingPage = cache[key];
    }
  } else {
    // Verify cached page still exists
    try {
      const verified = await confluenceRequest("GET", `/content/${existingPage.id}?expand=version`);
      existingPage.version = verified.version.number;
    } catch (err) {
      warn(`Cached page ${existingPage.id} not found, will create new page`);
      existingPage = null;
      delete cache[key];
    }
  }

  let page;
  if (existingPage) {
    // Update existing page
    page = await updatePage(existingPage.id, title, storageContent, existingPage.version);
  } else {
    // Create new page
    page = await createPage(spaceKey, parentPageId, title, storageContent);
  }

  // Update cache
  cache[key] = {
    id: page.id,
    title: page.title,
    version: page.version.number
  };

  return page;
}

// Main export: Publish all pages to Confluence
export async function publishToConfluence(cfg, renderedPages) {
  const baseUrl = getConfluenceBaseUrl();
  const spaceKey = process.env.CONFLUENCE_SPACE_KEY;
  
  info(`Publishing to Confluence: ${baseUrl}`);
  info(`Space: ${spaceKey}`);

  // Load cache
  const cache = await readCache();

  // Publish each page
  const published = [];
  for (const [key, markdown] of Object.entries(renderedPages)) {
    try {
      const page = await publishPage(cfg, key, markdown, cache);
      published.push({
        key,
        pageId: page.id,
        url: `${baseUrl}/pages/viewpage.action?pageId=${page.id}`
      });
    } catch (err) {
      warn(`Failed to publish ${key}: ${err.message}`);
      throw err; // Re-throw to signal publishing failure
    }
  }

  // Save cache
  await writeCache(cache);

  // Print summary
  info(`\n📚 Published ${published.length} pages to Confluence:`);
  published.forEach(p => {
    info(`   ${p.key}: ${p.url}`);
  });

  return published;
}

// Helper: Check if Confluence secrets are configured
export function hasConfluenceSecrets() {
  return !!(
    process.env.CONFLUENCE_URL &&
    process.env.CONFLUENCE_EMAIL &&
    process.env.CONFLUENCE_API_TOKEN &&
    process.env.CONFLUENCE_SPACE_KEY
  );
}

// Helper: Validate Confluence configuration
export function validateConfluenceConfig() {
  const missing = [];
  
  if (!process.env.CONFLUENCE_URL) missing.push("CONFLUENCE_URL");
  if (!process.env.CONFLUENCE_EMAIL) missing.push("CONFLUENCE_EMAIL");
  if (!process.env.CONFLUENCE_API_TOKEN) missing.push("CONFLUENCE_API_TOKEN");
  if (!process.env.CONFLUENCE_SPACE_KEY) missing.push("CONFLUENCE_SPACE_KEY");
  
  if (missing.length > 0) {
    return {
      valid: false,
      missing: missing,
      message: `Missing required Confluence environment variables: ${missing.join(", ")}\n\n` +
        "Get started:\n" +
        "  1. Get API token: https://id.atlassian.com/manage-profile/security/api-tokens\n" +
        "  2. Set CONFLUENCE_URL to your Confluence base URL\n" +
        "  3. Set CONFLUENCE_EMAIL to your Atlassian account email\n" +
        "  4. Set CONFLUENCE_API_TOKEN to your API token\n" +
        "  5. Set CONFLUENCE_SPACE_KEY to your space key (e.g., DOCS, ENG)\n" +
        "  6. (Optional) Set CONFLUENCE_PARENT_PAGE_ID for nested docs"
    };
  }
  
  return { valid: true };
}
