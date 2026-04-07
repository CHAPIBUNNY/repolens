// GitHub Wiki Publisher for RepoLens
//
// Publishes rendered documentation to a GitHub repository's wiki.
// The wiki is a separate git repo at {repo-url}.wiki.git.
//
// Environment Variables:
// - GITHUB_TOKEN: Personal access token or Actions token (required)
// - GITHUB_REPOSITORY: owner/repo (auto-set in Actions, or detected from git remote)
//
// Config (.repolens.yml):
//   github_wiki:
//     branches: [main]           # Optional branch filter
//     sidebar: true              # Generate _Sidebar.md (default: true)
//     footer: true               # Generate _Footer.md (default: true)

import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { info, warn } from "../utils/logger.js";
import { getCurrentBranch, getBranchQualifiedTitle, normalizeBranchName } from "../utils/branch.js";

const PAGE_ORDER = [
  "executive_summary",
  "system_overview",
  "business_domains",
  "architecture_overview",
  "module_catalog",
  "route_map",
  "api_surface",
  "data_flows",
  "change_impact",
  "system_map",
  "developer_onboarding",
  "graphql_schema",
  "type_graph",
  "dependency_graph",
  "architecture_drift",
  "arch_diff",
  "security_hotspots",
  "code_health",
];

const PAGE_TITLES = {
  executive_summary: "Executive Summary",
  system_overview: "System Overview",
  business_domains: "Business Domains",
  architecture_overview: "Architecture Overview",
  module_catalog: "Module Catalog",
  route_map: "Route Map",
  api_surface: "API Surface",
  data_flows: "Data Flows",
  change_impact: "Change Impact",
  system_map: "System Map",
  developer_onboarding: "Developer Onboarding",
  graphql_schema: "GraphQL Schema",
  type_graph: "Type Graph",
  dependency_graph: "Dependency Graph",
  architecture_drift: "Architecture Drift",
  arch_diff: "Architecture Diff",
  security_hotspots: "Security Hotspots",
  code_health: "Code Health",
};

const PAGE_DESCRIPTIONS = {
  executive_summary: "High-level project summary for non-technical readers.",
  system_overview: "Snapshot of stack, scale, structure, and detected capabilities.",
  business_domains: "Functional areas inferred from the repository and business logic.",
  architecture_overview: "Layered technical view of the system and its major components.",
  module_catalog: "Structured inventory of modules, directories, and responsibilities.",
  route_map: "Frontend routes and page structure detected across the application.",
  api_surface: "Detected endpoints, handlers, methods, and API structure.",
  data_flows: "How information moves through the system and its major pathways.",
  change_impact: "Contextual architecture changes and likely downstream effects.",
  system_map: "Visual map of system relationships and dependencies.",
  developer_onboarding: "What a new engineer needs to understand the repository quickly.",
  graphql_schema: "GraphQL types, operations, and schema structure.",
  type_graph: "Type-level relationships and structural coupling across the codebase.",
  dependency_graph: "Module and package dependency relationships.",
  architecture_drift: "Detected drift between intended and current architecture patterns.",
  arch_diff: "Architecture-level diff across branches or revisions.",
  security_hotspots: "Security anti-patterns detected with CWE classification and severity ratings.",
  code_health: "Cyclomatic complexity analysis with unified health scores per module.",
};

// Audience-based grouping for Home page
const AUDIENCE_GROUPS = [
  {
    title: "For Stakeholders",
    emoji: "📊",
    keys: ["executive_summary", "business_domains", "data_flows"],
  },
  {
    title: "For Engineers",
    emoji: "🔧",
    keys: [
      "architecture_overview", "module_catalog", "api_surface",
      "route_map", "system_map", "graphql_schema", "type_graph",
      "dependency_graph", "architecture_drift", "security_hotspots", "code_health",
    ],
  },
  {
    title: "For New Contributors",
    emoji: "🚀",
    keys: ["developer_onboarding", "system_overview"],
  },
  {
    title: "Change Tracking",
    emoji: "📋",
    keys: ["change_impact", "arch_diff"],
  },
];

// Sidebar grouping (compact navigation)
const SIDEBAR_GROUPS = [
  {
    title: "Overview",
    keys: [
      "executive_summary", "system_overview", "business_domains",
      "data_flows", "developer_onboarding",
    ],
  },
  {
    title: "Architecture",
    keys: [
      "architecture_overview", "module_catalog", "route_map",
      "api_surface", "system_map", "graphql_schema", "type_graph",
      "dependency_graph", "architecture_drift", "arch_diff", "change_impact",
      "security_hotspots", "code_health",
    ],
  },
];

// Audience labels for page metadata headers
const PAGE_AUDIENCE = {
  executive_summary: "Stakeholders · Leadership",
  system_overview: "All Audiences",
  business_domains: "Stakeholders · Product",
  architecture_overview: "Engineers · Tech Leads",
  module_catalog: "Engineers",
  route_map: "Engineers",
  api_surface: "Engineers",
  data_flows: "Stakeholders · Engineers",
  change_impact: "Engineers · Tech Leads",
  system_map: "All Audiences",
  developer_onboarding: "New Contributors",
  graphql_schema: "Engineers",
  type_graph: "Engineers",
  dependency_graph: "Engineers",
  architecture_drift: "Engineers · Tech Leads",
  arch_diff: "Engineers · Tech Leads",
  security_hotspots: "Engineers · Security",
  code_health: "All Audiences",
};

/**
 * Get the display title for a page key.
 */
function getPageDisplayTitle(key) {
  return PAGE_TITLES[key] || key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Get custom page keys not in the standard order.
 */
function getCustomPageKeys(pageKeys) {
  return pageKeys.filter((key) => !PAGE_ORDER.includes(key));
}

/**
 * Detect the GitHub repository (owner/repo) from environment or git remote.
 */
function detectGitHubRepo() {
  if (process.env.GITHUB_REPOSITORY) {
    return process.env.GITHUB_REPOSITORY;
  }

  try {
    const remoteUrl = execSync("git remote get-url origin", {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();

    const httpsMatch = remoteUrl.match(/github\.com\/([^/]+\/[^/.]+)/);
    if (httpsMatch) return httpsMatch[1];

    const sshMatch = remoteUrl.match(/github\.com:([^/]+\/[^/.]+)/);
    if (sshMatch) return sshMatch[1];
  } catch {
    // git command failed
  }

  return null;
}

/**
 * Build the authenticated wiki clone URL.
 */
function buildWikiCloneUrl(repo, token) {
  return `https://x-access-token:${token}@github.com/${repo}.wiki.git`;
}

/**
 * Convert a page key to a wiki-safe filename.
 */
function pageFileName(key) {
  const title = getPageDisplayTitle(key);
  return title.replace(/\s+/g, "-") + ".md";
}

/**
 * Build a wiki link for a page key.
 */
function wikiLink(key) {
  const display = getPageDisplayTitle(key);
  const slug = pageFileName(key).replace(/\.md$/, "");
  return `[[${display}|${slug}]]`;
}

/**
 * Generate the Home.md page — audience-grouped with descriptions and status.
 */
function generateHome(pageKeys, projectName, branch, repo) {
  const title = getBranchQualifiedTitle(projectName + " Documentation", branch);
  const lines = [
    `# ${title}`,
    "",
    `> Architecture documentation for **${projectName}**, auto-generated by [RepoLens](https://github.com/CHAPIBUNNY/repolens).`,
    "",
    "## Status",
    "",
    `| | |`,
    `|---|---|`,
    `| **Project** | ${projectName} |`,
    `| **Branch** | \`${branch}\` |`,
    `| **Pages** | ${pageKeys.length} |`,
    `| **Publisher** | GitHub Wiki |`,
    `| **Source** | [RepoLens](https://github.com/CHAPIBUNNY/repolens) |`,
    "",
    "---",
    "",
  ];

  // Audience-grouped sections
  for (const group of AUDIENCE_GROUPS) {
    const activeKeys = group.keys.filter((k) => pageKeys.includes(k));
    if (activeKeys.length === 0) continue;

    lines.push(`## ${group.emoji} ${group.title}`, "");
    for (const key of activeKeys) {
      const desc = PAGE_DESCRIPTIONS[key] || "";
      lines.push(`- ${wikiLink(key)}${desc ? " — " + desc : ""}`);
    }
    lines.push("");
  }

  // Custom / plugin pages
  const customKeys = getCustomPageKeys(pageKeys);
  if (customKeys.length > 0) {
    lines.push("## 🧩 Custom Pages", "");
    for (const key of customKeys.sort()) {
      const desc = PAGE_DESCRIPTIONS[key] || "";
      lines.push(`- ${wikiLink(key)}${desc ? " — " + desc : ""}`);
    }
    lines.push("");
  }

  // Recommended reading order
  lines.push(
    "---",
    "",
    "## 📖 Recommended Reading Order",
    "",
    "1. [[Executive Summary|Executive-Summary]] — Start here for a quick overview",
    "2. [[System Overview|System-Overview]] — Understand the stack and scale",
    "3. [[Architecture Overview|Architecture-Overview]] — Deep dive into system design",
    "4. [[Developer Onboarding|Developer-Onboarding]] — Get started contributing",
    "",
    "---",
    "",
    `*This wiki is auto-generated. Manual edits will be overwritten on the next publish.*`,
  );

  return lines.join("\n");
}

/**
 * Generate _Sidebar.md — grouped navigation.
 */
function generateSidebar(pageKeys, projectName, branch) {
  const title = getBranchQualifiedTitle(projectName, branch);
  const lines = [`### ${title}`, "", "[[Home]]", ""];

  for (const group of SIDEBAR_GROUPS) {
    const activeKeys = group.keys.filter((k) => pageKeys.includes(k));
    if (activeKeys.length === 0) continue;

    lines.push(`**${group.title}**`, "");
    for (const key of activeKeys) {
      lines.push(`- ${wikiLink(key)}`);
    }
    lines.push("");
  }

  // Custom / plugin pages
  const customKeys = getCustomPageKeys(pageKeys);
  if (customKeys.length > 0) {
    lines.push("**Custom Pages**", "");
    for (const key of customKeys.sort()) {
      lines.push(`- ${wikiLink(key)}`);
    }
    lines.push("");
  }

  lines.push("---", `*[RepoLens](https://github.com/CHAPIBUNNY/repolens)*`);
  return lines.join("\n");
}

/**
 * Generate _Footer.md.
 */
function generateFooter(branch) {
  const branchNote = branch !== "main" && branch !== "master"
    ? ` · Branch: \`${branch}\``
    : "";
  return [
    "---",
    `📚 Generated by [RepoLens](https://github.com/CHAPIBUNNY/repolens)${branchNote} · [← Home](Home)`,
  ].join("\n");
}

/**
 * Build a metadata header to prepend to each page.
 */
function pageHeader(key, branch) {
  const audience = PAGE_AUDIENCE[key] || "All Audiences";
  return [
    `[← Home](Home)`,
    "",
    `> **Audience:** ${audience} · **Branch:** \`${branch}\` · **Generated by** [RepoLens](https://github.com/CHAPIBUNNY/repolens)`,
    "",
    "---",
    "",
  ].join("\n");
}

/**
 * Run a git command in the specified directory.
 * Token is never exposed in error output.
 */
function git(args, cwd) {
  try {
    return execSync(`git ${args}`, {
      cwd,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
  } catch (err) {
    const sanitized = (err.stderr || err.message || "").replace(
      /x-access-token:[^\s@]+/g,
      "x-access-token:***"
    );
    throw new Error(`Git command failed: git ${args.split(" ")[0]} — ${sanitized}`);
  }
}

/**
 * Publish rendered pages to GitHub Wiki.
 */
export async function publishToGitHubWiki(cfg, renderedPages) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error(
      "Missing GITHUB_TOKEN. Required for GitHub Wiki publishing.\n" +
      "In GitHub Actions, this is available as ${{ secrets.GITHUB_TOKEN }}.\n" +
      "Locally, create a PAT with repo scope: https://github.com/settings/tokens"
    );
  }

  const repo = detectGitHubRepo();
  if (!repo) {
    throw new Error(
      "Could not detect GitHub repository. Set GITHUB_REPOSITORY=owner/repo\n" +
      "or ensure git remote 'origin' points to a GitHub URL."
    );
  }

  const branch = getCurrentBranch();
  const wikiConfig = cfg.github_wiki || {};
  const includeSidebar = wikiConfig.sidebar !== false;
  const includeFooter = wikiConfig.footer !== false;
  const projectName = cfg.project?.name || repo.split("/")[1] || "RepoLens";

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-wiki-"));

  try {
    const cloneUrl = buildWikiCloneUrl(repo, token);

    try {
      git(`clone --depth 1 ${cloneUrl} .`, tmpDir);
    } catch {
      warn("Wiki repository not found — initializing. Enable the wiki tab in GitHub repo settings.");
      // GitHub Wiki uses 'master' as default branch; ensure compatibility
      // regardless of the local git init.defaultBranch setting
      git("init -b master", tmpDir);
      git(`remote add origin ${cloneUrl}`, tmpDir);
    }

    // Only include pages that have actual content
    const populatedPages = Object.entries(renderedPages).filter(
      ([, markdown]) => markdown && markdown.trim().length > 0
    );
    const pageKeys = populatedPages.map(([key]) => key);

    // Write Home.md
    const home = generateHome(pageKeys, projectName, branch, repo);
    await fs.writeFile(path.join(tmpDir, "Home.md"), home, "utf8");

    // Write each rendered page with metadata header
    for (const [key, markdown] of populatedPages) {
      const fileName = pageFileName(key);
      const header = pageHeader(key, branch);
      await fs.writeFile(path.join(tmpDir, fileName), header + markdown, "utf8");
    }

    // Generate sidebar
    if (includeSidebar) {
      const sidebar = generateSidebar(pageKeys, projectName, branch);
      await fs.writeFile(path.join(tmpDir, "_Sidebar.md"), sidebar, "utf8");
    }

    // Generate footer
    if (includeFooter) {
      const footer = generateFooter(branch);
      await fs.writeFile(path.join(tmpDir, "_Footer.md"), footer, "utf8");
    }

    // Stage, commit, push
    git("config user.name \"RepoLens Bot\"", tmpDir);
    git("config user.email \"repolens@users.noreply.github.com\"", tmpDir);
    git("add -A", tmpDir);

    try {
      execSync("git diff --cached --quiet", { cwd: tmpDir, stdio: "pipe" });
      info("GitHub Wiki is already up to date — no changes to push.");
      return;
    } catch {
      // There are staged changes — continue to commit
    }

    const branchLabel = branch !== "main" && branch !== "master" ? ` [${branch}]` : "";
    const commitMsg = `docs: update RepoLens documentation${branchLabel}`;
    git(`commit -m "${commitMsg}"`, tmpDir);

    // GitHub Wiki serves from 'master'; push explicitly to master
    git("push origin HEAD:refs/heads/master", tmpDir);
    info(`GitHub Wiki published (${pageKeys.length} pages): https://github.com/${repo}/wiki`);

  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Check if GitHub Wiki publishing secrets are available.
 */
export function hasGitHubWikiSecrets() {
  return !!process.env.GITHUB_TOKEN;
}
