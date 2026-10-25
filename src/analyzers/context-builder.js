// Build structured AI context from deterministic scan results

import { groupModulesByDomain, pathHasKeyword } from "./domain-inference.js";

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
  const domainGroups = groupModulesByDomain(modules, customHints, depGraph);
  
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

    findings: inferFindings(depGraph),
    
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
  const has = (keyword) => pathHasKeyword(modulePath, keyword);

  if (has("test") || has("spec")) return "test";
  if (has("api") || has("endpoint")) return "api";
  if (has("component") || has("widget")) return "ui";
  if (has("lib") || has("util") || has("helper") || has("common") || has("shared")) return "library";
  if (has("hook")) return "hooks";
  if (has("store") || has("state") || has("redux") || has("zustand")) return "state";
  if (has("page") || has("route") || has("view")) return "route";
  if (has("config") || has("setting") || has("env")) return "config";
  if (has("core") || has("kernel") || has("foundation")) return "core";
  if (has("render") || has("template") || has("format")) return "renderer";
  if (has("publish") || has("output") || has("export")) return "publisher";
  if (has("analyz") || has("inspect") || has("detect")) return "analyzer";
  if (has("plugin") || has("extension") || has("addon")) return "plugin";
  if (has("deliver") || has("dispatch") || has("send")) return "delivery";
  if (has("doc") || has("generate")) return "documentation";
  if (has("integrat") || has("connect") || has("adapter")) return "integration";
  if (has("cli") || has("command") || has("bin")) return "cli";
  if (has("ai") || has("llm") || has("openai") || has("prompt")) return "ai";
  if (has("auth") || has("login") || has("session")) return "auth";
  if (has("data") || has("db") || has("schema")) return "data";
  if (has("middleware")) return "middleware";
  if (has("service")) return "service";
  if (has("app")) return "app";

  return "other";
}

function isTestEvidence(modulePath) {
  const norm = String(modulePath || "").replace(/\\/g, "/");
  if (/(^|\/)__(tests|mocks)__(\/|$)/.test(norm)) return true;
  if (/(^|\/)(test|tests|spec|specs|fixtures|testdata)(\/|$)/.test(norm)) return true;
  const base = norm.split("/").pop() || "";
  if (/^(test_|spec_)/.test(base)) return true;
  if (/(_test|_spec)\.[a-z0-9]+$/i.test(base)) return true;
  if (/\.(test|spec)\.[a-z0-9]+$/i.test(base)) return true;
  return false;
}

const API_DIRECTORY_SEGMENTS = new Set([
  "api", "apis", "route", "routes", "router", "routers",
  "endpoint", "endpoints", "controller", "controllers", "handler", "handlers",
]);

function hasApiDirectory(modulePath) {
  return directoryPath(modulePath)
    .split("/")
    .some((segment) => API_DIRECTORY_SEGMENTS.has(segment.toLowerCase()));
}

function directoryPath(modulePath) {
  const parts = String(modulePath || "").replace(/\\/g, "/").split("/");
  const last = parts[parts.length - 1] || "";
  if (/\.[a-z0-9]+$/i.test(last)) parts.pop();
  return parts.join("/");
}

function inferArchitecturalPatterns(modules, depGraph = null) {
  const patterns = [];
  const production = modules.filter((module) => !isTestEvidence(module.key));
  const tests = modules.filter((module) => isTestEvidence(module.key));
  const keys = production.map(m => m.key.toLowerCase());

  const has = (keyword) => keys.some((key) => (
    keyword.includes("/") ? key.includes(keyword) : pathHasKeyword(key, keyword)
  ));
  const matchingKeys = (keywords, source = production) => {
    const found = [];
    for (const keyword of keywords) {
      for (const module of source) {
        const key = module.key;
        const matched = keyword.includes("/")
          ? key.toLowerCase().includes(keyword)
          : pathHasKeyword(key, keyword);
        if (matched && !found.includes(key)) found.push(key);
      }
    }
    return found;
  };
  const hasApiRouteEvidence = () => production.some((module) => hasApiDirectory(module.key));
  const cite = (label, keywords, extra = "", source = production) => {
    const found = matchingKeys(keywords, source);
    if (found.length === 0 && !extra) return;
    const sample = found.slice(0, 3).map((key) => `\`${key}\``).join(", ");
    const more = found.length > 3 ? ` (+${found.length - 3} more)` : "";
    const where = sample ? `${sample}${more}` : "";
    const detail = [where, extra].filter(Boolean).join("; ");
    patterns.push(detail ? `${label} — ${detail}` : label);
  };
  const externalNames = depGraph?.externalDeps || [];
  const importsReact = externalNames.some((name) => name === "react" || name === "react-dom" || name.startsWith("react/"));
  const importsAi = externalNames.some((name) => /(^|\/)(openai|anthropic|langchain|ollama)(\/|$)/i.test(name) || name.startsWith("@anthropic-ai/") || name.startsWith("@ai-sdk/"));

  // Compute module-level metrics for verification
  const moduleMetrics = depGraph ? computeModuleLevelMetrics(depGraph, modules) : new Map();
  
  // Verify pattern: a module matching `keyword` has high fan-in (truly central)
  const verifyHub = (keyword) => {
    for (const [mKey, m] of moduleMetrics) {
      if (isTestEvidence(mKey)) continue;
      if (mKey.toLowerCase().includes(keyword) && m.fanIn >= 3) return true;
    }
    return false;
  };

  // Verify pattern: modules matching keyword have mostly outbound deps (orchestrators)
  const verifyOrchestrator = (keyword) => {
    for (const [mKey, m] of moduleMetrics) {
      if (isTestEvidence(mKey)) continue;
      if (mKey.toLowerCase().includes(keyword) && m.fanOut >= 3) return true;
    }
    return false;
  };
  
  // Web framework patterns. Each line names the modules (or imports) that triggered it.
  if (has("app/")) cite("Next.js App Router", ["app/"]);
  if (has("pages/")) cite("Next.js Pages Router", ["pages/"]);
  if (has("component") && has("lib")) cite("Layered component architecture", ["component", "lib"]);
  if (has("hook") && importsReact) cite("React hooks pattern", ["hook"], "imports react");
  if (has("store") || has("state") || has("redux") || has("zustand")) {
    cite("Centralized state management", ["store", "state", "redux", "zustand"]);
  }

  if (hasApiRouteEvidence()) {
    const found = production
      .filter((module) => hasApiDirectory(module.key))
      .map((module) => module.key);
    const sample = found.slice(0, 3).map((key) => `\`${key}\``).join(", ");
    const more = found.length > 3 ? ` (+${found.length - 3} more)` : "";
    patterns.push(`API route pattern — ${sample}${more}`);
  }

  // A directory named core/ or kernel/ is evidence. A file called core.ts is not:
  // it is as likely a cross-platform entry point as a kernel.
  const coreDirs = production
    .filter((module) => directoryPath(module.key).split("/").some((segment) => ["core", "kernel"].includes(segment.toLowerCase())))
    .map((module) => module.key);
  if (coreDirs.length > 0) {
    const note = moduleMetrics.size > 0 && verifyHub("core")
      ? "high fan-in"
      : "";
    const sample = coreDirs.slice(0, 3).map((key) => `\`${key}\``).join(", ");
    const more = coreDirs.length > 3 ? ` (+${coreDirs.length - 3} more)` : "";
    patterns.push(`Core/kernel architecture — ${[`${sample}${more}`, note].filter(Boolean).join("; ")}`);
  }

  if (has("plugin") || has("extension")) {
    const verified = moduleMetrics.size > 0 && (verifyHub("plugin") || verifyOrchestrator("plugin") || verifyHub("loader"));
    cite("Plugin system", ["plugin", "extension"], verified ? "loader or registry fan-in" : "");
  }

  if (has("middleware")) cite("Middleware pipeline", ["middleware"]);

  if (has("render") || has("template")) {
    const note = moduleMetrics.size > 0 && verifyOrchestrator("render") ? "multi-output fan-out" : "";
    cite("Renderer pipeline", ["render", "template"], note);
  }

  if (has("publish") || has("output")) {
    const note = moduleMetrics.size > 0 && verifyOrchestrator("publish") ? "multiple publish targets" : "";
    cite("Multi-output publishing", ["publish", "output"], note);
  }

  if (has("analyz") || has("detect") || has("inspect")) cite("Analysis pipeline", ["analyz", "detect", "inspect"]);
  if (has("cli") || has("command") || has("bin")) cite("CLI tool architecture", ["cli", "command", "bin"]);

  if (has("util") || has("helper") || has("lib")) {
    const verified = moduleMetrics.size > 0 && verifyHub("util") || verifyHub("helper") || verifyHub("lib");
    cite("Shared utility layer", ["util", "helper", "lib"], verified ? "high fan-in" : "");
  }

  if (has("integrat") || has("adapter") || has("connect")) cite("Integration adapters", ["integrat", "adapter", "connect"]);
  if (has("ai") || has("llm") || has("openai") || has("anthropic") || importsAi) {
    const aiPackages = externalNames.filter((name) => /(^|\/)(openai|anthropic|langchain|ollama)(\/|$)/i.test(name) || name.startsWith("@anthropic-ai/") || name.startsWith("@ai-sdk/"));
    cite("AI/LLM integration", ["ai", "llm", "openai", "anthropic"], aiPackages.length ? `imports ${aiPackages.slice(0, 3).join(", ")}` : "");
  }
  if (has("deliver") || has("dispatch")) cite("Delivery pipeline", ["deliver", "dispatch"]);
  if (tests.length) cite("Dedicated test infrastructure", ["test", "spec"], "", tests);

  // Structural patterns from dep graph (not keyword-based)
  if (depGraph?.stats) {
    if (depGraph.stats.cycles === 0 && depGraph.stats.totalEdges > 10) {
      patterns.push("Acyclic dependency graph — clean layering");
    }
  }

  return patterns;
}

/**
 * Warnings about the code that are not architectural patterns, for example
 * circular dependencies. Docs list these as findings, never as a pattern.
 */
export function inferFindings(depGraph = null) {
  const findings = [];
  const cycles = depGraph?.stats?.cycles;
  if (cycles > 0) {
    findings.push(`⚠️ ${cycles} circular dependency cycle${cycles === 1 ? "" : "s"} detected`);
  }
  return findings;
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
  
  const domainGroups = groupModulesByDomain(modules, customHints, depGraph);
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
