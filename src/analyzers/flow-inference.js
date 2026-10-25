import { isToolingPath, isTestPath } from "../utils/path-roles.js";

// Infer data flows through the application using import graph analysis + heuristics

/**
 * Primary flow inference: uses dep graph when available for real import-chain flows,
 * falls back to keyword heuristics for repos without dep graph data.
 */
// File names too generic to name a flow ("gen Request Flow", "util Integration Flow").
const GENERIC_FLOW_NAMES = new Set([
  "gen", "generate", "util", "utils", "helper", "helpers", "misc", "common", "types", "constants",
]);

/**
 * Drop flows that are noise: no steps, nothing beyond the starting file, a name that is only
 * a generic helper word, or a chain that starts in tests, tooling, examples, or docs.
 */
export function filterNoiseFlows(flows) {
  return (flows || []).filter((flow) => {
    if (!flow) return false;
    const steps = Array.isArray(flow.steps) ? flow.steps : [];
    if (steps.length < 2) return false;
    const origin = flow.modules?.[0];
    if (origin && (isToolingPath(origin) || isTestPath(origin))) return false;
    const stem = String(flow.name || "").split(" ")[0].toLowerCase();
    if (GENERIC_FLOW_NAMES.has(stem)) return false;
    return true;
  });
}

export function inferDataFlows(scanResult, config, depGraph = null) {
  const flows = [];
  
  // If we have dep graph data, build real import-chain flows from entry points
  if (depGraph?.nodes && depGraph.nodes.length > 0) {
    const entryFlows = inferFlowsFromEntryPoints(scanResult, depGraph);
    flows.push(...entryFlows);
  }

  // Keyword-based heuristic flows (only add if not already covered by import-chain analysis)
  const existingNames = new Set(flows.map(f => f.name.toLowerCase()));

  const marketFlow = inferMarketDataFlow(scanResult);
  if (marketFlow && !existingNames.has(marketFlow.name.toLowerCase())) flows.push(marketFlow);
  
  const authFlow = inferAuthFlow(scanResult);
  if (authFlow && !existingNames.has(authFlow.name.toLowerCase())) flows.push(authFlow);
  
  const contentFlow = inferContentFlow(scanResult);
  if (contentFlow && !existingNames.has(contentFlow.name.toLowerCase())) flows.push(contentFlow);
  
  const apiFlow = inferApiIntegrationFlow(scanResult);
  if (apiFlow && !existingNames.has(apiFlow.name.toLowerCase())) flows.push(apiFlow);
  
  return filterNoiseFlows(flows);
}

/** Same key the dependency graph gives a file: no extension, no trailing /index. */
function fileKey(file) {
  return String(file).replace(/\\/g, "/").replace(/\.(js|ts|jsx|tsx|mjs|cjs)$/, "").replace(/\/index$/, "");
}

/**
 * Trace real import chains from entry points through the dep graph.
 * Entry points: CLI/bin files, page components, API route handlers, index files.
 */
function inferFlowsFromEntryPoints(scanResult, depGraph) {
  const flows = [];
  if (!depGraph?.nodes) return flows;

  const isLibrary = scanResult?.metadata?.projectKind === "library";
  const packageEntryKeys = new Set(
    (scanResult?.metadata?.packageEntryFiles || []).map((file) => fileKey(file)),
  );

  // Find entry points (files with high fan-out and low/zero fan-in)
  const entryPoints = depGraph.nodes.filter(n => {
    const key = n.key.toLowerCase();
    // Build configs (`webpack.config`) wire up tooling. They are not how data moves.
    if (/\.config$/.test(key)) return false;
    // In a library, `bin/` holds build helpers. The package entry is what callers use.
    if (isLibrary && /(^|\/)bin\//.test(key)) return false;
    const isEntry = (
      packageEntryKeys.has(n.key) ||
      (!isLibrary && key.includes("bin/")) ||
      (!isLibrary && key.includes("cli")) ||
      key.endsWith("/index") ||
      key.includes("pages/") ||
      key.includes("app/") ||
      (n.importedBy.length === 0 && n.imports.length >= 2) // True entry: nothing imports it
    );
    return isEntry && n.imports.length >= 2;
  }).sort((a, b) => {
    // Prioritize src/ entry points over tests/
    const aIsTest = isTestPath(a.key);
    const bIsTest = isTestPath(b.key);
    if (aIsTest !== bIsTest) return aIsTest ? 1 : -1;
    return b.imports.length - a.imports.length;
  });

  // Limit: all src entries + max 2 test entries
  const srcEntries = entryPoints.filter(n => !isTestPath(n.key));
  const testEntries = entryPoints.filter(n => isTestPath(n.key)).slice(0, 2);
  const selectedEntries = [...srcEntries, ...testEntries].slice(0, 5);

  for (const entry of selectedEntries) {
    const chain = traceImportChain(entry.key, depGraph, 6);
    if (chain.length < 2) continue;

    const shortName = entry.key.split("/").pop();
    const isCliEntry = !isLibrary && (entry.key.toLowerCase().includes("cli") || entry.key.toLowerCase().includes("bin/"));
    const flowType = isCliEntry ? "Command" : isLibrary && packageEntryKeys.has(entry.key) ? "Library" : "Request";
    
    // Classify each step in the chain
    const steps = chain.map((nodeKey, i) => {
      const node = depGraph.nodes.find(n => n.key === nodeKey);
      const name = nodeKey.split("/").pop();
      const fanIn = node?.importedBy?.length || 0;
      const fanOut = node?.imports?.length || 0;
      
      if (i === 0) return `\`${name}\` (entry point, imports ${fanOut} modules)`;
      if (fanIn >= 5) return `\`${name}\` (shared infrastructure, used by ${fanIn} files)`;
      if (fanOut === 0) return `\`${name}\` (leaf — no further dependencies)`;
      return `\`${name}\` → imports ${fanOut} module${fanOut === 1 ? "" : "s"}`;
    });

    flows.push({
      name: `${shortName} ${flowType} Flow`,
      description: `Import chain starting from \`${entry.key}\` — traces how this entry point depends on ${chain.length - 1} downstream module${chain.length - 1 === 1 ? "" : "s"}`,
      steps,
      modules: chain.slice(0, 8),
      critical: entry.imports.length >= 5,
    });
  }

  return flows;
}

/**
 * Trace from an entry node through the dep graph via BFS, following highest-fan-out paths.
 * Returns an ordered chain of module keys representing the primary dependency path.
 */
function traceImportChain(startKey, depGraph, maxDepth = 6) {
  const chain = [startKey];
  const visited = new Set([startKey]);
  let current = startKey;

  for (let depth = 0; depth < maxDepth; depth++) {
    const node = depGraph.nodes.find(n => n.key === current);
    if (!node || node.imports.length === 0) break;

    // Follow the most-imported (highest fan-in) dependency first — it's the most interesting path
    const candidates = node.imports
      .filter(imp => !visited.has(imp))
      .map(imp => {
        const target = depGraph.nodes.find(n => n.key === imp);
        return { key: imp, fanIn: target?.importedBy?.length || 0 };
      })
      .sort((a, b) => b.fanIn - a.fanIn);

    if (candidates.length === 0) break;

    current = candidates[0].key;
    visited.add(current);
    chain.push(current);
  }

  return chain;
}

function inferMarketDataFlow(scanResult) {
  const { modules, pages, api } = scanResult;
  
  const hasStockModules = modules.some(m => 
    m.key.toLowerCase().includes("stock") || 
    m.key.toLowerCase().includes("market") ||
    m.key.toLowerCase().includes("chart")
  );
  
  const hasStockPages = pages?.some(p => 
    p.path.includes("stock") || 
    p.path.includes("market")
  );
  
  const hasStockApis = api?.some(a => 
    a.path.includes("price") || 
    a.path.includes("stock") ||
    a.path.includes("market")
  );
  
  if (!hasStockModules && !hasStockPages && !hasStockApis) return null;
  
  return {
    name: "Market Data Flow",
    description: "User requests stock data, which flows through UI components to market data services",
    steps: [
      "User visits stock analysis page",
      "Page component loads stock-specific UI",
      "Components request data from stock libraries",
      "Libraries fetch from market data APIs",
      "Data is transformed and displayed to user"
    ],
    modules: modules.filter(m => 
      m.key.toLowerCase().includes("stock") || 
      m.key.toLowerCase().includes("market") ||
      m.key.toLowerCase().includes("chart")
    ).map(m => m.key),
    critical: true
  };
}

function inferAuthFlow(scanResult) {
  const { modules, pages, api } = scanResult;
  
  const hasAuthModules = modules.some(m => 
    m.key.toLowerCase().includes("auth") || 
    m.key.toLowerCase().includes("login") ||
    m.key.toLowerCase().includes("session")
  );
  
  const hasAuthPages = pages?.some(p => 
    p.path.includes("login") || 
    p.path.includes("signup") ||
    p.path.includes("auth")
  );
  
  const hasAuthApis = api?.some(a => 
    a.path.includes("auth") || 
    a.path.includes("login") ||
    a.path.includes("session")
  );
  
  if (!hasAuthModules && !hasAuthPages && !hasAuthApis) return null;
  
  return {
    name: "Authentication Flow",
    description: "User authentication and session management",
    steps: [
      "User submits login credentials",
      "Auth API validates credentials",
      "Session is created and stored",
      "User is redirected to authenticated area",
      "Subsequent requests include auth token"
    ],
    modules: modules.filter(m => 
      m.key.toLowerCase().includes("auth") || 
      m.key.toLowerCase().includes("login") ||
      m.key.toLowerCase().includes("session")
    ).map(m => m.key),
    critical: true
  };
}

function inferContentFlow(scanResult) {
  const { modules, pages, api } = scanResult;
  
  const hasContentModules = modules.some(m => 
    m.key.toLowerCase().includes("article") || 
    m.key.toLowerCase().includes("content") ||
    m.key.toLowerCase().includes("newsletter") ||
    m.key.toLowerCase().includes("blog")
  );
  
  const hasContentPages = pages?.some(p => 
    p.path.includes("article") || 
    p.path.includes("news") ||
    p.path.includes("blog")
  );
  
  if (!hasContentModules && !hasContentPages) return null;
  
  return {
    name: "Content Delivery Flow",
    description: "Research articles and content are fetched and displayed to users",
    steps: [
      "User browses content sections",
      "Content components load articles",
      "Articles may be fetched from CMS or database",
      "Content is rendered with formatting",
      "User can interact with content features"
    ],
    modules: modules.filter(m => 
      m.key.toLowerCase().includes("article") || 
      m.key.toLowerCase().includes("content") ||
      m.key.toLowerCase().includes("newsletter")
    ).map(m => m.key),
    critical: false
  };
}

function inferApiIntegrationFlow(scanResult) {
  const { api } = scanResult;
  
  if (!api || api.length === 0) return null;
  
  return {
    name: "API Integration Flow",
    description: "External service integrations and backend processing",
    steps: [
      "Frontend makes API request",
      "API route receives and validates request",
      "Business logic is executed",
      "External services may be called",
      "Response is formatted and returned"
    ],
    modules: [`${api.length} API endpoints detected`],
    critical: false
  };
}

export function identifyFlowDependencies(flow, scanResult) {
  // Simple heuristic: modules in flow likely depend on each other
  // and on shared libraries
  const { modules } = scanResult;
  
  const libModules = modules.filter(m => 
    m.key.toLowerCase().includes("lib") || 
    m.key.toLowerCase().includes("util")
  );
  
  return {
    internalDependencies: flow.modules,
    sharedLibraries: libModules.slice(0, 5).map(m => m.key),
    externalDependencies: inferExternalDependencies(flow)
  };
}

function inferExternalDependencies(flow) {
  const external = [];
  
  if (flow.name.includes("Market") || flow.name.includes("Stock")) {
    external.push("Market data provider API");
  }
  
  if (flow.name.includes("Auth")) {
    external.push("Authentication service");
  }
  
  if (flow.name.includes("Content")) {
    external.push("Content management system");
  }
  
  return external;
}
