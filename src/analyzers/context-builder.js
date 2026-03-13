// Build structured AI context from deterministic scan results

import { groupModulesByDomain } from "./domain-inference.js";

export function buildAIContext(scanResult, config) {
  const { filesCount, modules, api, pages, metadata } = scanResult;
  
  // Get domain hints from config if available
  const customHints = config.domains 
    ? Object.entries(config.domains).map(([key, domain]) => ({
        match: domain.match || [],
        domain: key,
        description: domain.description || key
      }))
    : [];
  
  // Group modules by business domain
  const domainGroups = groupModulesByDomain(modules, customHints);
  
  // Identify top modules
  const topModules = modules
    .slice(0, 15)
    .map(m => ({
      key: m.key,
      fileCount: m.fileCount,
      type: inferModuleType(m.key)
    }));
  
  // Categorize routes
  const pageRoutes = pages?.slice(0, 50).map(p => ({
    path: p.path,
    file: p.file,
    type: "page"
  })) || [];
  
  const apiRoutes = api?.slice(0, 50).map(a => ({
    path: a.path,
    file: a.file,
    methods: a.methods,
    type: "api"
  })) || [];
  
  // Build technology profile
  const techStack = {
    frameworks: metadata?.frameworks || [],
    languages: metadata?.languages ? [...metadata.languages] : [],
    buildTools: metadata?.buildTools || [],
    testFrameworks: metadata?.testFrameworks || []
  };
  
  // Identify key architectural patterns
  const patterns = inferArchitecturalPatterns(modules);
  
  // Build compact context object
  return {
    project: {
      name: config.project.name,
      filesScanned: filesCount,
      modulesDetected: modules.length,
      pagesDetected: pages?.length || 0,
      apiRoutesDetected: api?.length || 0
    },
    
    domains: domainGroups.map(d => ({
      name: d.name,
      description: d.description,
      moduleCount: d.modules.length,
      fileCount: d.totalFiles,
      topModules: d.modules.slice(0, 5).map(m => m.key)
    })),
    
    topModules,
    
    routes: {
      pages: pageRoutes,
      apis: apiRoutes
    },
    
    techStack,
    
    patterns,
    
    repoRoots: config.module_roots || [],

    // Monorepo workspace metadata (if detected)
    monorepo: scanResult.monorepo?.isMonorepo ? {
      tool: scanResult.monorepo.tool,
      packageCount: scanResult.monorepo.packages.length,
      packages: scanResult.monorepo.packages.slice(0, 20).map(p => ({
        name: p.name,
        path: p.path,
      })),
    } : undefined,
  };
}

function inferModuleType(modulePath) {
  const lower = modulePath.toLowerCase();
  
  if (lower.includes("test") || lower.includes("spec") || lower.includes("__test")) return "test";
  if (lower.includes("api") || lower.includes("endpoint")) return "api";
  if (lower.includes("component") || lower.includes("widget")) return "ui";
  if (lower.includes("lib") || lower.includes("util") || lower.includes("helper") || lower.includes("common") || lower.includes("shared")) return "library";
  if (lower.includes("hook")) return "hooks";
  if (lower.includes("store") || lower.includes("state") || lower.includes("redux") || lower.includes("zustand")) return "state";
  if (lower.includes("page") || lower.includes("route") || lower.includes("view")) return "route";
  if (lower.includes("config") || lower.includes("setting") || lower.includes("env")) return "config";
  if (lower.includes("core") || lower.includes("kernel") || lower.includes("foundation")) return "core";
  if (lower.includes("render") || lower.includes("template") || lower.includes("format")) return "renderer";
  if (lower.includes("publish") || lower.includes("output") || lower.includes("export")) return "publisher";
  if (lower.includes("analyz") || lower.includes("inspect") || lower.includes("detect")) return "analyzer";
  if (lower.includes("plugin") || lower.includes("extension") || lower.includes("addon")) return "plugin";
  if (lower.includes("deliver") || lower.includes("dispatch") || lower.includes("send")) return "delivery";
  if (lower.includes("doc") || lower.includes("generate")) return "documentation";
  if (lower.includes("integrat") || lower.includes("connect") || lower.includes("adapter")) return "integration";
  if (lower.includes("cli") || lower.includes("command") || lower.includes("bin")) return "cli";
  if (lower.includes("ai") || lower.includes("ml") || lower.includes("model") || lower.includes("prompt")) return "ai";
  if (lower.includes("auth") || lower.includes("login") || lower.includes("session")) return "auth";
  if (lower.includes("data") || lower.includes("db") || lower.includes("model") || lower.includes("schema")) return "data";
  if (lower.includes("middleware")) return "middleware";
  if (lower.includes("service")) return "service";
  if (lower.includes("app")) return "app";
  
  return "other";
}

function inferArchitecturalPatterns(modules) {
  const patterns = [];
  const keys = modules.map(m => m.key.toLowerCase());
  
  const has = (keyword) => keys.some(k => k.includes(keyword));
  
  // Web framework patterns
  if (has("app/")) patterns.push("Next.js App Router");
  if (has("pages/")) patterns.push("Next.js Pages Router");
  if (has("component") && has("lib")) patterns.push("Layered component architecture");
  if (has("hook")) patterns.push("React hooks pattern");
  if (has("store") || has("state") || has("redux") || has("zustand")) patterns.push("Centralized state management");
  
  // General patterns
  if (has("api") || has("endpoint")) patterns.push("API route pattern");
  if (has("core") || has("kernel")) patterns.push("Core/kernel architecture");
  if (has("plugin") || has("extension")) patterns.push("Plugin system");
  if (has("middleware")) patterns.push("Middleware pipeline");
  if (has("render") || has("template")) patterns.push("Renderer pipeline");
  if (has("publish") || has("output")) patterns.push("Multi-output publishing");
  if (has("analyz") || has("detect") || has("inspect")) patterns.push("Analysis pipeline");
  if (has("cli") || has("command") || has("bin")) patterns.push("CLI tool architecture");
  if (has("util") || has("helper") || has("lib")) patterns.push("Shared utility layer");
  if (has("integrat") || has("adapter") || has("connect")) patterns.push("Integration adapters");
  if (has("ai") || has("prompt") || has("provider")) patterns.push("AI/LLM integration");
  if (has("deliver") || has("dispatch")) patterns.push("Delivery pipeline");
  if (has("test") || has("spec")) patterns.push("Dedicated test infrastructure");
  
  return patterns;
}

export function buildModuleContext(modules, config) {
  const customHints = config.domains 
    ? Object.entries(config.domains).map(([key, domain]) => ({
        match: domain.match || [],
        domain: key,
        description: domain.description || key
      }))
    : [];
  
  const domainGroups = groupModulesByDomain(modules, customHints);
  
  return modules.map(module => {
    const domain = domainGroups.find(d => 
      d.modules.some(m => m.key === module.key)
    );
    
    return {
      key: module.key,
      fileCount: module.fileCount,
      type: inferModuleType(module.key),
      domain: domain?.name || "Other",
      domainDescription: domain?.description || "Uncategorized"
    };
  });
}
