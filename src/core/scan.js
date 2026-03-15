import fg from "fast-glob";
import fs from "node:fs/promises";
import path from "node:path";
import { info, warn } from "../utils/logger.js";
import { trackScan } from "../utils/telemetry.js";
import { detectMonorepo } from "../analyzers/monorepo-detector.js";

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

function isExpressRoute(content) {
  // Detect Express.js route patterns
  const expressPatterns = [
    /(?:app|router)\.(get|post|put|patch|delete|all)\s*\(\s*['"`]([^'"`]+)['"`]/gi,
    /(?:app|router)\.route\s*\(\s*['"`]([^'"`]+)['"`]/gi
  ];
  return expressPatterns.some(pattern => pattern.test(content));
}

function isReactRouterFile(content) {
  // Detect React Router patterns — require import evidence, not just string mentions
  const hasImport = /import\s+.*?from\s+['"]react-router/.test(content)
    || /require\s*\(\s*['"]react-router/.test(content);
  const hasJSX = /<Route\s/.test(content);
  const hasFactory = /createBrowserRouter\s*\(/.test(content)
    || /createRoutesFromElements\s*\(/.test(content);
  return hasImport || hasJSX || hasFactory;
}

function isVueRouterFile(content) {
  // Detect Vue Router patterns — require import evidence, not just string mentions
  const hasImport = /import\s+.*?from\s+['"]vue-router/.test(content)
    || /require\s*\(\s*['"]vue-router/.test(content);
  const hasConstructor = /new\s+VueRouter\s*\(/.test(content);
  const hasFactory = /createRouter\s*\(/.test(content) && hasImport;
  return hasImport || hasConstructor || hasFactory;
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

/**
 * Detect languages from file extensions
 */
function detectLanguagesFromFiles(files) {
  const languages = new Set();
  
  // Extension to language mapping
  const extensionMap = {
    // JavaScript/TypeScript
    ".js": "JavaScript",
    ".mjs": "JavaScript",
    ".cjs": "JavaScript",
    ".jsx": "JavaScript",
    ".ts": "TypeScript",
    ".tsx": "TypeScript",
    // Python
    ".py": "Python",
    ".pyw": "Python",
    ".pyi": "Python",
    // Go
    ".go": "Go",
    // Rust
    ".rs": "Rust",
    // Java
    ".java": "Java",
    // C/C++
    ".c": "C",
    ".h": "C",
    ".cpp": "C++",
    ".hpp": "C++",
    ".cc": "C++",
    ".cxx": "C++",
    // C#
    ".cs": "C#",
    // Ruby
    ".rb": "Ruby",
    // PHP
    ".php": "PHP",
    // Swift
    ".swift": "Swift",
    // Kotlin
    ".kt": "Kotlin",
    ".kts": "Kotlin",
    // Scala
    ".scala": "Scala",
    // Shell
    ".sh": "Shell",
    ".bash": "Shell",
    ".zsh": "Shell",
    // SQL
    ".sql": "SQL",
  };

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    if (extensionMap[ext]) {
      languages.add(extensionMap[ext]);
    }
  }

  return languages;
}

async function extractRepoMetadata(repoRoot, files = []) {
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
    if (allDeps["hono"]) metadata.frameworks.push("Hono");
    if (allDeps["koa"]) metadata.frameworks.push("Koa");
    if (allDeps["hapi"] || allDeps["@hapi/hapi"]) metadata.frameworks.push("Hapi");
    if (allDeps["electron"]) metadata.frameworks.push("Electron");

    // Detect test frameworks
    if (allDeps["vitest"]) metadata.testFrameworks.push("Vitest");
    if (allDeps["jest"]) metadata.testFrameworks.push("Jest");
    if (allDeps["mocha"]) metadata.testFrameworks.push("Mocha");
    if (allDeps["playwright"]) metadata.testFrameworks.push("Playwright");
    if (allDeps["cypress"]) metadata.testFrameworks.push("Cypress");
    if (allDeps["ava"]) metadata.testFrameworks.push("Ava");

    // Detect build tools
    if (allDeps["vite"]) metadata.buildTools.push("Vite");
    if (allDeps["webpack"]) metadata.buildTools.push("Webpack");
    if (allDeps["rollup"]) metadata.buildTools.push("Rollup");
    if (allDeps["esbuild"]) metadata.buildTools.push("esbuild");
    if (allDeps["turbo"]) metadata.buildTools.push("Turborepo");
    if (allDeps["tsup"]) metadata.buildTools.push("tsup");
    if (allDeps["swc"] || allDeps["@swc/core"]) metadata.buildTools.push("SWC");
    if (allDeps["parcel"]) metadata.buildTools.push("Parcel");

    // Detect TypeScript from dependencies (supplements file detection)
    if (allDeps["typescript"]) metadata.languages.add("TypeScript");

    // Detect Node.js runtime indicators
    const hasNodeEngines = pkg.engines && pkg.engines.node;
    const hasBin = pkg.bin != null;
    const hasNodeDeps = allDeps["node-fetch"] || allDeps["fs-extra"] || allDeps["dotenv"]
      || allDeps["commander"] || allDeps["yargs"] || allDeps["chalk"]
      || allDeps["inquirer"] || allDeps["ora"] || allDeps["execa"];
    if (hasNodeEngines || hasBin || hasNodeDeps || pkg.type === "module") {
      metadata.languages.add("Node.js");
    }
  } catch {
    // No package.json or invalid JSON
  }

  // Detect Python frameworks and tools
  try {
    // Check for pyproject.toml (modern Python)
    const pyprojectPath = path.join(repoRoot, "pyproject.toml");
    const pyprojectContent = await fs.readFile(pyprojectPath, "utf8");
    metadata.languages.add("Python");
    
    // Detect Python frameworks from pyproject.toml
    if (/django/i.test(pyprojectContent)) metadata.frameworks.push("Django");
    if (/fastapi/i.test(pyprojectContent)) metadata.frameworks.push("FastAPI");
    if (/flask/i.test(pyprojectContent)) metadata.frameworks.push("Flask");
    if (/pytest/i.test(pyprojectContent)) metadata.testFrameworks.push("pytest");
    if (/poetry/i.test(pyprojectContent)) metadata.buildTools.push("Poetry");
  } catch {
    // No pyproject.toml
  }

  try {
    // Check for requirements.txt
    const reqPath = path.join(repoRoot, "requirements.txt");
    const reqContent = await fs.readFile(reqPath, "utf8");
    metadata.languages.add("Python");
    
    if (/django/i.test(reqContent)) metadata.frameworks.push("Django");
    if (/fastapi/i.test(reqContent)) metadata.frameworks.push("FastAPI");
    if (/flask/i.test(reqContent)) metadata.frameworks.push("Flask");
    if (/pytest/i.test(reqContent)) metadata.testFrameworks.push("pytest");
  } catch {
    // No requirements.txt
  }

  try {
    // Check for setup.py (legacy Python)
    await fs.access(path.join(repoRoot, "setup.py"));
    metadata.languages.add("Python");
  } catch {
    // No setup.py
  }

  // Detect Go modules
  try {
    const goModPath = path.join(repoRoot, "go.mod");
    const goModContent = await fs.readFile(goModPath, "utf8");
    metadata.languages.add("Go");
    
    if (/gin-gonic/i.test(goModContent)) metadata.frameworks.push("Gin");
    if (/echo/i.test(goModContent)) metadata.frameworks.push("Echo");
    if (/fiber/i.test(goModContent)) metadata.frameworks.push("Fiber");
  } catch {
    // No go.mod
  }

  // Detect Rust via Cargo.toml
  try {
    const cargoPath = path.join(repoRoot, "Cargo.toml");
    const cargoContent = await fs.readFile(cargoPath, "utf8");
    metadata.languages.add("Rust");
    
    if (/actix/i.test(cargoContent)) metadata.frameworks.push("Actix");
    if (/rocket/i.test(cargoContent)) metadata.frameworks.push("Rocket");
    if (/tokio/i.test(cargoContent)) metadata.frameworks.push("Tokio");
  } catch {
    // No Cargo.toml
  }

  // Merge languages detected from file extensions
  const fileLanguages = detectLanguagesFromFiles(files);
  for (const lang of fileLanguages) {
    metadata.languages.add(lang);
  }

  // De-duplicate frameworks (in case detected from multiple sources)
  metadata.frameworks = [...new Set(metadata.frameworks)];
  metadata.testFrameworks = [...new Set(metadata.testFrameworks)];
  metadata.buildTools = [...new Set(metadata.buildTools)];

  return metadata;
}

function extractExpressRoutes(content) {
  const routes = [];
  const seenRoutes = new Set();

  // Match app.METHOD(path) or router.METHOD(path)
  const methodPattern = /(?:app|router)\.(get|post|put|patch|delete|all)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
  let match;

  while ((match = methodPattern.exec(content)) !== null) {
    const [, method, path] = match;
    const routeKey = `${method.toUpperCase()}:${path}`;
    
    if (!seenRoutes.has(routeKey)) {
      seenRoutes.add(routeKey);
      
     const existing = routes.find(r => r.path === path);
      if (existing) {
        if (!existing.methods.includes(method.toUpperCase())) {
          existing.methods.push(method.toUpperCase());
}
      } else {
        routes.push({
          path,
          methods: [method.toUpperCase()]
        });
      }
    }
  }

  // Match app.route(path).METHOD()
  const routePattern = /(?:app|router)\.route\s*\(\s*['"`]([^'"`]+)['"`]\s*\)([.\s\w()]*)/gi;
  while ((match = routePattern.exec(content)) !== null) {
    const [, path, chain] = match;
    const methods = [];
    
    if (chain.includes(".get(")) methods.push("GET");
    if (chain.includes(".post(")) methods.push("POST");
    if (chain.includes(".put(")) methods.push("PUT");
    if (chain.includes(".patch(")) methods.push("PATCH");
    if (chain.includes(".delete(")) methods.push("DELETE");
    
    if (methods.length > 0) {
      const existing = routes.find(r => r.path === path);
      if (existing) {
        methods.forEach(m => {
          if (!existing.methods.includes(m)) existing.methods.push(m);
        });
      } else {
        routes.push({ path, methods });
      }
    }
  }

  return routes;
}

function extractReactRoutes(content, file) {
  const routes = [];
  const lines = content.split("\n");
  
  // Match <Route path="..." />
  const routePattern = /<Route\s+[^>]*path\s*=\s*['"`]([^'"`]+)['"`][^>]*\/?>/gi;
  let match;

  while ((match = routePattern.exec(content)) !== null) {
    const [, routePath] = match;
    if (isValidRoutePath(routePath)) {
      routes.push({ file, path: routePath, framework: "React Router" });
    }
  }

  // Match path: "..." in route objects (skip comment lines)
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) continue;
    const objectMatch = /path\s*:\s*['"`]([^'"`]+)['"`]/i.exec(trimmed);
    if (objectMatch) {
      const routePath = objectMatch[1];
      if (isValidRoutePath(routePath) && !routes.some(r => r.path === routePath)) {
        routes.push({ file, path: routePath, framework: "React Router" });
      }
    }
  }

  return routes;
}

function extractVueRoutes(content, file) {
  const routes = [];
  const lines = content.split("\n");

  // Match path: '...' or path: "..." in Vue router definitions (skip comment lines)
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) continue;
    const match = /path\s*:\s*['"`]([^'"`]+)['"`]/i.exec(trimmed);
    if (match) {
      const routePath = match[1];
      if (isValidRoutePath(routePath) && !routes.some(r => r.path === routePath)) {
        routes.push({ file, path: routePath, framework: "Vue Router" });
      }
    }
  }

  return routes;
}

function isValidRoutePath(p) {
  // Filter out placeholder/documentation strings and non-path values
  if (!p || p === "..." || p === "*" || p.length > 200) return false;
  // Must look like a URL path (starts with / or is a relative segment)
  return p.startsWith("/") || /^[a-zA-Z0-9]/.test(p);
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

  // Extract Next.js API routes
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
      methods: methods.length ? methods : ["UNKNOWN"],
      framework: "Next.js"
    });
  }

  // Extract Express.js routes
  for (const file of files) {
    if (file.endsWith(".ts") || file.endsWith(".js")) {
      const absoluteFile = path.join(repoRoot, file);
      const content = await readFileSafe(absoluteFile);
      
      if (isExpressRoute(content)) {
        const expressRoutes = extractExpressRoutes(content);
        for (const route of expressRoutes) {
          api.push({
            file,
            path: route.path,
            methods: route.methods,
            framework: "Express"
          });
        }
      }
    }
  }

  const pageFiles = files.filter(isNextPage);
  const pages = pageFiles.map((file) => ({
    file,
    path: routePathFromFile(file),
    framework: "Next.js"
  }));

  // Extract React Router routes
  for (const file of files) {
    if (file.endsWith(".tsx") || file.endsWith(".jsx")) {
      const absoluteFile = path.join(repoRoot, file);
      const content = await readFileSafe(absoluteFile);
      
      if (isReactRouterFile(content)) {
        const reactRoutes = extractReactRoutes(content, file);
        pages.push(...reactRoutes);
      }
    }
  }

  // Extract Vue Router routes
  for (const file of files) {
    if (file.endsWith(".ts") || file.endsWith(".js") || file.endsWith(".vue")) {
      const absoluteFile = path.join(repoRoot, file);
      const content = await readFileSafe(absoluteFile);
      
      if (isVueRouterFile(content)) {
        const vueRoutes = extractVueRoutes(content, file);
        pages.push(...vueRoutes);
      }
    }
  }

  // Extract repository metadata (pass files for language detection)
  const metadata = await extractRepoMetadata(repoRoot, files);

  // Detect external API integrations
  const externalApis = await detectExternalApis(files, repoRoot);

  // Detect monorepo workspaces
  const monorepo = await detectMonorepo(repoRoot);

  const scanResult = {
    filesCount: files.length,
    modules,
    api,
    pages,
    metadata,
    externalApis,
    monorepo,
    _files: files
  };
  
  // Track scan metrics
  trackScan(scanResult);
  
  return scanResult;
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