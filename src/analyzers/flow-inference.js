// Infer data flows through the application using heuristics

export function inferDataFlows(scanResult, config) {
  const flows = [];
  
  // Stock/Market Data Flow (if applicable)
  const marketFlow = inferMarketDataFlow(scanResult);
  if (marketFlow) flows.push(marketFlow);
  
  // Authentication Flow
  const authFlow = inferAuthFlow(scanResult);
  if (authFlow) flows.push(authFlow);
  
  // Content/Article Flow
  const contentFlow = inferContentFlow(scanResult);
  if (contentFlow) flows.push(contentFlow);
  
  // API Integration Flow
  const apiFlow = inferApiIntegrationFlow(scanResult);
  if (apiFlow) flows.push(apiFlow);
  
  return flows;
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
