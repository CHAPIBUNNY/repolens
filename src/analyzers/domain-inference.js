// Domain inference - map folder/file names to business domains

const DEFAULT_DOMAIN_HINTS = [
  { 
    match: ["auth", "login", "signup", "session", "user", "account", "oauth", "sso"], 
    domain: "Authentication & Identity",
    description: "User authentication, authorization, and identity management"
  },
  { 
    match: ["dashboard", "analytics", "chart", "report", "metric", "stat", "insight"], 
    domain: "Analytics & Reporting",
    description: "Data visualization, reporting, and analytics dashboards"
  },
  { 
    match: ["article", "newsletter", "news", "research", "content", "blog", "post", "cms"], 
    domain: "Content Management",
    description: "Content publishing, management, and delivery"
  },
  { 
    match: ["search", "filter", "query", "index", "catalog", "browse"], 
    domain: "Search & Discovery",
    description: "Search functionality, filtering, and content discovery"
  },
  { 
    match: ["alert", "notification", "email", "sms", "webhook", "push", "message"], 
    domain: "Notifications",
    description: "User notifications and messaging system"
  },
  { 
    match: ["payment", "subscription", "billing", "stripe", "checkout", "invoice"], 
    domain: "Payments & Billing",
    description: "Payment processing and subscription management"
  },
  { 
    match: ["api", "endpoint", "handler", "controller", "middleware"], 
    domain: "API Layer",
    description: "Backend API endpoints and request handling"
  },
  { 
    match: ["component", "ui", "button", "form", "modal", "dialog", "layout", "widget"], 
    domain: "UI Components",
    description: "Reusable user interface components"
  },
  { 
    match: ["hook", "hooks", "use"], 
    domain: "React Hooks",
    description: "Custom React hooks for state and behavior"
  },
  { 
    match: ["store", "state", "redux", "zustand", "context", "atom"], 
    domain: "State Management",
    description: "Application state management"
  },
  { 
    match: ["lib", "util", "helper", "common", "shared", "tool"], 
    domain: "Shared Utilities",
    description: "Common utilities and helper functions"
  },
  { 
    match: ["data", "database", "db", "prisma", "sql", "model", "schema", "migration", "seed"], 
    domain: "Data Layer",
    description: "Database access, models, and data persistence"
  },
  {
    match: ["config", "setting", "env", "constant"],
    domain: "Configuration",
    description: "Application configuration and environment settings"
  },
  {
    match: ["test", "spec", "fixture", "mock", "stub", "e2e", "cypress", "playwright"],
    domain: "Testing",
    description: "Test suites, fixtures, and testing utilities"
  },
  {
    match: ["job", "queue", "worker", "cron", "task", "scheduler", "background"],
    domain: "Background Jobs",
    description: "Background processing, job queues, and scheduled tasks"
  },
  {
    match: ["core", "kernel", "foundation", "engine"],
    domain: "Core Engine",
    description: "Core business logic and foundational modules"
  },
  {
    match: ["render", "template", "format", "output"],
    domain: "Rendering & Output",
    description: "Content rendering, formatting, and output generation"
  },
  {
    match: ["publish", "deploy", "release", "distribute"],
    domain: "Publishing & Delivery",
    description: "Content and artifact publishing, deployment, and distribution"
  },
  {
    match: ["analyz", "inspect", "detect", "lint", "scan", "parse"],
    domain: "Analysis & Detection",
    description: "Code analysis, pattern detection, and static inspection"
  },
  {
    match: ["plugin", "extension", "addon", "module"],
    domain: "Plugin System",
    description: "Extensibility framework, plugins, and add-ons"
  },
  {
    match: ["deliver", "dispatch", "send", "transport"],
    domain: "Delivery",
    description: "Content delivery and distribution channels"
  },
  {
    match: ["doc", "generate", "markdown", "readme"],
    domain: "Documentation",
    description: "Documentation generation and management"
  },
  {
    match: ["integrat", "connect", "adapter", "bridge", "gateway"],
    domain: "Integrations",
    description: "Third-party service integrations and adapters"
  },
  {
    match: ["cli", "command", "bin", "terminal", "shell", "prompt"],
    domain: "CLI & Commands",
    description: "Command-line interface and terminal commands"
  },
  {
    match: ["ai", "ml", "llm", "gpt", "openai", "anthropic", "gemini"],
    domain: "AI & Machine Learning",
    description: "AI/ML integration, LLM providers, and intelligent features"
  },
  {
    match: ["service", "provider", "client", "sdk"],
    domain: "Services",
    description: "Service layer, providers, and external client SDKs"
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
