import fs from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { exec } from "node:child_process";
import { info, warn } from "./utils/logger.js";

const PUBLISHER_CHOICES = ["markdown", "notion", "confluence", "github_wiki"];

// ============================================================================
// URL PARSING HELPERS
// ============================================================================

/**
 * Parse a Confluence URL and extract base URL, space key, and page ID.
 * Handles various URL formats:
 *   - Full page URL: https://company.atlassian.net/wiki/spaces/DOCS/pages/123456/Page+Title
 *   - Space URL: https://company.atlassian.net/wiki/spaces/DOCS
 *   - Base URL: https://company.atlassian.net/wiki
 * Returns: { baseUrl, spaceKey, pageId, isFullUrl }
 */
function parseConfluenceUrl(input) {
  if (!input) return { baseUrl: null, spaceKey: null, pageId: null, isFullUrl: false };
  
  input = input.trim();
  
  // Remove query params and hash
  const cleanUrl = input.split("?")[0].split("#")[0];
  
  try {
    const url = new URL(cleanUrl);
    const pathParts = url.pathname.split("/").filter(Boolean);
    
    // Find '/wiki' position
    const wikiIndex = pathParts.indexOf("wiki");
    if (wikiIndex === -1) {
      // No /wiki in path - might just be base domain
      return { 
        baseUrl: `${url.protocol}//${url.host}/wiki`, 
        spaceKey: null, 
        pageId: null, 
        isFullUrl: false 
      };
    }
    
    const baseUrl = `${url.protocol}//${url.host}/wiki`;
    let spaceKey = null;
    let pageId = null;
    
    // Look for /spaces/SPACE_KEY pattern
    const spacesIndex = pathParts.indexOf("spaces");
    if (spacesIndex !== -1 && pathParts[spacesIndex + 1]) {
      spaceKey = pathParts[spacesIndex + 1];
    }
    
    // Look for /pages/PAGE_ID pattern
    const pagesIndex = pathParts.indexOf("pages");
    if (pagesIndex !== -1 && pathParts[pagesIndex + 1]) {
      pageId = pathParts[pagesIndex + 1];
    }
    
    return {
      baseUrl,
      spaceKey,
      pageId,
      isFullUrl: Boolean(spaceKey || pageId),
    };
  } catch {
    // Not a valid URL - return as-is
    return { baseUrl: input, spaceKey: null, pageId: null, isFullUrl: false };
  }
}

/**
 * Parse a Notion URL or page ID and extract the page ID.
 * Handles various formats:
 *   - Full URL: https://www.notion.so/workspace/Page-Title-abc123def456
 *   - Short URL: https://notion.so/abc123def456
 *   - Just the page ID: abc123def456 or abc123-def456-...
 * Returns: { pageId, isUrl }
 */
function parseNotionInput(input) {
  if (!input) return { pageId: null, isUrl: false };
  
  input = input.trim();
  
  // Check if it looks like a URL
  if (input.includes("notion.so") || input.includes("notion.site")) {
    try {
      const url = new URL(input.startsWith("http") ? input : `https://${input}`);
      const pathParts = url.pathname.split("/").filter(Boolean);
      
      // The last path segment typically contains the page ID
      // Format: "Page-Title-abc123def456ghi789" - ID is the last 32 hex chars
      const lastPart = pathParts[pathParts.length - 1] || "";
      
      // Try to extract the 32-char hex ID from the end
      const idMatch = lastPart.match(/([a-f0-9]{32})$/i);
      if (idMatch) {
        return { pageId: idMatch[1], isUrl: true };
      }
      
      // Try format with dashes: abc123-def456-...
      const dashedMatch = lastPart.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i);
      if (dashedMatch) {
        return { pageId: dashedMatch[1].replace(/-/g, ""), isUrl: true };
      }
      
      // Last segment might be the ID directly
      const cleanId = lastPart.replace(/-/g, "");
      if (/^[a-f0-9]{32}$/i.test(cleanId)) {
        return { pageId: cleanId, isUrl: true };
      }
      
      return { pageId: null, isUrl: true };
    } catch {
      return { pageId: null, isUrl: false };
    }
  }
  
  // Not a URL - might be raw page ID
  const cleanId = input.replace(/-/g, "");
  if (/^[a-f0-9]{32}$/i.test(cleanId)) {
    return { pageId: cleanId, isUrl: false };
  }
  
  // Return as-is (might be invalid)
  return { pageId: input, isUrl: false };
}

/**
 * Test Confluence credentials by fetching space info.
 */
async function testConfluenceCredentials(url, email, apiToken, spaceKey) {
  try {
    const auth = Buffer.from(`${email}:${apiToken}`).toString("base64");
    const endpoint = `${url}/rest/api/space/${spaceKey}`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Accept": "application/json",
      },
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (response.ok) {
      const data = await response.json();
      return { success: true, spaceName: data.name };
    }
    
    if (response.status === 401) {
      return { success: false, error: "Invalid email or API token" };
    }
    if (response.status === 404) {
      return { success: false, error: `Space '${spaceKey}' not found` };
    }
    
    return { success: false, error: `API error ${response.status}` };
  } catch (err) {
    if (err.name === "AbortError") {
      return { success: false, error: "Connection timed out" };
    }
    return { success: false, error: err.message };
  }
}

/**
 * Test Notion credentials by fetching page info.
 */
async function testNotionCredentials(token, pageId) {
  try {
    const endpoint = `https://api.notion.com/v1/pages/${pageId}`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Notion-Version": "2022-06-28",
      },
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (response.ok) {
      return { success: true };
    }
    
    const errorBody = await response.json().catch(() => ({}));
    
    if (response.status === 401) {
      return { success: false, error: "Invalid token" };
    }
    if (response.status === 404) {
      return { success: false, error: "Page not found — make sure your integration has access to this page" };
    }
    if (errorBody.code === "object_not_found") {
      return { success: false, error: "Page not found — share the page with your integration first" };
    }
    
    return { success: false, error: `API error ${response.status}: ${errorBody.message || ""}` };
  } catch (err) {
    if (err.name === "AbortError") {
      return { success: false, error: "Connection timed out" };
    }
    return { success: false, error: err.message };
  }
}
const AI_PROVIDERS = [
  { value: "github",            label: "GitHub Models  (free in GitHub Actions)", signupUrl: null },
  { value: "openai_compatible", label: "OpenAI / Compatible  (GPT-5, GPT-4o, etc.)", signupUrl: "https://platform.openai.com/api-keys" },
  { value: "anthropic",         label: "Anthropic  (Claude)", signupUrl: "https://console.anthropic.com/settings/keys" },
  { value: "google",            label: "Google  (Gemini)", signupUrl: "https://aistudio.google.com/app/apikey" },
];

// All file extensions we can analyze
const ALL_EXTENSIONS = "js,ts,jsx,tsx,mjs,cjs,py,go,rs,java,rb,php,cs,swift,kt,scala,vue,svelte";

const SCAN_PRESETS = {
  // Universal preset - scans ALL supported languages
  universal: {
    label: "Universal (all languages)",
    description: "Scans all supported file types — best for polyglot projects",
    include: [
      `**/*.{${ALL_EXTENSIONS}}`,
    ],
    roots: ["src", "lib", "app", "pkg", "internal", "cmd", "packages"],
  },
  
  // JavaScript/TypeScript ecosystems
  nextjs: {
    label: "Next.js / React",
    description: "React, Next.js, and frontend TypeScript projects",
    include: [
      "src/**/*.{ts,tsx,js,jsx}",
      "app/**/*.{ts,tsx,js,jsx}",
      "pages/**/*.{ts,tsx,js,jsx}",
      "lib/**/*.{ts,tsx,js,jsx}",
      "components/**/*.{ts,tsx,js,jsx}",
    ],
    roots: ["src", "app", "pages", "lib", "components"],
  },
  express: {
    label: "Express / Node.js",
    description: "Node.js backend APIs and Express servers",
    include: [
      "src/**/*.{ts,js,mjs,cjs}",
      "routes/**/*.{ts,js}",
      "controllers/**/*.{ts,js}",
      "models/**/*.{ts,js}",
      "middleware/**/*.{ts,js}",
      "services/**/*.{ts,js}",
    ],
    roots: ["src", "routes", "controllers", "models", "services"],
  },
  
  // Python ecosystem
  python: {
    label: "Python",
    description: "Django, Flask, FastAPI, and general Python projects",
    include: [
      "**/*.py",
    ],
    roots: ["src", "app", "lib", "api", "core", "services", "models", "views", "utils"],
  },
  
  // Go ecosystem
  golang: {
    label: "Go",
    description: "Go modules with standard layout",
    include: [
      "**/*.go",
    ],
    roots: ["cmd", "pkg", "internal", "api", "server", "handlers"],
  },
  
  // Rust ecosystem
  rust: {
    label: "Rust",
    description: "Cargo projects and Rust libraries",
    include: [
      "**/*.rs",
    ],
    roots: ["src", "lib", "bin", "examples"],
  },
  
  // Java/JVM ecosystem
  java: {
    label: "Java / Kotlin / Scala",
    description: "JVM projects (Maven/Gradle)",
    include: [
      "**/*.{java,kt,scala}",
    ],
    roots: ["src/main/java", "src/main/kotlin", "src/main/scala", "app", "core", "service"],
  },
  
  // Legacy "generic" preserved but improved
  generic: {
    label: "JavaScript/TypeScript only",
    description: "Traditional JS/TS projects",
    include: [
      "**/*.{ts,tsx,js,jsx,mjs,cjs}",
    ],
    roots: ["src", "app", "lib"],
  },
};

const DETECTABLE_ROOTS = [
  "app",
  "src/app",
  "components",
  "src/components",
  "lib",
  "src/lib",
  "hooks",
  "src/hooks",
  "store",
  "src/store",
  "pages",
  "src/pages"
];

const DEFAULT_GITHUB_WORKFLOW = `name: RepoLens Documentation

on:
  push:
    branches:
      - main
  pull_request:

permissions:
  contents: read

jobs:
  publish:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
      
      - name: Generate and publish documentation
        env:
          NOTION_TOKEN: \${{ secrets.NOTION_TOKEN }}
          NOTION_PARENT_PAGE_ID: \${{ secrets.NOTION_PARENT_PAGE_ID }}
          CONFLUENCE_URL: \${{ secrets.CONFLUENCE_URL }}
          CONFLUENCE_EMAIL: \${{ secrets.CONFLUENCE_EMAIL }}
          CONFLUENCE_API_TOKEN: \${{ secrets.CONFLUENCE_API_TOKEN }}
          CONFLUENCE_SPACE_KEY: \${{ secrets.CONFLUENCE_SPACE_KEY }}
          CONFLUENCE_PARENT_PAGE_ID: \${{ secrets.CONFLUENCE_PARENT_PAGE_ID }}
          # AI-enhanced docs: Choose ONE option below
          REPOLENS_AI_ENABLED: true
          # Option A: GitHub Models (free — uses GITHUB_TOKEN)
          REPOLENS_AI_PROVIDER: github
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
          # Option B: OpenAI / Anthropic / Google (comment out Option A, uncomment below)
          # REPOLENS_AI_API_KEY: \${{ secrets.REPOLENS_AI_API_KEY }}
          # REPOLENS_AI_PROVIDER: openai_compatible  # or: anthropic, google
        run: npx @chappibunny/repolens@latest publish
`;

const DEFAULT_ENV_EXAMPLE = `# Notion Publishing
NOTION_TOKEN=
NOTION_PARENT_PAGE_ID=
NOTION_VERSION=2022-06-28

# Confluence Publishing
CONFLUENCE_URL=https://your-company.atlassian.net/wiki
CONFLUENCE_EMAIL=your-email@example.com
CONFLUENCE_API_TOKEN=
CONFLUENCE_SPACE_KEY=DOCS
CONFLUENCE_PARENT_PAGE_ID=

# AI-Assisted Documentation (Optional)
# Enable AI features for natural language explanations
# REPOLENS_AI_ENABLED=true
# REPOLENS_AI_API_KEY=sk-...
# REPOLENS_AI_BASE_URL=https://api.openai.com/v1
# REPOLENS_AI_MODEL=gpt-5-mini
# REPOLENS_AI_MAX_TOKENS=2000

# GitHub Models (free tier — zero-config in GitHub Actions)
# REPOLENS_AI_PROVIDER=github
# Uses GITHUB_TOKEN automatically — no separate API key needed
# REPOLENS_AI_MODEL=gpt-4o-mini
`;

const DEFAULT_REPOLENS_README = `# RepoLens Documentation

This repository is configured to use [RepoLens](https://github.com/CHAPIBUNNY/repolens) (@chappibunny/repolens) for automatic architecture documentation.

## 📋 What RepoLens Created

- \`.repolens.yml\` — Configuration file
- \`.github/workflows/repolens.yml\` — GitHub Actions workflow
- \`.env.example\` — Environment variables template
- \`README.repolens.md\` — This guide

## 🚀 Quick Start

### Local Testing

\`\`\`bash
# Test documentation generation locally
npx @chappibunny/repolens publish
\`\`\`

### Notion Publishing

If you configured Notion credentials during setup, documentation will publish automatically. Otherwise:

1. Copy \`.env.example\` to \`.env\`
2. Add your credentials:
   - \`NOTION_TOKEN\` — Get from https://www.notion.so/my-integrations
   - \`NOTION_PARENT_PAGE_ID\` — The page where docs will be published

### Confluence Publishing

To publish documentation to Atlassian Confluence:

1. Copy \`.env.example\` to \`.env\`
2. Generate an API token: https://id.atlassian.com/manage-profile/security/api-tokens
3. Add your credentials:
   - \`CONFLUENCE_URL\` — Your Confluence base URL (e.g., https://your-company.atlassian.net/wiki)
   - \`CONFLUENCE_EMAIL\` — Your Atlassian account email
   - \`CONFLUENCE_API_TOKEN\` — API token from step 2
   - \`CONFLUENCE_SPACE_KEY\` — Space key (e.g., DOCS, ENG)
   - \`CONFLUENCE_PARENT_PAGE_ID\` — (Optional) Parent page ID for nested docs

### GitHub Actions

For automated publishing on every push:

1. Go to repository Settings → Secrets → Actions
2. Add secrets for your chosen publisher(s):
   
   **For Notion:**
   - \`NOTION_TOKEN\`
   - \`NOTION_PARENT_PAGE_ID\`
   
   **For Confluence:**
   - \`CONFLUENCE_URL\`
   - \`CONFLUENCE_EMAIL\`
   - \`CONFLUENCE_API_TOKEN\`
   - \`CONFLUENCE_SPACE_KEY\`
   - \`CONFLUENCE_PARENT_PAGE_ID\` (optional)

3. Push to main branch

## 📊 Generated Documentation

RepoLens generates documentation in two modes:

### Deterministic Mode (Default - Free)
- **System Overview** — Technical profile and stats
- **Module Catalog** — Complete code inventory
- **API Surface** — Internal endpoints + external integrations
- **Route Map** — Application routes
- **System Map** — Unicode architecture diagram
- **Architecture Diff** — Change tracking

### AI-Enhanced Mode (Optional - Requires API Key)
Adds 5 natural language documents readable by non-technical audiences:
- **Executive Summary** — Project overview for leadership
- **Business Domains** — What the system does by function
- **Architecture Overview** — Layered technical analysis
- **Data Flows** — How information moves through system
- **Developer Onboarding** — Getting started guide

## 🤖 Enabling AI Features

AI features add natural language explanations for non-technical stakeholders.

### Option A: GitHub Models (Free — Recommended for GitHub Actions)

Every GitHub repo gets free access to AI models. In your workflow:
\`\`\`yaml
env:
  REPOLENS_AI_ENABLED: true
  REPOLENS_AI_PROVIDER: github
  GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
\`\`\`
No API key signup needed. Uses \`gpt-4o-mini\` by default.

### Option B: OpenAI / Other Providers

1. Get an API key from your chosen provider
2. Add to your \`.env\` file:
   \`\`\`bash
   REPOLENS_AI_ENABLED=true
   REPOLENS_AI_API_KEY=sk-...
   \`\`\`
3. (Optional) Configure in \`.repolens.yml\`:
   \`\`\`yaml
   ai:
     enabled: true
     mode: hybrid
   
   features:
     executive_summary: true
     business_domains: true
     architecture_overview: true
     data_flows: true
     developer_onboarding: true
   \`\`\`

**Cost estimate**: $0.10-$0.40 per run for typical projects (or free with GitHub Models)

See [AI.md](https://github.com/CHAPIBUNNY/repolens/blob/main/AI.md) for full documentation
- **Module Catalog** — Detected code modules
- **API Surface** — REST API endpoints
- **Route Map** — Application routes
- **System Map** — Architecture diagram (Unicode ASCII art)

## ⚙️ Configuration

Edit \`.repolens.yml\` to customize:

- Scan patterns and ignore rules
- Module detection roots
- Documentation page titles
- Publishing targets

## 📚 Learn More

- [RepoLens GitHub](https://github.com/CHAPIBUNNY/repolens)
- [Configuration Docs](https://github.com/CHAPIBUNNY/repolens#configuration)
- [Troubleshooting](https://github.com/CHAPIBUNNY/repolens#troubleshooting)
`;

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function dirExists(dirPath) {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Open a URL in the default browser (cross-platform).
 */
function openUrl(url) {
  const platform = process.platform;
  let cmd;
  if (platform === "darwin") {
    cmd = `open "${url}"`;
  } else if (platform === "win32") {
    cmd = `start "" "${url}"`;
  } else {
    cmd = `xdg-open "${url}"`;
  }
  return new Promise((resolve) => {
    exec(cmd, (err) => {
      if (err) {
        warn(`Could not open browser: ${err.message}`);
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}

/**
 * Test an AI API key by making a minimal request.
 * Returns { success: true } or { success: false, error: string }.
 */
async function testAIKey(provider, apiKey) {
  try {
    const timeout = 15000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    let url, headers, body;

    if (provider === "github") {
      url = "https://models.inference.ai.azure.com/chat/completions";
      headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      };
      body = JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "Say OK" }],
        max_tokens: 5,
      });
    } else if (provider === "openai_compatible") {
      url = "https://api.openai.com/v1/chat/completions";
      headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      };
      body = JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "Say OK" }],
        max_tokens: 5,
      });
    } else if (provider === "anthropic") {
      url = "https://api.anthropic.com/v1/messages";
      headers = {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      };
      body = JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 5,
        messages: [{ role: "user", content: "Say OK" }],
      });
    } else if (provider === "google") {
      url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
      headers = { "Content-Type": "application/json" };
      body = JSON.stringify({
        contents: [{ parts: [{ text: "Say OK" }] }],
        generationConfig: { maxOutputTokens: 5 },
      });
    } else {
      return { success: false, error: "Unknown provider" };
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      return { success: true };
    }

    const errorBody = await response.text().catch(() => "");
    if (response.status === 401 || response.status === 403) {
      return { success: false, error: "Invalid API key" };
    }
    if (response.status === 429) {
      return { success: false, error: "Rate limited — but key is valid" };
    }
    return { success: false, error: `API error ${response.status}: ${errorBody.slice(0, 100)}` };
  } catch (err) {
    if (err.name === "AbortError") {
      return { success: false, error: "Request timed out" };
    }
    return { success: false, error: err.message };
  }
}

async function detectRepoStructure(repoRoot) {
  const detectedRoots = [];

  for (const relativePath of DETECTABLE_ROOTS) {
    const absolutePath = path.join(repoRoot, relativePath);
    if (await dirExists(absolutePath)) {
      detectedRoots.push(relativePath);
    }
  }

  return detectedRoots;
}

function buildIncludePatterns(detectedRoots) {
  return detectedRoots.map((root) => `${root}/**/*.{ts,tsx,js,jsx,md}`);
}

function buildIgnorePatterns() {
  return [
    "tools/repolens/**",
    "node_modules/**",
    ".next/**",
    "dist/**",
    "build/**",
    "out/**",
    ".git/**",
    "coverage/**",
    "public/**",
    "**/*.test.*",
    "**/*.spec.*",
    "**/__tests__/**",
    "**/__mocks__/**",
    "**/generated/**",
    "**/dist/**",
    "**/esm/**",
    "**/imp/**",
    "**/types/**",
    "**/load-testing/**"
  ];
}

function buildRepoLensConfig(projectName, detectedRoots, options = {}) {
  const includePatterns = buildIncludePatterns(detectedRoots);
  const ignorePatterns = buildIgnorePatterns();
  const enableAI = options.enableAI || false;

  const lines = [
    `configVersion: 1`,
    ``,
    `project:`,
    `  name: "${projectName}"`,
    `  docs_title_prefix: "RepoLens"`,
    ``,
    `publishers:`,
    `  - markdown    # Always generate local Markdown files`,
    `  - notion      # Auto-detected: publishes if NOTION_TOKEN is set`,
    `  - confluence  # Auto-detected: publishes if CONFLUENCE_URL is set`,
    ``,
    `# Optional: Configure Notion publishing behavior`,
    `# notion:`,
    `#   branches:`,
    `#     - main        # Only publish from main branch`,
    `#     - staging     # Or add specific branches`,
    `#   includeBranchInTitle: false  # Clean titles without [branch-name]`,
    ``,
    `# Optional: Configure Confluence publishing behavior`,
    `# confluence:`,
    `#   branches:`,
    `#     - main        # Only publish from main branch`,
    `#     - develop     # Or add specific branches`,
    ``,
    `# Optional: GitHub integration for SVG diagram hosting`,
    `# github:`,
    `#   owner: "your-username"`,
    `#   repo: "your-repo-name"`,
    ``,
  ];

  // AI configuration
  if (enableAI) {
    lines.push(`# AI-enhanced documentation (auto-detected GITHUB_TOKEN)`);
    lines.push(`ai:`);
    lines.push(`  enabled: true`);
    lines.push(`  provider: github`);
    lines.push(``);
    lines.push(`features:`);
    lines.push(`  executive_summary: true`);
    lines.push(`  business_domains: true`);
    lines.push(`  architecture_overview: true`);
    lines.push(`  data_flows: true`);
    lines.push(`  developer_onboarding: true`);
    lines.push(`  change_impact: true`);
    lines.push(``);
  } else {
    lines.push(`# AI-enhanced documentation (free via GitHub Models)`);
    lines.push(`# Uncomment to enable — or set GITHUB_TOKEN and it auto-activates:`);
    lines.push(`# ai:`);
    lines.push(`#   enabled: true`);
    lines.push(`#   provider: github`);
    lines.push(``);
  }

  lines.push(`scan:`);
  lines.push(`  include:`);

  if (includePatterns.length) {
    for (const pattern of includePatterns) {
      lines.push(`    - "${pattern}"`);
    }
  } else {
    lines.push(`    - "src/**/*.{ts,tsx,js,jsx,md}"`);
    lines.push(`    - "app/**/*.{ts,tsx,js,jsx,md}"`);
  }

  lines.push(``);
  lines.push(`  ignore:`);

  for (const pattern of ignorePatterns) {
    lines.push(`    - "${pattern}"`);
  }

  lines.push(``);
  lines.push(`module_roots:`);

  if (detectedRoots.length) {
    for (const root of detectedRoots) {
      lines.push(`  - "${root}"`);
    }
  } else {
    lines.push(`  - "app"`);
    lines.push(`  - "src/app"`);
    lines.push(`  - "components"`);
    lines.push(`  - "src/components"`);
    lines.push(`  - "lib"`);
    lines.push(`  - "src/lib"`);
  }

  lines.push(``);
  lines.push(`outputs:`);
  lines.push(`  pages:`);
  lines.push(`    - key: "system_overview"`);
  lines.push(`      title: "System Overview"`);
  lines.push(`      description: "High-level snapshot of the repo and what RepoLens detected."`);
  lines.push(``);
  lines.push(`    - key: "module_catalog"`);
  lines.push(`      title: "Module Catalog"`);
  lines.push(`      description: "Auto-detected modules with file counts."`);
  lines.push(``);
  lines.push(`    - key: "api_surface"`);
  lines.push(`      title: "API Surface"`);
  lines.push(`      description: "Auto-detected API routes/endpoints."`);
  lines.push(``);
  lines.push(`    - key: "arch_diff"`);
  lines.push(`      title: "Architecture Diff"`);
  lines.push(`      description: "Reserved for PR/merge change summaries."`);
  lines.push(``);
  lines.push(`    - key: "route_map"`);
  lines.push(`      title: "Route Map"`);
  lines.push(`      description: "Detected app routes and API routes."`);
  lines.push(``);
  lines.push(`    - key: "system_map"`);
  lines.push(`      title: "System Map"`);
  lines.push(`      description: "Unicode architecture diagram of detected modules."`);
  lines.push(``);

  return lines.join("\n");
}

function detectProjectName(repoRoot) {
  return path.basename(repoRoot) || "my-project";
}

async function promptNotionCredentials() {
  // Skip prompts in CI environments or test mode
  const isCI = process.env.CI || 
               process.env.GITHUB_ACTIONS || 
               process.env.GITLAB_CI || 
               process.env.CIRCLECI ||
               process.env.JENKINS_HOME ||
               process.env.CODEBUILD_BUILD_ID;
  
  const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST;
  
  if (isCI) {
    info("⏭️  Skipping interactive prompts (CI environment detected)");
    return null;
  }
  
  if (isTest) {
    // Skip silently in test mode
    return null;
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    info("\n📝 Quick Setup — Notion Publishing");
    info("(Use 'repolens init' without --quick for full wizard)\n");
    const useNotion = await rl.question("Would you like to publish to Notion? (Y/n): ");

    if (useNotion.toLowerCase() === 'n') {
      info("Skipping Notion setup. You can configure it later via environment variables.");
      return null;
    }

    info("\nTo find your Notion Parent Page ID:");
    info("  1. Open the Notion page where you want docs published");
    info("  2. Copy the page URL (looks like: notion.so/workspace/abc123...)");
    info("  3. The page ID is the 32-character code at the end\n");

    const parentPageId = await rl.question("NOTION_PARENT_PAGE_ID: ");

    if (!parentPageId || parentPageId.trim() === '') {
      warn("No parent page ID provided. Skipping Notion configuration.");
      return null;
    }

    info("\nTo get your Notion Integration Token:");
    info("  1. Go to https://www.notion.so/my-integrations");
    info("  2. Create a new integration or use an existing one");
    info("  3. Copy the 'Internal Integration Token'");
    info("  4. Share the parent page with your integration\n");

    const token = await rl.question("NOTION_TOKEN: ");

    if (!token || token.trim() === '') {
      warn("No token provided. Skipping Notion configuration.");
      return null;
    }

    return {
      parentPageId: parentPageId.trim(),
      token: token.trim()
    };
  } finally {
    rl.close();
  }
}

async function ensureEnvInGitignore(repoRoot) {
  const gitignorePath = path.join(repoRoot, ".gitignore");
  
  try {
    let gitignoreContent = '';
    
    if (await fileExists(gitignorePath)) {
      gitignoreContent = await fs.readFile(gitignorePath, "utf8");
    }

    // Check if .env is already in .gitignore
    const lines = gitignoreContent.split('\n');
    const hasEnvEntry = lines.some(line => line.trim() === '.env');

    if (!hasEnvEntry) {
      // Add .env to .gitignore
      const newContent = gitignoreContent.trim() + (gitignoreContent.trim() ? '\n' : '') + '.env\n';
      await fs.writeFile(gitignorePath, newContent, "utf8");
      info("Added .env to .gitignore");
    }
  } catch (error) {
    warn(`Could not update .gitignore: ${error.message}`);
  }
}

/**
 * Run a fully interactive configuration wizard.
 * Returns a structured config that replaces the auto-detected defaults.
 */
async function runInteractiveWizard(repoRoot) {
  const isCI = process.env.CI || process.env.GITHUB_ACTIONS || process.env.GITLAB_CI ||
               process.env.CIRCLECI || process.env.JENKINS_HOME || process.env.CODEBUILD_BUILD_ID;
  const isTest = process.env.NODE_ENV === "test" || process.env.VITEST;
  if (isCI || isTest) return null;

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => rl.question(q);

  try {
    info("\n🧙 Interactive Configuration Wizard\n");
    info("This wizard will help you configure RepoLens for your project.");
    info("Press Enter to accept defaults shown in parentheses.\n");

    // 1. Project name
    const defaultName = path.basename(repoRoot) || "my-project";
    const projectName = (await ask(`📦 Project name (${defaultName}): `)).trim() || defaultName;

    // 2. Publishers
    info("\n📤 Select publishers (comma-separated numbers):");
    PUBLISHER_CHOICES.forEach((p, i) => {
      const desc = PUBLISHER_DESCRIPTIONS[p] || "";
      info(`  ${i + 1}. ${p}${desc ? ` — ${desc}` : ""}`);
    });
    const pubInput = (await ask(`Publishers [1] (default: 1 markdown): `)).trim() || "1";
    const publishers = pubInput
      .split(",")
      .map((n) => parseInt(n.trim(), 10))
      .filter((n) => n >= 1 && n <= PUBLISHER_CHOICES.length)
      .map((n) => PUBLISHER_CHOICES[n - 1]);
    if (publishers.length === 0) publishers.push("markdown");

    // 3. Collect credentials for each publisher
    const credentials = {};
    const githubSecretsNeeded = [];

    // Notion setup
    if (publishers.includes("notion")) {
      info("\n📝 Notion Setup");
      info("   ┌────────────────────────────────────────────────────────────┐");
      info("   │ Step 1: Get your Integration Token                          │");
      info("   │   → https://www.notion.so/my-integrations                   │");
      info("   │   → Create new integration → Copy 'Internal Integration Token'│");
      info("   │                                                              │");
      info("   │ Step 2: Share your page with the integration                │");
      info("   │   → Open the page in Notion                                  │");
      info("   │   → Click '...' → 'Add connections' → Select your integration│");
      info("   └────────────────────────────────────────────────────────────┘");
      
      const setupNow = (await ask("\n   Configure Notion credentials now? (Y/n): ")).trim().toLowerCase();
      if (setupNow !== "n") {
        // Token first
        const openNotionPage = (await ask("   Open Notion integrations page in browser? (Y/n): ")).trim().toLowerCase();
        if (openNotionPage !== "n") {
          await openUrl("https://www.notion.so/my-integrations");
          info("   Opening browser... Create or copy your integration token.\n");
        }
        
        const token = (await ask("   NOTION_TOKEN (paste your secret_... token): ")).trim();
        
        if (!token) {
          warn("   No token provided. Skipping Notion setup.");
        } else {
          // Page ID - accept URL or ID
          info("\n   Now paste either:");
          info("   • The full Notion page URL, OR");
          info("   • Just the 32-character page ID\n");
          const pageInput = (await ask("   NOTION_PARENT_PAGE_ID (URL or ID): ")).trim();
          
          const { pageId, isUrl } = parseNotionInput(pageInput);
          
          if (!pageId) {
            warn("   Could not extract page ID from input. Please enter the 32-char ID directly.");
            const retryId = (await ask("   Page ID: ")).trim();
            if (retryId) {
              const retryParsed = parseNotionInput(retryId);
              if (retryParsed.pageId) {
                credentials.notion = { token, parentPageId: retryParsed.pageId };
              }
            }
          } else {
            if (isUrl) {
              info(`   ✓ Extracted page ID: ${pageId}`);
            }
            
            // Test credentials
            info("   Testing Notion connection...");
            const testResult = await testNotionCredentials(token, pageId);
            
            if (testResult.success) {
              info("   ✓ Connection successful! Your integration can access this page.");
              credentials.notion = { token, parentPageId: pageId };
            } else {
              warn(`   ⚠ Connection failed: ${testResult.error}`);
              info("   Common fixes:");
              info("   • Make sure you shared the page with your integration");
              info("   • Check that the token is correct (starts with 'secret_')");
              const saveAnyway = (await ask("   Save credentials anyway? (y/N): ")).trim().toLowerCase();
              if (saveAnyway === "y") {
                credentials.notion = { token, parentPageId: pageId };
                info("   ✓ Credentials saved (verify manually later)");
              } else {
                warn("   Skipping Notion setup. Configure manually later.");
              }
            }
          }
        }
      }
      githubSecretsNeeded.push("NOTION_TOKEN", "NOTION_PARENT_PAGE_ID");
    }

    // Confluence setup
    if (publishers.includes("confluence")) {
      info("\n📝 Confluence Setup");
      info("   ┌────────────────────────────────────────────────────────────┐");
      info("   │ You'll need:                                                │");
      info("   │  • Base URL (e.g., https://company.atlassian.net/wiki)      │");
      info("   │  • Email address for your Atlassian account                 │");
      info("   │  • API token from: id.atlassian.com/manage-profile/security │");
      info("   │  • Space key (e.g., DOCS, ENG, ~username for personal)      │");
      info("   └────────────────────────────────────────────────────────────┘");
      
      const setupNow = (await ask("\n   Configure Confluence credentials now? (Y/n): ")).trim().toLowerCase();
      if (setupNow !== "n") {
        // Open API token page
        const openAtlassian = (await ask("   Open Atlassian API token page in browser? (Y/n): ")).trim().toLowerCase();
        if (openAtlassian !== "n") {
          await openUrl("https://id.atlassian.com/manage-profile/security/api-tokens");
          info("   Opening browser... Create an API token and copy it.\n");
        }
        
        // Ask for URL first - it can contain space key and page ID
        info("\n   Paste either:");
        info("   • A full Confluence page URL (we'll extract the details), OR");
        info("   • Just the base URL (e.g., https://company.atlassian.net/wiki)\n");
        
        const urlInput = (await ask("   CONFLUENCE_URL: ")).trim();
        const parsed = parseConfluenceUrl(urlInput);
        
        let baseUrl = parsed.baseUrl;
        let spaceKey = parsed.spaceKey;
        let pageId = parsed.pageId;
        
        if (parsed.isFullUrl) {
          info(`   ✓ Detected full URL! Extracted:`);
          info(`     • Base URL: ${baseUrl}`);
          if (spaceKey) info(`     • Space Key: ${spaceKey}`);
          if (pageId) info(`     • Page ID: ${pageId}`);
          
          // Confirm extracted base URL
          const confirmBase = (await ask(`\n   Use '${baseUrl}' as base URL? (Y/n): `)).trim().toLowerCase();
          if (confirmBase === "n") {
            baseUrl = (await ask("   Enter base URL: ")).trim();
          }
        } else if (!baseUrl || !baseUrl.includes("/wiki")) {
          warn("   URL should include /wiki (e.g., https://company.atlassian.net/wiki)");
          baseUrl = (await ask("   Enter base URL (with /wiki): ")).trim();
        }
        
        // Email
        const email = (await ask("   CONFLUENCE_EMAIL (your Atlassian email): ")).trim();
        
        // API Token
        const apiToken = (await ask("   CONFLUENCE_API_TOKEN (paste from Atlassian): ")).trim();
        
        // Space Key - use extracted or ask
        if (spaceKey) {
          const confirmSpace = (await ask(`\n   Use space key '${spaceKey}'? (Y/n): `)).trim().toLowerCase();
          if (confirmSpace === "n") {
            info("   Space key examples: DOCS, ENG, DEV, ~username (personal)");
            spaceKey = (await ask("   CONFLUENCE_SPACE_KEY: ")).trim();
          }
        } else {
          info("\n   Space key is in the URL: /wiki/spaces/SPACE_KEY/...");
          info("   Examples: DOCS, ENG, DEV, ~username (for personal spaces)");
          spaceKey = (await ask("   CONFLUENCE_SPACE_KEY: ")).trim();
        }
        
        // Page ID - use extracted or ask
        if (pageId) {
          const confirmPage = (await ask(`   Use page ID '${pageId}' as parent? (Y/n): `)).trim().toLowerCase();
          if (confirmPage === "n") {
            pageId = (await ask("   CONFLUENCE_PARENT_PAGE_ID (optional, press Enter to skip): ")).trim() || null;
          }
        } else {
          info("\n   Parent page ID is in the URL: /wiki/spaces/.../pages/PAGE_ID/...");
          info("   (Optional - leave blank to publish at space root)");
          pageId = (await ask("   CONFLUENCE_PARENT_PAGE_ID: ")).trim() || null;
        }
        
        // Validate required fields
        if (!baseUrl || !email || !apiToken || !spaceKey) {
          warn("   Missing required fields. Skipping Confluence setup.");
        } else {
          // Test connection
          info("\n   Testing Confluence connection...");
          const testResult = await testConfluenceCredentials(baseUrl, email, apiToken, spaceKey);
          
          if (testResult.success) {
            info(`   ✓ Connection successful! Found space: "${testResult.spaceName}"`);
            credentials.confluence = { url: baseUrl, email, apiToken, spaceKey, parentPageId: pageId };
          } else {
            warn(`   ⚠ Connection failed: ${testResult.error}`);
            info("   Common issues:");
            info("   • API token is for your Atlassian account (not Confluence)");
            info("   • Space key is case-sensitive (check URL)");
            info("   • Make sure you have access to the space");
            const saveAnyway = (await ask("   Save credentials anyway? (y/N): ")).trim().toLowerCase();
            if (saveAnyway === "y") {
              credentials.confluence = { url: baseUrl, email, apiToken, spaceKey, parentPageId: pageId };
              info("   ✓ Credentials saved (verify manually later)");
            } else {
              warn("   Skipping Confluence setup. Configure manually later.");
            }
          }
        }
      }
      githubSecretsNeeded.push("CONFLUENCE_URL", "CONFLUENCE_EMAIL", "CONFLUENCE_API_TOKEN", "CONFLUENCE_SPACE_KEY", "CONFLUENCE_PARENT_PAGE_ID");
    }

    // GitHub Wiki setup
    if (publishers.includes("github_wiki")) {
      info("\n📝 GitHub Wiki Setup");
      info("   Requires GITHUB_TOKEN with repo scope.");
      if (process.env.GITHUB_TOKEN) {
        info("   ✓ GITHUB_TOKEN is set in your environment");
      } else {
        warn("   GITHUB_TOKEN not found in environment.");
        info("   For local use: export GITHUB_TOKEN=your_token");
        info("   For GitHub Actions: Uses ${{ secrets.GITHUB_TOKEN }} automatically");
      }
      githubSecretsNeeded.push("GITHUB_TOKEN");
    }

    // 4. AI Configuration
    info("\n🤖 AI-Enhanced Documentation");
    info("   Adds natural language explanations for non-technical stakeholders.");
    const enableAi = (await ask("   Enable AI features? (Y/n): ")).trim().toLowerCase() !== "n";
    
    let aiProvider = null;
    let aiApiKey = null;
    
    if (enableAi) {
      info("\n   Select AI provider:");
      AI_PROVIDERS.forEach((p, i) => info(`     ${i + 1}. ${p.label}`));
      const aiInput = (await ask(`   Provider [1] (default: 1 GitHub Models — free): `)).trim() || "1";
      const idx = parseInt(aiInput, 10);
      const chosen = AI_PROVIDERS[(idx >= 1 && idx <= AI_PROVIDERS.length) ? idx - 1 : 0];
      aiProvider = chosen.value;
      
      if (aiProvider === "github") {
        info("\n   ✨ GitHub Models is free and uses your GITHUB_TOKEN.");
        
        // Check for existing token
        const existingToken = process.env.GITHUB_TOKEN;
        if (existingToken) {
          info("   Testing your GITHUB_TOKEN...");
          const testResult = await testAIKey("github", existingToken);
          if (testResult.success) {
            info("   ✓ GITHUB_TOKEN is valid — AI will work locally and in Actions");
            credentials.ai = { provider: "github", useGitHubToken: true };
          } else {
            warn(`   ⚠ GITHUB_TOKEN test failed: ${testResult.error}`);
            info("   AI will still work in GitHub Actions with ${{ secrets.GITHUB_TOKEN }}");
          }
        } else {
          info("   No GITHUB_TOKEN found in environment.");
          info("   In GitHub Actions: Works automatically with ${{ secrets.GITHUB_TOKEN }}");
          info("   For local testing: export GITHUB_TOKEN=your_personal_access_token");
        }
        githubSecretsNeeded.push("GITHUB_TOKEN");
        credentials.ai = { ...(credentials.ai || {}), provider: "github", enabled: true };
      } else {
        // Non-GitHub provider: help them get an API key
        info(`\n   ${chosen.label} requires an API key.`);
        
        // Offer to open signup URL
        if (chosen.signupUrl) {
          const openBrowser = (await ask(`   Open ${chosen.value} signup page in browser? (Y/n): `)).trim().toLowerCase();
          if (openBrowser !== "n") {
            info(`   Opening ${chosen.signupUrl}...`);
            await openUrl(chosen.signupUrl);
            info("   Create an API key, then paste it below.\n");
          }
        }
        
        const keyInput = (await ask(`   Paste your API key (or press Enter to skip): `)).trim();
        if (keyInput) {
          info("   Testing your API key...");
          const testResult = await testAIKey(aiProvider, keyInput);
          
          if (testResult.success) {
            info("   ✓ API key is valid!");
            aiApiKey = keyInput;
            credentials.ai = { apiKey: keyInput, provider: aiProvider, enabled: true };
          } else if (testResult.error === "Rate limited — but key is valid") {
            info("   ✓ API key is valid (rate limited, but will work)");
            aiApiKey = keyInput;
            credentials.ai = { apiKey: keyInput, provider: aiProvider, enabled: true };
          } else {
            warn(`   ⚠ API key test failed: ${testResult.error}`);
            const useAnyway = (await ask(`   Save this key anyway? (y/N): `)).trim().toLowerCase();
            if (useAnyway === "y") {
              aiApiKey = keyInput;
              credentials.ai = { apiKey: keyInput, provider: aiProvider, enabled: true };
            } else {
              warn("   Skipping AI configuration. You can set REPOLENS_AI_API_KEY later.");
            }
          }
        } else {
          warn("   No API key provided. Set REPOLENS_AI_API_KEY in .env or GitHub secrets.");
        }
        githubSecretsNeeded.push("REPOLENS_AI_API_KEY");
      }
    }

    // 5. Scan preset - detect language from files in repo
    info("\n📂 Language/Framework Preset");
    info("   Determines which file types and directories to scan.\n");
    
    const presetKeys = Object.keys(SCAN_PRESETS);
    presetKeys.forEach((key, i) => {
      const preset = SCAN_PRESETS[key];
      const num = (i + 1).toString().padStart(2);
      info(`   ${num}. ${preset.label}`);
      info(`       ${preset.description}`);
    });
    
    // Default to universal (index 0) since it works for everything
    const defaultPresetIdx = 1;
    const defaultPreset = presetKeys[defaultPresetIdx - 1];
    const defaultLabel = SCAN_PRESETS[defaultPreset].label;
    
    const presetInput = (await ask(`\nPreset [${defaultPresetIdx}] (default: ${defaultPresetIdx} ${defaultLabel}): `)).trim() || String(defaultPresetIdx);
    const presetIdx = parseInt(presetInput, 10);
    const presetKey = presetKeys[(presetIdx >= 1 && presetIdx <= presetKeys.length) ? presetIdx - 1 : defaultPresetIdx - 1];
    const preset = SCAN_PRESETS[presetKey];
    
    info(`   ✓ Selected: ${preset.label}`);

    // 6. Branch filtering
    info("\n🌿 Branch Filtering");
    info("   Limits which branches can publish to Notion/Confluence.");
    const branchInput = (await ask("   Allowed branches (comma-separated, default: main): ")).trim() || "main";
    const branches = branchInput.split(",").map((b) => b.trim()).filter(Boolean);

    // 7. Discord notifications
    info("\n🔔 Discord Notifications");
    const enableDiscord = (await ask("   Enable Discord notifications? (y/N): ")).trim().toLowerCase() === "y";
    
    let discordWebhook = null;
    if (enableDiscord) {
      info("   Get webhook URL from: Server Settings > Integrations > Webhooks");
      discordWebhook = (await ask("   DISCORD_WEBHOOK_URL (leave blank to skip): ")).trim() || null;
      if (discordWebhook) {
        credentials.discord = { webhookUrl: discordWebhook };
      }
      githubSecretsNeeded.push("DISCORD_WEBHOOK_URL");
    }

    // Summary
    info("\n" + "═".repeat(60));
    info("📋 Configuration Summary");
    info("═".repeat(60));
    info(`   Project:    ${projectName}`);
    info(`   Publishers: ${publishers.join(", ")}`);
    info(`   AI:         ${enableAi ? `Enabled (${aiProvider})` : "Disabled"}`);
    info(`   Scan:       ${preset.label}`);
    info(`   Branches:   ${branches.join(", ")}`);
    info(`   Discord:    ${enableDiscord ? "Enabled" : "Disabled"}`);

    // GitHub secrets summary
    const uniqueSecrets = [...new Set(githubSecretsNeeded)];
    if (uniqueSecrets.length > 0) {
      info("\n📌 GitHub Actions Secrets Required:");
      info("   Add these at: https://github.com/YOUR_ORG/YOUR_REPO/settings/secrets/actions");
      for (const secret of uniqueSecrets) {
        const status = credentials[secret.toLowerCase().split("_")[0]] ? "✓" : "○";
        info(`   ${status} ${secret}`);
      }
    }

    info("\n" + "═".repeat(60));
    
    const proceed = (await ask("\nProceed with this configuration? (Y/n): ")).trim().toLowerCase();
    if (proceed === "n") {
      info("Configuration cancelled.");
      return null;
    }

    info("\n✓ Wizard complete. Generating files...\n");
    return { 
      projectName, 
      publishers, 
      enableAi, 
      aiProvider, 
      preset, 
      branches, 
      enableDiscord,
      credentials,
      githubSecretsNeeded: uniqueSecrets
    };
  } finally {
    rl.close();
  }
}

const PUBLISHER_DESCRIPTIONS = {
  markdown: "Local files in .repolens/",
  notion: "Notion workspace pages",
  confluence: "Atlassian Confluence pages",
  github_wiki: "Repository wiki pages",
};

/**
 * Build a .repolens.yml from wizard answers.
 */
function buildWizardConfig(answers) {
  const lines = [
    `configVersion: 1`,
    ``,
    `project:`,
    `  name: "${answers.projectName}"`,
    `  docs_title_prefix: "RepoLens"`,
    ``,
    `publishers:`,
  ];
  for (const p of answers.publishers) {
    lines.push(`  - ${p}`);
  }

  if (answers.publishers.includes("notion") && answers.branches.length) {
    lines.push(``);
    lines.push(`notion:`);
    lines.push(`  branches:`);
    for (const b of answers.branches) lines.push(`    - ${b}`);
    lines.push(`  includeBranchInTitle: false`);
  }
  if (answers.publishers.includes("confluence") && answers.branches.length) {
    lines.push(``);
    lines.push(`confluence:`);
    lines.push(`  branches:`);
    for (const b of answers.branches) lines.push(`    - ${b}`);
  }

  if (answers.enableDiscord) {
    lines.push(``);
    lines.push(`discord:`);
    lines.push(`  enabled: true`);
    lines.push(`  notifyOn: significant`);
    lines.push(`  significantThreshold: 10`);
  }

  if (answers.enableAi) {
    lines.push(``);
    lines.push(`ai:`);
    lines.push(`  enabled: true`);
    lines.push(`  mode: hybrid`);
    if (answers.aiProvider) {
      lines.push(`  provider: ${answers.aiProvider}`);
    }
    lines.push(``);
    lines.push(`features:`);
    lines.push(`  executive_summary: true`);
    lines.push(`  business_domains: true`);
    lines.push(`  architecture_overview: true`);
    lines.push(`  data_flows: true`);
    lines.push(`  developer_onboarding: true`);
    lines.push(`  change_impact: true`);
  }

  lines.push(``);
  lines.push(`scan:`);
  lines.push(`  include:`);
  for (const p of answers.preset.include) lines.push(`    - "${p}"`);
  lines.push(``);
  lines.push(`  ignore:`);
  for (const p of buildIgnorePatterns()) lines.push(`    - "${p}"`);

  lines.push(``);
  lines.push(`module_roots:`);
  for (const r of answers.preset.roots) lines.push(`  - "${r}"`);

  lines.push(``);
  lines.push(`outputs:`);
  lines.push(`  pages:`);
  lines.push(`    - key: "system_overview"`);
  lines.push(`      title: "System Overview"`);
  lines.push(`      description: "High-level snapshot of the repo and what RepoLens detected."`);
  lines.push(``);
  lines.push(`    - key: "module_catalog"`);
  lines.push(`      title: "Module Catalog"`);
  lines.push(`      description: "Auto-detected modules with file counts."`);
  lines.push(``);
  lines.push(`    - key: "api_surface"`);
  lines.push(`      title: "API Surface"`);
  lines.push(`      description: "Auto-detected API routes/endpoints."`);
  lines.push(``);
  lines.push(`    - key: "arch_diff"`);
  lines.push(`      title: "Architecture Diff"`);
  lines.push(`      description: "Reserved for PR/merge change summaries."`);
  lines.push(``);
  lines.push(`    - key: "route_map"`);
  lines.push(`      title: "Route Map"`);
  lines.push(`      description: "Detected app routes and API routes."`);
  lines.push(``);
  lines.push(`    - key: "system_map"`);
  lines.push(`      title: "System Map"`);
  lines.push(`      description: "Unicode architecture diagram of detected modules."`);
  lines.push(``);

  return lines.join("\n");
}

/**
 * Build .env content from wizard credentials.
 */
function buildEnvFromCredentials(credentials) {
  const lines = [];
  
  if (credentials.notion) {
    lines.push("# Notion Publishing");
    lines.push(`NOTION_TOKEN=${credentials.notion.token}`);
    lines.push(`NOTION_PARENT_PAGE_ID=${credentials.notion.parentPageId}`);
    lines.push(`NOTION_VERSION=2022-06-28`);
    lines.push("");
  }
  
  if (credentials.confluence) {
    lines.push("# Confluence Publishing");
    lines.push(`CONFLUENCE_URL=${credentials.confluence.url}`);
    lines.push(`CONFLUENCE_EMAIL=${credentials.confluence.email}`);
    lines.push(`CONFLUENCE_API_TOKEN=${credentials.confluence.apiToken}`);
    lines.push(`CONFLUENCE_SPACE_KEY=${credentials.confluence.spaceKey}`);
    if (credentials.confluence.parentPageId) {
      lines.push(`CONFLUENCE_PARENT_PAGE_ID=${credentials.confluence.parentPageId}`);
    }
    lines.push("");
  }
  
  if (credentials.ai?.enabled) {
    lines.push("# AI Configuration");
    lines.push(`REPOLENS_AI_ENABLED=true`);
    if (credentials.ai.provider) {
      lines.push(`REPOLENS_AI_PROVIDER=${credentials.ai.provider}`);
    }
    if (credentials.ai.apiKey) {
      lines.push(`REPOLENS_AI_API_KEY=${credentials.ai.apiKey}`);
    }
    if (credentials.ai.provider === "github") {
      lines.push("# GitHub Models uses GITHUB_TOKEN (set separately or auto-available in Actions)");
    }
    lines.push("");
  }
  
  if (credentials.discord) {
    lines.push("# Discord Notifications");
    lines.push(`DISCORD_WEBHOOK_URL=${credentials.discord.webhookUrl}`);
    lines.push("");
  }
  
  return lines.join("\n");
}

// Export helper functions for testing
export { parseConfluenceUrl, parseNotionInput };

export async function runInit(targetDir = process.cwd(), options = {}) {
  const repoRoot = path.resolve(targetDir);

  // Ensure target directory exists
  await fs.mkdir(repoRoot, { recursive: true });

  // Interactive wizard is now the default (--quick skips it)
  let wizardAnswers = null;
  if (options.interactive) {
    wizardAnswers = await runInteractiveWizard(repoRoot);
    if (!wizardAnswers) {
      // User cancelled the wizard
      return;
    }
  }

  // Prompt for Notion credentials interactively (only in non-wizard mode)
  const notionCredentials = wizardAnswers ? null : await promptNotionCredentials();

  const repolensConfigPath = path.join(repoRoot, ".repolens.yml");
  const workflowDir = path.join(repoRoot, ".github", "workflows");
  const workflowPath = path.join(workflowDir, "repolens.yml");

  const envExamplePath = path.join(repoRoot, ".env.example");
  const envPath = path.join(repoRoot, ".env");
  const readmePath = path.join(repoRoot, "README.repolens.md");

  const configExists = await fileExists(repolensConfigPath);
  const workflowExists = await fileExists(workflowPath);

  const envExampleExists = await fileExists(envExamplePath);
  const envExists = await fileExists(envPath);
  const readmeExists = await fileExists(readmePath);

  const projectName = wizardAnswers?.projectName || detectProjectName(repoRoot);
  const detectedRoots = wizardAnswers ? [] : await detectRepoStructure(repoRoot);

  // Auto-detect GITHUB_TOKEN for AI enablement
  const hasGitHubToken = !!process.env.GITHUB_TOKEN;
  const configContent = wizardAnswers
    ? buildWizardConfig(wizardAnswers)
    : buildRepoLensConfig(projectName, detectedRoots, { enableAI: hasGitHubToken });

  info(`Detected project name: ${projectName}`);

  if (detectedRoots.length) {
    info(`Detected module roots:`);
    for (const root of detectedRoots) {
      info(`  - ${root}`);
    }
  } else if (!wizardAnswers) {
    info(`No known roots detected. Falling back to default config.`);
  }

  if (!configExists) {
    await fs.writeFile(repolensConfigPath, configContent, "utf8");
    info(`Created ${repolensConfigPath}`);
  } else {
    info(`Skipped existing ${repolensConfigPath}`);
  }

  await fs.mkdir(workflowDir, { recursive: true });

  if (!workflowExists) {
    await fs.writeFile(workflowPath, DEFAULT_GITHUB_WORKFLOW, "utf8");
    info(`Created ${workflowPath}`);
  } else {
    info(`Skipped existing ${workflowPath}`);
  }

  if (!envExampleExists) {
    await fs.writeFile(envExamplePath, DEFAULT_ENV_EXAMPLE, "utf8");
    info(`Created ${envExamplePath}`);
  } else {
    info(`Skipped existing ${envExamplePath}`);
  }

  // Create .env file with collected credentials (wizard mode)
  if (wizardAnswers?.credentials && Object.keys(wizardAnswers.credentials).length > 0 && !envExists) {
    const envContent = buildEnvFromCredentials(wizardAnswers.credentials);
    if (envContent.trim()) {
      await fs.writeFile(envPath, envContent, "utf8");
      info(`✅ Created ${envPath} with your credentials`);
      await ensureEnvInGitignore(repoRoot);
    }
  } 
  // Legacy: Create .env file with Notion credentials (non-wizard mode)
  else if (notionCredentials && !envExists) {
    const envContent = `NOTION_TOKEN=${notionCredentials.token}
NOTION_PARENT_PAGE_ID=${notionCredentials.parentPageId}
NOTION_VERSION=2022-06-28
`;
    await fs.writeFile(envPath, envContent, "utf8");
    info(`✅ Created ${envPath} with your Notion credentials`);
    await ensureEnvInGitignore(repoRoot);
  } else if ((notionCredentials || wizardAnswers?.credentials) && envExists) {
    warn(`Skipped existing ${envPath} - your credentials were not overwritten`);
  }

  if (!readmeExists) {
    await fs.writeFile(readmePath, DEFAULT_REPOLENS_README, "utf8");
    info(`Created ${readmePath}`);
  } else {
    info(`Skipped existing ${readmePath}`);
  }

  info("\n✨ RepoLens initialization complete!\n");

  // Wizard mode: Show tailored summary
  if (wizardAnswers) {
    info("📁 Files created:");
    info("   • .repolens.yml — Configuration");
    info("   • .github/workflows/repolens.yml — GitHub Actions workflow");
    info("   • .env.example — Template for credentials");
    if (wizardAnswers.credentials && Object.keys(wizardAnswers.credentials).length > 0) {
      info("   • .env — Your credentials (gitignored)");
    }
    info("   • README.repolens.md — Getting started guide");

    if (wizardAnswers.githubSecretsNeeded && wizardAnswers.githubSecretsNeeded.length > 0) {
      info("\n🔐 GitHub Actions Secrets:");
      info("   Add at: Settings → Secrets → Actions");
      for (const secret of wizardAnswers.githubSecretsNeeded) {
        info(`   • ${secret}`);
      }
    }

    // Show .env sourcing instructions if credentials were collected
    const hasLocalCredentials = wizardAnswers.credentials && Object.keys(wizardAnswers.credentials).length > 0;
    
    info("\n🚀 Next steps:");
    if (hasLocalCredentials) {
      info("   ┌────────────────────────────────────────────────────────────┐");
      info("   │ IMPORTANT: Your credentials are in .env but not loaded yet │");
      info("   │ Run this BEFORE 'repolens publish':                         │");
      info("   │                                                              │");
      info("   │   source .env                                               │");
      info("   │                                                              │");
      info("   │ This loads your credentials into the current shell.         │");
      info("   └────────────────────────────────────────────────────────────┘");
      info("");
      info("   1. source .env                   ← Load your credentials");
      info("   2. npx @chappibunny/repolens publish   ← Test locally");
    } else {
      info("   1. npx @chappibunny/repolens publish   ← Test locally");
    }
    info(`   ${hasLocalCredentials ? "3" : "2"}. Add GitHub secrets (see above)`);
    info(`   ${hasLocalCredentials ? "4" : "3"}. Commit and push to trigger workflow`);
    info(`   ${hasLocalCredentials ? "5" : "4"}. Run 'npx @chappibunny/repolens doctor' to validate setup`);
    return;
  }

  // Non-wizard mode: Original output
  if (hasGitHubToken && !wizardAnswers) {
    info("🤖 Detected GITHUB_TOKEN — AI-enhanced docs enabled via GitHub Models (free)");
    info("   Your workflow and config are pre-configured. No extra setup needed.\n");
  }
    if (notionCredentials) {
    info("🎉 Notion publishing is ready!");
    info("   Your credentials are stored in .env (gitignored)\n");
    info("Next steps:");
    info("  1. Review .repolens.yml to customize your documentation");
    info("  2. Run 'npx @chappibunny/repolens publish' to generate your first docs (deterministic mode)");
    info("  3. (Optional) Enable AI features:");
    info("     ── FREE: GitHub Models (recommended for GitHub Actions) ──");
    info("     REPOLENS_AI_ENABLED=true");
    info("     REPOLENS_AI_PROVIDER=github");
    info("     (Uses your GITHUB_TOKEN automatically — no API key signup needed)");
    info("     ── Or: OpenAI / Anthropic / Google ──");
    info("     REPOLENS_AI_ENABLED=true");
    info("     REPOLENS_AI_API_KEY=sk-...");
    info("     See AI.md for full guide: https://github.com/CHAPIBUNNY/repolens/blob/main/AI.md");
    info("  4. For GitHub Actions, add these repository secrets:");
    info("     - NOTION_TOKEN");
    info("     - NOTION_PARENT_PAGE_ID");
    info("  5. Commit the generated files (workflow will run automatically)");
  } else {
    info("Next steps:");
    info("  1. Review .repolens.yml to customize your documentation");
    info("  2. To enable Notion publishing:");
    info("     - Copy .env.example to .env and add your credentials, OR");
    info("     - Add GitHub secrets: NOTION_TOKEN, NOTION_PARENT_PAGE_ID");
    if (!hasGitHubToken) {
      info("  3. (Optional) Enable AI features:");
      info("     \u2500\u2500 FREE: GitHub Models (recommended for GitHub Actions) \u2500\u2500");
      info("     REPOLENS_AI_ENABLED=true");
      info("     REPOLENS_AI_PROVIDER=github");
      info("     (Uses your GITHUB_TOKEN automatically \u2014 no API key signup needed)");
      info("     \u2500\u2500 Or: OpenAI / Anthropic / Google \u2500\u2500");
      info("     REPOLENS_AI_ENABLED=true");
      info("     REPOLENS_AI_API_KEY=sk-...");
      info("     See: https://github.com/CHAPIBUNNY/repolens/blob/main/AI.md");
    }
    info(`  ${hasGitHubToken ? "3" : "4"}. Run 'npx @chappibunny/repolens publish' to test locally`);
    info(`  ${hasGitHubToken ? "4" : "5"}. Commit the generated files`);
  }
}