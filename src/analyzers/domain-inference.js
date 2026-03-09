// Domain inference - map folder/file names to business domains

const DEFAULT_DOMAIN_HINTS = [
  { 
    match: ["auth", "login", "signup", "session", "user", "account"], 
    domain: "Authentication",
    description: "User authentication and identity flows"
  },
  { 
    match: ["stock", "chart", "price", "market", "watchlist", "ticker", "quote"], 
    domain: "Market Data & Analysis",
    description: "Market data retrieval, analysis, and visualization"
  },
  { 
    match: ["article", "newsletter", "news", "research", "content", "blog", "post"], 
    domain: "Content & Research",
    description: "Content publishing, research, and insight delivery"
  },
  { 
    match: ["portfolio", "positions", "holdings", "trades", "orders"], 
    domain: "Portfolio Management",
    description: "Portfolio tracking and trading functionality"
  },
  { 
    match: ["alert", "notification", "email", "sms", "webhook"], 
    domain: "Alerts & Notifications",
    description: "User notification and alerting system"
  },
  { 
    match: ["payment", "subscription", "billing", "stripe", "checkout"], 
    domain: "Payments & Billing",
    description: "Payment processing and subscription management"
  },
  { 
    match: ["api", "endpoint", "route", "handler"], 
    domain: "API Layer",
    description: "Backend API endpoints and request handling"
  },
  { 
    match: ["component", "ui", "button", "form", "modal", "dialog"], 
    domain: "UI Components",
    description: "Reusable user interface components"
  },
  { 
    match: ["hook", "hooks", "use"], 
    domain: "React Hooks",
    description: "Custom React hooks for state and behavior"
  },
  { 
    match: ["store", "state", "redux", "zustand", "context"], 
    domain: "State Management",
    description: "Application state management"
  },
  { 
    match: ["lib", "util", "helper", "common", "shared"], 
    domain: "Shared Utilities",
    description: "Common utilities and helper functions"
  },
  { 
    match: ["data", "database", "db", "prisma", "sql"], 
    domain: "Data Layer",
    description: "Database access and data persistence"
  }
];

export function inferDomain(modulePath, customHints = []) {
  const hints = [...customHints, ...DEFAULT_DOMAIN_HINTS];
  const lowerPath = modulePath.toLowerCase();
  
  for (const hint of hints) {
    for (const keyword of hint.match) {
      if (lowerPath.includes(keyword)) {
        return {
          domain: hint.domain,
          description: hint.description,
          confidence: "pattern_match",
          matchedKeyword: keyword
        };
      }
    }
  }
  
  return {
    domain: "Other",
    description: "Uncategorized module",
    confidence: "none",
    matchedKeyword: null
  };
}

export function groupModulesByDomain(modules, customHints = []) {
  const domainGroups = {};
  
  for (const module of modules) {
    const inference = inferDomain(module.key, customHints);
    const domainName = inference.domain;
    
    if (!domainGroups[domainName]) {
      domainGroups[domainName] = {
        name: domainName,
        description: inference.description,
        modules: [],
        totalFiles: 0
      };
    }
    
    domainGroups[domainName].modules.push({
      ...module,
      inference
    });
    domainGroups[domainName].totalFiles += module.fileCount;
  }
  
  // Sort domains by total files (most important first)
  const sortedDomains = Object.values(domainGroups)
    .sort((a, b) => b.totalFiles - a.totalFiles);
  
  return sortedDomains;
}

export function inferRouteDomain(routePath, customHints = []) {
  return inferDomain(routePath, customHints);
}

export function inferApiDomain(apiPath, customHints = []) {
  return inferDomain(apiPath, customHints);
}
