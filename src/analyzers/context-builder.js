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
    
    repoRoots: config.module_roots || []
  };
}

function inferModuleType(modulePath) {
  const lower = modulePath.toLowerCase();
  
  if (lower.includes("api")) return "api";
  if (lower.includes("component")) return "ui";
  if (lower.includes("lib") || lower.includes("util")) return "library";
  if (lower.includes("hook")) return "hooks";
  if (lower.includes("store") || lower.includes("state")) return "state";
  if (lower.includes("page") || lower.includes("route")) return "route";
  if (lower.includes("app")) return "app";
  
  return "other";
}

function inferArchitecturalPatterns(modules) {
  const patterns = [];
  
  const hasAppRouter = modules.some(m => m.key.includes("app/"));
  const hasPagesRouter = modules.some(m => m.key.includes("pages/"));
  const hasComponents = modules.some(m => m.key.includes("component"));
  const hasLib = modules.some(m => m.key.includes("lib"));
  const hasHooks = modules.some(m => m.key.includes("hook"));
  const hasStore = modules.some(m => m.key.includes("store") || m.key.includes("state"));
  const hasApi = modules.some(m => m.key.includes("api"));
  
  if (hasAppRouter) patterns.push("Next.js App Router");
  if (hasPagesRouter) patterns.push("Next.js Pages Router");
  if (hasComponents && hasLib) patterns.push("Layered component architecture");
  if (hasHooks) patterns.push("React hooks pattern");
  if (hasStore) patterns.push("Centralized state management");
  if (hasApi) patterns.push("API route pattern");
  
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
