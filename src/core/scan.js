import fg from "fast-glob";
import fs from "node:fs/promises";
import path from "node:path";
import { info, warn } from "../utils/logger.js";

const norm = (p) => p.replace(/\\/g, "/");

// Performance guardrails
const MAX_FILES_WARNING = 10000;
const MAX_FILES_LIMIT = 50000;

function isNextRoute(file) {
  const f = norm(file);
  return (
    f.includes("/pages/api/") ||
    (f.includes("/app/") && (f.endsWith("/route.ts") || f.endsWith("/route.js")))
  );
}

function isNextPage(file) {
  const f = norm(file);

  if (f.includes("/app/")) {
    return (
      f.endsWith("/page.tsx") ||
      f.endsWith("/page.jsx") ||
      f.endsWith("/page.ts") ||
      f.endsWith("/page.js")
    );
  }

  if (f.includes("/pages/") && !f.includes("/pages/api/")) {
    return (
      f.endsWith(".tsx") ||
      f.endsWith(".jsx") ||
      f.endsWith(".ts") ||
      f.endsWith(".js")
    );
  }

  return false;
}

async function readFileSafe(file) {
  try {
    return await fs.readFile(file, "utf8");
  } catch {
    return "";
  }
}

function moduleKeyForFile(file, moduleRoots) {
  const normalized = norm(file);

  const sortedRoots = [...moduleRoots].sort((a, b) => b.length - a.length);

  for (const root of sortedRoots) {
    if (normalized === root) return root;
    if (normalized.startsWith(`${root}/`)) {
      const remainder = normalized.slice(root.length + 1);
      const nextSegment = remainder.split("/")[0];
      return nextSegment ? `${root}/${nextSegment}` : root;
    }
  }

  const parts = normalized.split("/");
  return parts.length > 1 ? parts[0] : "root";
}

function routePathFromFile(file) {
  const f = norm(file);

  if (f.includes("/app/")) {
    const appIndex = f.indexOf("/app/");
    const relative = f.slice(appIndex + 5);

    const cleaned = relative
      .replace(/\/page\.(ts|tsx|js|jsx)$/, "")
      .replace(/\/route\.(ts|tsx|js|jsx)$/, "")
      .replace(/\[(.*?)\]/g, ":$1")
      .replace(/\/$/, "");

    return cleaned ? `/${cleaned}` : "/";
  }

  if (f.includes("/pages/api/")) {
    const apiIndex = f.indexOf("/pages/api/");
    const relative = f.slice(apiIndex + 11);

    return "/api/" + relative.replace(/\.(ts|tsx|js|jsx)$/, "");
  }

  if (f.includes("/pages/")) {
    const pagesIndex = f.indexOf("/pages/");
    const relative = f.slice(pagesIndex + 7);

    const cleaned = relative
      .replace(/\.(ts|tsx|js|jsx)$/, "")
      .replace(/\/index$/, "")
      .replace(/\[(.*?)\]/g, ":$1")
      .replace(/\/$/, "");

    return cleaned ? `/${cleaned}` : "/";
  }

  return file;
}

async function extractRepoMetadata(repoRoot) {
  const metadata = {
    hasPackageJson: false,
    frameworks: [],
    languages: new Set(),
    buildTools: [],
    testFrameworks: []
  };

  // Try to read package.json
  try {
    const pkgPath = path.join(repoRoot, "package.json");
    const pkgContent = await fs.readFile(pkgPath, "utf8");
    const pkg = JSON.parse(pkgContent);
    metadata.hasPackageJson = true;

    const allDeps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
      ...pkg.optionalDependencies
    };

    // Detect frameworks
    if (allDeps["next"]) metadata.frameworks.push("Next.js");
    if (allDeps["react"]) metadata.frameworks.push("React");
    if (allDeps["vue"]) metadata.frameworks.push("Vue");
    if (allDeps["angular"] || allDeps["@angular/core"]) metadata.frameworks.push("Angular");
    if (allDeps["express"]) metadata.frameworks.push("Express");
    if (allDeps["fastify"]) metadata.frameworks.push("Fastify");
    if (allDeps["nestjs"] || allDeps["@nestjs/core"]) metadata.frameworks.push("NestJS");
    if (allDeps["svelte"]) metadata.frameworks.push("Svelte");
    if (allDeps["solid-js"]) metadata.frameworks.push("Solid");

    // Detect test frameworks
    if (allDeps["vitest"]) metadata.testFrameworks.push("Vitest");
    if (allDeps["jest"]) metadata.testFrameworks.push("Jest");
    if (allDeps["mocha"]) metadata.testFrameworks.push("Mocha");
    if (allDeps["playwright"]) metadata.testFrameworks.push("Playwright");
    if (allDeps["cypress"]) metadata.testFrameworks.push("Cypress");

    // Detect build tools
    if (allDeps["vite"]) metadata.buildTools.push("Vite");
    if (allDeps["webpack"]) metadata.buildTools.push("Webpack");
    if (allDeps["rollup"]) metadata.buildTools.push("Rollup");
    if (allDeps["esbuild"]) metadata.buildTools.push("esbuild");
    if (allDeps["turbo"]) metadata.buildTools.push("Turborepo");

    // Detect TypeScript
    if (allDeps["typescript"]) metadata.languages.add("TypeScript");
  } catch {
    // No package.json or invalid JSON
  }

  return metadata;
}

export async function scanRepo(cfg) {
  const repoRoot = cfg.__repoRoot;

  const files = await fg(cfg.scan.include, {
    cwd: repoRoot,
    ignore: cfg.scan.ignore,
    onlyFiles: true
  });

  // Performance guardrails
  if (files.length > MAX_FILES_LIMIT) {
    throw new Error(
      `Repository too large: ${files.length} files matched scan patterns. ` +
      `Maximum supported: ${MAX_FILES_LIMIT}. Consider refining scan.include patterns.`
    );
  }

  if (files.length > MAX_FILES_WARNING) {
    warn(`Large repository detected: ${files.length} files. Scan may take longer than usual.`);
  }

  const moduleCounts = new Map();

  for (const file of files) {
    const key = moduleKeyForFile(file, cfg.module_roots || []);
    moduleCounts.set(key, (moduleCounts.get(key) || 0) + 1);
  }

  const modules = [...moduleCounts.entries()]
    .map(([key, fileCount]) => ({ key, fileCount }))
    .sort((a, b) => b.fileCount - a.fileCount);

  const apiFiles = files.filter(isNextRoute);
  const api = [];

  for (const file of apiFiles) {
    const absoluteFile = path.join(repoRoot, file);
    const content = await readFileSafe(absoluteFile);
    const methods = [];

    if (content.includes("export async function GET")) methods.push("GET");
    if (content.includes("export async function POST")) methods.push("POST");
    if (content.includes("export async function PUT")) methods.push("PUT");
    if (content.includes("export async function PATCH")) methods.push("PATCH");
    if (content.includes("export async function DELETE")) methods.push("DELETE");

    api.push({
      file,
      path: routePathFromFile(file),
      methods: methods.length ? methods : ["UNKNOWN"]
    });
  }

  const pageFiles = files.filter(isNextPage);
  const pages = pageFiles.map((file) => ({
    file,
    path: routePathFromFile(file)
  }));

  // Extract repository metadata
  const metadata = await extractRepoMetadata(repoRoot);

  // Detect external API integrations
  const externalApis = await detectExternalApis(files, repoRoot);

  return {
    filesCount: files.length,
    modules,
    api,
    pages,
    metadata,
    externalApis
  };
}

async function detectExternalApis(files, repoRoot) {
  const integrations = [];
  const detectedServices = new Set();

  // Common API patterns to detect
  const apiPatterns = [
    {
      name: "OpenAI API",
      patterns: [
        /api\.openai\.com/,
        /chat\/completions/,
        /OPENAI.*API_KEY/,
        /REPOLENS_AI_API_KEY/
      ],
      category: "AI/ML"
    },
    {
      name: "Notion API",
      patterns: [
        /api\.notion\.com/,
        /NOTION_TOKEN/,
        /notion.*pages/
      ],
      category: "Publishing"
    },
    {
      name: "npm Registry",
      patterns: [
        /registry\.npmjs\.org/,
        /npm.*latest/
      ],
      category: "Package Management"
    },
    {
      name: "GitHub API",
      patterns: [
        /api\.github\.com/,
        /GITHUB_TOKEN/
      ],
      category: "Version Control"
    }
  ];

  // Only scan JavaScript/TypeScript files for performance
  const jsFiles = files.filter(f => 
    f.endsWith('.js') || f.endsWith('.ts') || 
    f.endsWith('.jsx') || f.endsWith('.tsx')
  );

  for (const file of jsFiles) {
    const absoluteFile = path.join(repoRoot, file);
    const content = await readFileSafe(absoluteFile);
    
    if (!content) continue;

    for (const { name, patterns, category } of apiPatterns) {
      if (detectedServices.has(name)) continue;

      const matched = patterns.some(pattern => pattern.test(content));
      
      if (matched) {
        integrations.push({
          name,
          category,
          detectedIn: file
        });
        detectedServices.add(name);
      }
    }
  }

  return integrations;
}