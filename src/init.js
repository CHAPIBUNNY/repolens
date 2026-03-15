import fs from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { info, warn } from "./utils/logger.js";

const PUBLISHER_CHOICES = ["markdown", "notion", "confluence", "github_wiki"];
const AI_PROVIDERS = [
  { value: "github",           label: "GitHub Models  (free in GitHub Actions)" },
  { value: "openai_compatible", label: "OpenAI / Compatible  (GPT-5, GPT-4o, etc.)" },
  { value: "anthropic",         label: "Anthropic  (Claude)" },
  { value: "google",            label: "Google  (Gemini)" },
];
const SCAN_PRESETS = {
  nextjs: {
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
    include: [
      "src/**/*.{ts,js}",
      "routes/**/*.{ts,js}",
      "controllers/**/*.{ts,js}",
      "models/**/*.{ts,js}",
      "middleware/**/*.{ts,js}",
    ],
    roots: ["src", "routes", "controllers", "models"],
  },
  generic: {
    include: [
      "src/**/*.{ts,tsx,js,jsx,md}",
      "app/**/*.{ts,tsx,js,jsx,md}",
      "lib/**/*.{ts,tsx,js,jsx,md}",
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
          # Uncomment to enable free AI-enhanced docs via GitHub Models:
          # REPOLENS_AI_ENABLED: true
          # REPOLENS_AI_PROVIDER: github
          # GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
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

function buildRepoLensConfig(projectName, detectedRoots) {
  const includePatterns = buildIncludePatterns(detectedRoots);
  const ignorePatterns = buildIgnorePatterns();

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
    `scan:`,
    `  include:`
  ];

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
    info("\n📝 Notion Setup (optional)");
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

    // 1. Project name
    const defaultName = path.basename(repoRoot) || "my-project";
    const projectName = (await ask(`Project name (${defaultName}): `)).trim() || defaultName;

    // 2. Publishers
    info("\nSelect publishers (comma-separated numbers):");
    PUBLISHER_CHOICES.forEach((p, i) => info(`  ${i + 1}. ${p}`));
    const pubInput = (await ask(`Publishers [1,2,3] (default: 1): `)).trim() || "1";
    const publishers = pubInput
      .split(",")
      .map((n) => parseInt(n.trim(), 10))
      .filter((n) => n >= 1 && n <= PUBLISHER_CHOICES.length)
      .map((n) => PUBLISHER_CHOICES[n - 1]);
    if (publishers.length === 0) publishers.push("markdown");

    // 3. AI
    const enableAi = (await ask("\nEnable AI-enhanced documentation? (y/N): ")).trim().toLowerCase() === "y";
    let aiProvider = null;
    if (enableAi) {
      info("Select AI provider:");
      AI_PROVIDERS.forEach((p, i) => info(`  ${i + 1}. ${p.label}`));
      const aiInput = (await ask(`Provider [1] (default: 1 GitHub Models — free): `)).trim() || "1";
      const idx = parseInt(aiInput, 10);
      const chosen = AI_PROVIDERS[(idx >= 1 && idx <= AI_PROVIDERS.length) ? idx - 1 : 0];
      aiProvider = chosen.value;
      if (aiProvider === "github") {
        info("\n  ✨ Great choice! GitHub Models uses your existing GITHUB_TOKEN — no extra API key needed.");
        info("     Works automatically in GitHub Actions with the free tier.");
      }
    }

    // 4. Scan preset
    info("\nScan preset:");
    const presetKeys = Object.keys(SCAN_PRESETS);
    presetKeys.forEach((p, i) => info(`  ${i + 1}. ${p}`));
    const presetInput = (await ask(`Preset [3] (default: 3 generic): `)).trim() || "3";
    const presetIdx = parseInt(presetInput, 10);
    const presetKey = presetKeys[(presetIdx >= 1 && presetIdx <= presetKeys.length) ? presetIdx - 1 : 2];
    const preset = SCAN_PRESETS[presetKey];

    // 5. Branch filtering
    const branchInput = (await ask("\nBranches allowed to publish to Notion/Confluence (comma-separated, default: main): ")).trim() || "main";
    const branches = branchInput.split(",").map((b) => b.trim()).filter(Boolean);

    // 6. Discord
    const enableDiscord = (await ask("\nEnable Discord notifications? (y/N): ")).trim().toLowerCase() === "y";

    info("\n✓ Wizard complete. Generating config...\n");
    return { projectName, publishers, enableAi, aiProvider, preset, branches, enableDiscord };
  } finally {
    rl.close();
  }
}

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

export async function runInit(targetDir = process.cwd(), options = {}) {
  const repoRoot = path.resolve(targetDir);

  // Ensure target directory exists
  await fs.mkdir(repoRoot, { recursive: true });

  // Interactive wizard if --interactive flag is set
  let wizardAnswers = null;
  if (options.interactive) {
    wizardAnswers = await runInteractiveWizard(repoRoot);
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
  const configContent = wizardAnswers
    ? buildWizardConfig(wizardAnswers)
    : buildRepoLensConfig(projectName, detectedRoots);

  info(`Detected project name: ${projectName}`);

  if (detectedRoots.length) {
    info(`Detected module roots:`);
    for (const root of detectedRoots) {
      info(`  - ${root}`);
    }
  } else {
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

  // Create .env file with collected credentials
  if (notionCredentials && !envExists) {
    const envContent = `NOTION_TOKEN=${notionCredentials.token}
NOTION_PARENT_PAGE_ID=${notionCredentials.parentPageId}
NOTION_VERSION=2022-06-28
`;
    await fs.writeFile(envPath, envContent, "utf8");
    info(`✅ Created ${envPath} with your Notion credentials`);
    
    // Ensure .env is in .gitignore
    await ensureEnvInGitignore(repoRoot);
  } else if (notionCredentials && envExists) {
    warn(`Skipped existing ${envPath} - your credentials were not overwritten`);
  }

  if (!readmeExists) {
    await fs.writeFile(readmePath, DEFAULT_REPOLENS_README, "utf8");
    info(`Created ${readmePath}`);
  } else {
    info(`Skipped existing ${readmePath}`);
  }

  info("\n✨ RepoLens initialization complete!\n");
  
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
    info("  3. (Optional) Enable AI features:");
    info("     ── FREE: GitHub Models (recommended for GitHub Actions) ──");
    info("     REPOLENS_AI_ENABLED=true");
    info("     REPOLENS_AI_PROVIDER=github");
    info("     (Uses your GITHUB_TOKEN automatically — no API key signup needed)");
    info("     ── Or: OpenAI / Anthropic / Google ──");
    info("     REPOLENS_AI_ENABLED=true");
    info("     REPOLENS_AI_API_KEY=sk-...");
    info("     See: https://github.com/CHAPIBUNNY/repolens/blob/main/AI.md");
    info("  4. Run 'npx @chappibunny/repolens publish' to test locally");
    info("  5. Commit the generated files");
  }
}