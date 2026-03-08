import fs from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { info, warn } from "./utils/logger.js";

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

const DEFAULT_GITHUB_WORKFLOW = `name: RepoLens

on:
  push:
    branches:
      - main
  pull_request:
    types:
      - opened
      - synchronize
      - reopened

permissions:
  contents: read
  pull-requests: write
  issues: write

jobs:
  publish-docs:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install RepoLens dependencies
        run: |
          cd tools/repolens
          npm ci

      - name: Run RepoLens and publish to Notion
        env:
          NOTION_TOKEN: \${{ secrets.NOTION_TOKEN }}
          NOTION_PARENT_PAGE_ID: \${{ secrets.NOTION_PARENT_PAGE_ID }}
          NOTION_VERSION: 2022-06-28
          GITHUB_TOKEN: \${{ github.token }}
        run: |
          cd tools/repolens
          node src/cli.js --config ../../.repolens.yml
`;

const DEFAULT_ENV_EXAMPLE = `NOTION_TOKEN=
NOTION_PARENT_PAGE_ID=
NOTION_VERSION=2022-06-28
`;

const DEFAULT_REPOLENS_README = `# RepoLens Setup

This repository has been initialized for RepoLens.

## What RepoLens created

- \`.repolens.yml\` — RepoLens configuration
- \`.github/workflows/repolens.yml\` — GitHub Actions workflow
- \`.env.example\` — local environment template
- \`README.repolens.md\` — this onboarding guide

## Required GitHub Secrets

Add these repository secrets in GitHub:

- \`NOTION_TOKEN\`
- \`NOTION_PARENT_PAGE_ID\`

## Local Usage

Run RepoLens locally from the RepoLens tool directory:

\`\`\`bash
cd tools/repolens
node src/cli.js --config ../../.repolens.yml
\`\`\`

Run with verbose logging:

\`\`\`bash
cd tools/repolens
node src/cli.js --config ../../.repolens.yml --verbose
\`\`\`

## CI Usage

RepoLens runs automatically through:

\`.github/workflows/repolens.yml\`

It updates:
- Notion documentation pages
- PR architecture summary comments

## Typical RepoLens Outputs

RepoLens can generate and maintain:

- System Overview
- Module Catalog
- API Surface
- Architecture Diff
- Route Map
- System Map

## Next Steps

1. Review \`.repolens.yml\`
2. Add GitHub secrets
3. Commit the generated files
4. Run RepoLens locally
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
    `  - markdown  # Always generate local Markdown files`,
    `  - notion    # Auto-detected: publishes if NOTION_TOKEN is set`,
    ``,
    `# Optional: Configure Notion publishing behavior`,
    `# notion:`,
    `#   branches:`,
    `#     - main        # Only publish from main branch`,
    `#     - staging     # Or add specific branches`,
    `#   includeBranchInTitle: false  # Clean titles without [branch-name]`,
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
  lines.push(`      description: "Generated Mermaid system map of detected modules."`);
  lines.push(``);

  return lines.join("\n");
}

function detectProjectName(repoRoot) {
  return path.basename(repoRoot) || "my-project";
}

async function promptNotionCredentials() {
  // Skip prompts in CI environments or non-interactive terminals
  if (!process.stdin.isTTY || process.env.CI) {
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

export async function runInit(targetDir = process.cwd()) {
  const repoRoot = path.resolve(targetDir);

  // Ensure target directory exists
  await fs.mkdir(repoRoot, { recursive: true });

  // Prompt for Notion credentials interactively
  const notionCredentials = await promptNotionCredentials();

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

  const projectName = detectProjectName(repoRoot);
  const detectedRoots = await detectRepoStructure(repoRoot);
  const configContent = buildRepoLensConfig(projectName, detectedRoots);

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
    info("  2. Run 'npx repolens publish' to generate your first docs");
    info("  3. For GitHub Actions, add these repository secrets:");
    info("     - NOTION_TOKEN");
    info("     - NOTION_PARENT_PAGE_ID");
    info("  4. Commit the generated files (workflow will run automatically)");
  } else {
    info("Next steps:");
    info("  1. Review .repolens.yml to customize your documentation");
    info("  2. To enable Notion publishing:");
    info("     - Copy .env.example to .env and add your credentials, OR");
    info("     - Add GitHub secrets: NOTION_TOKEN, NOTION_PARENT_PAGE_ID");
    info("  3. Run 'npx repolens publish' to test locally");
    info("  4. Commit the generated files");
  }
}