// Build structured AI context from deterministic scan results

import { groupModulesByDomain } from "./domain-inference.js";

/**
 * Compute per-module dependency metrics from the dep graph.
 * Returns a Map<normalizedKey, { fanIn, fanOut, isHub, isOrphan, isLeaf, isOrchestrator }>.
 */
export function computeModuleDepMetrics(depGraph) {
  const metrics = new Map();
  if (!depGraph?.nodes) return metrics;

  const hubThreshold = Math.max(3, Math.floor(depGraph.nodes.length * 0.05));

  for (const node of depGraph.nodes) {
    const fanIn = node.importedBy.length;
    const fanOut = node.imports.length;
    metrics.set(node.key, {
      fanIn,
      fanOut,
      isHub: fanIn >= hubThreshold,
      isOrphan: fanIn === 0 && fanOut === 0,
      isLeaf: fanOut === 0 && fanIn > 0,
      isOrchestrator: fanOut >= 5 && fanIn < fanOut,
    });
  }
  return metrics;
}

/**
 * Build a module-level dep metrics map (aggregating file-level metrics).
 * moduleKey → { fanIn, fanOut, isHub, isOrphan, isLeaf, isOrchestrator }
 */
export function computeModuleLevelMetrics(depGraph, modules) {
  const fileMetrics = computeModuleDepMetrics(depGraph);
  if (fileMetrics.size === 0 || !modules) return new Map();

  const moduleLevelMap = new Map();

  for (const mod of modules) {
    const moduleKey = mod.key;
    const lowerKey = moduleKey.toLowerCase();

    // Find all file-level nodes that belong to this module
    let totalFanIn = 0;
    let totalFanOut = 0;
    let fileCount = 0;

    for (const [nodeKey, m] of fileMetrics) {
      if (nodeKey === lowerKey || nodeKey.startsWith(lowerKey + "/") || nodeKey === moduleKey || nodeKey.startsWith(moduleKey + "/")) {
        // Count only external edges (crossing module boundary)
        if (depGraph?.nodes) {
          const node = depGraph.nodes.find(n => n.key === nodeKey);
          if (node) {
            const externalIn = node.importedBy.filter(imp => !imp.startsWith(moduleKey + "/") && imp !== moduleKey).length;
            const externalOut = node.imports.filter(imp => !imp.startsWith(moduleKey + "/") && imp !== moduleKey).length;
            totalFanIn += externalIn;
            totalFanOut += externalOut;
            fileCount++;
          }
        }
      }
    }

    if (fileCount > 0) {
      const hubThreshold = Math.max(5, Math.floor(modules.length * 0.15));
      moduleLevelMap.set(moduleKey, {
        fanIn: totalFanIn,
        fanOut: totalFanOut,
        isHub: totalFanIn >= hubThreshold,
        isOrphan: totalFanIn === 0 && totalFanOut === 0,
        isLeaf: totalFanOut === 0 && totalFanIn > 0,
        isOrchestrator: totalFanOut >= 5 && totalFanIn < totalFanOut,
      });
    }
  }

  return moduleLevelMap;
}

export function buildAIContext(scanResult, config, depGraph = null) {
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
  
  // Compute module-level dependency metrics
  const moduleMetrics = computeModuleLevelMetrics(depGraph, modules);
  
  // Identify top modules with enriched types
  const topModules = modules
    .slice(0, 15)
    .map(m => ({
      key: m.key,
      fileCount: m.fileCount,
      type: inferModuleType(m.key),
      depRole: describeModuleDepRole(m.key, moduleMetrics),
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
  
  // Identify key architectural patterns (verified against dep graph when available)
  const patterns = inferArchitecturalPatterns(modules, depGraph);
  
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

function inferArchitecturalPatterns(modules, depGraph = null) {
  const patterns = [];
  const keys = modules.map(m => m.key.toLowerCase());
  
  const has = (keyword) => keys.some(k => k.includes(keyword));

  // Compute module-level metrics for verification
  const moduleMetrics = depGraph ? computeModuleLevelMetrics(depGraph, modules) : new Map();
  const hasCycles = depGraph?.cycles?.length > 0;
  
  // Verify pattern: a module matching `keyword` has high fan-in (truly central)
  const verifyHub = (keyword) => {
    for (const [mKey, m] of moduleMetrics) {
      if (mKey.toLowerCase().includes(keyword) && m.fanIn >= 3) return true;
    }
    return false;
  };

  // Verify pattern: modules matching keyword have mostly outbound deps (orchestrators)
  const verifyOrchestrator = (keyword) => {
    for (const [mKey, m] of moduleMetrics) {
      if (mKey.toLowerCase().includes(keyword) && m.fanOut >= 3) return true;
    }
    return false;
  };
  
  // Web framework patterns
  if (has("app/")) patterns.push("Next.js App Router");
  if (has("pages/")) patterns.push("Next.js Pages Router");
  if (has("component") && has("lib")) patterns.push("Layered component architecture");
  if (has("hook")) patterns.push("React hooks pattern");
  if (has("store") || has("state") || has("redux") || has("zustand")) patterns.push("Centralized state management");
  
  // General patterns — verified against dep graph when available
  if (has("api") || has("endpoint")) patterns.push("API route pattern");

  if (has("core") || has("kernel")) {
    if (moduleMetrics.size > 0 && verifyHub("core")) {
      patterns.push("Core/kernel architecture (verified — high fan-in)");
    } else if (moduleMetrics.size > 0) {
      patterns.push("Core/kernel architecture (naming only)");
    } else {
      patterns.push("Core/kernel architecture");
    }
  }

  if (has("plugin") || has("extension")) {
    if (moduleMetrics.size > 0 && (verifyHub("plugin") || verifyOrchestrator("plugin") || verifyHub("loader"))) {
      patterns.push("Plugin system (verified — loader/registry detected)");
    } else if (moduleMetrics.size > 0) {
      patterns.push("Plugin system (naming only)");
    } else {
      patterns.push("Plugin system");
    }
  }

  if (has("middleware")) patterns.push("Middleware pipeline");

  if (has("render") || has("template")) {
    if (moduleMetrics.size > 0 && verifyOrchestrator("render")) {
      patterns.push("Renderer pipeline (verified — multi-output)");
    } else {
      patterns.push("Renderer pipeline");
    }
  }

  if (has("publish") || has("output")) {
    if (moduleMetrics.size > 0 && verifyOrchestrator("publish")) {
      patterns.push("Multi-output publishing (verified — multiple targets)");
    } else {
      patterns.push("Multi-output publishing");
    }
  }

  if (has("analyz") || has("detect") || has("inspect")) patterns.push("Analysis pipeline");
  if (has("cli") || has("command") || has("bin")) patterns.push("CLI tool architecture");
  
  if (has("util") || has("helper") || has("lib")) {
    if (moduleMetrics.size > 0 && verifyHub("util") || verifyHub("helper") || verifyHub("lib")) {
      patterns.push("Shared utility layer (verified — high fan-in)");
    } else {
      patterns.push("Shared utility layer");
    }
  }
  
  if (has("integrat") || has("adapter") || has("connect")) patterns.push("Integration adapters");
  if (has("ai") || has("prompt") || has("provider")) patterns.push("AI/LLM integration");
  if (has("deliver") || has("dispatch")) patterns.push("Delivery pipeline");
  if (has("test") || has("spec")) patterns.push("Dedicated test infrastructure");

  // Structural patterns from dep graph (not keyword-based)
  if (depGraph?.stats) {
    if (depGraph.stats.cycles === 0 && depGraph.stats.totalEdges > 10) {
      patterns.push("Acyclic dependency graph — clean layering");
    }
    if (hasCycles) {
      patterns.push(`⚠️ ${depGraph.stats.cycles} circular dependency cycle(s) detected`);
    }
  }

  return patterns;
}

/**
 * Generate a dependency-aware role description for a module.
 */
function describeModuleDepRole(moduleKey, moduleMetrics) {
  const m = moduleMetrics.get(moduleKey);
  if (!m) return null;

  if (m.isOrphan) return "Isolated (no imports or importers)";
  if (m.isHub && m.fanIn >= 15) return `Critical shared infrastructure (imported by ${m.fanIn} modules)`;
  if (m.isHub) return `Shared infrastructure (imported by ${m.fanIn} modules)`;
  if (m.isOrchestrator) return `Orchestrator (coordinates ${m.fanOut} modules)`;
  if (m.isLeaf) return `Leaf module (consumed only, ${m.fanIn} importer${m.fanIn === 1 ? "" : "s"})`;
  if (m.fanIn > 0 && m.fanOut > 0) return `Connector (${m.fanIn} in, ${m.fanOut} out)`;
  return null;
}

export { describeModuleDepRole };

export function buildModuleContext(modules, config, depGraph = null) {
  const customHints = config.domains 
    ? Object.entries(config.domains).map(([key, domain]) => ({
        match: domain.match || [],
        domain: key,
        description: domain.description || key
      }))
    : [];
  
  const domainGroups = groupModulesByDomain(modules, customHints);
  const moduleMetrics = computeModuleLevelMetrics(depGraph, modules);
  
  return modules.map(module => {
    const domain = domainGroups.find(d => 
      d.modules.some(m => m.key === module.key)
    );
    
    return {
      key: module.key,
      fileCount: module.fileCount,
      type: inferModuleType(module.key),
      depRole: describeModuleDepRole(module.key, moduleMetrics),
      domain: domain?.name || "Other",
      domainDescription: domain?.description || "Uncategorized"
    };
  });
}
