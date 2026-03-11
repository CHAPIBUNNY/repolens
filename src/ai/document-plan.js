// Document plan - defines the canonical document structure

export const DOCUMENT_PLAN = [
  {
    key: "executive_summary",
    filename: "00-executive-summary.md",
    title: "Executive Summary",
    audience: "non-technical",
    ai: true,
    description: "High-level overview for leadership, product, and stakeholders"
  },
  {
    key: "system_overview",
    filename: "01-system-overview.md",
    title: "System Overview",
    audience: "mixed",
    ai: true,
    description: "Concise technical overview readable by all"
  },
  {
    key: "business_domains",
    filename: "02-business-domains.md",
    title: "Business Domains",
    audience: "mixed",
    ai: true,
    description: "Codebase structure translated into business language"
  },
  {
    key: "architecture_overview",
    filename: "03-architecture-overview.md",
    title: "Architecture Overview",
    audience: "technical",
    ai: true,
    description: "Layered architecture and design patterns"
  },
  {
    key: "module_catalog",
    filename: "04-module-catalog.md",
    title: "Module Catalog",
    audience: "technical",
    ai: "hybrid",
    description: "Complete inventory of code modules with AI explanations"
  },
  {
    key: "route_map",
    filename: "05-route-map.md",
    title: "Route Map",
    audience: "mixed",
    ai: "hybrid",
    description: "Application routes and API endpoints with context"
  },
  {
    key: "api_surface",
    filename: "06-api-surface.md",
    title: "API Surface",
    audience: "technical",
    ai: "hybrid",
    description: "Backend API endpoints with usage examples"
  },
  {
    key: "data_flows",
    filename: "07-data-flows.md",
    title: "Data Flows",
    audience: "mixed",
    ai: true,
    description: "Major information flows through the system"
  },
  {
    key: "arch_diff",
    filename: "08-change-impact.md",
    title: "Architecture Diff",
    audience: "mixed",
    ai: true,
    description: "Git diff analysis and impact assessment"
  },
  {
    key: "system_map",
    filename: "09-system-map.md",
    title: "System Map",
    audience: "mixed",
    ai: "hybrid",
    description: "Visual dependency graph with explanation"
  },
  {
    key: "developer_onboarding",
    filename: "10-developer-onboarding.md",
    title: "Developer Onboarding",
    audience: "technical",
    ai: true,
    description: "Quick start guide for new developers"
  },
  {
    key: "graphql_schema",
    filename: "11-graphql-schema.md",
    title: "GraphQL Schema",
    audience: "technical",
    ai: false,
    description: "GraphQL types, queries, mutations, and resolver map"
  },
  {
    key: "type_graph",
    filename: "12-type-graph.md",
    title: "TypeScript Type Graph",
    audience: "technical",
    ai: false,
    description: "TypeScript interfaces, types, classes, and relationships"
  },
  {
    key: "dependency_graph",
    filename: "13-dependency-graph.md",
    title: "Dependency Graph",
    audience: "technical",
    ai: false,
    description: "Module dependency analysis with cycle detection"
  },
  {
    key: "architecture_drift",
    filename: "14-architecture-drift.md",
    title: "Architecture Drift",
    audience: "mixed",
    ai: false,
    description: "Structural changes compared to baseline snapshot"
  }
];

export function getDocumentByKey(key) {
  return DOCUMENT_PLAN.find(doc => doc.key === key);
}

export function getDocumentsByAudience(audience) {
  return DOCUMENT_PLAN.filter(doc => doc.audience === audience);
}

export function getAIDocuments() {
  return DOCUMENT_PLAN.filter(doc => doc.ai === true || doc.ai === "hybrid");
}

export function getDeterministicDocuments() {
  return DOCUMENT_PLAN.filter(doc => !doc.ai);
}

export function getActiveDocuments(config) {
  // If config specifies which sections to include, filter by that
  if (config.documentation?.sections) {
    return DOCUMENT_PLAN.filter(doc => 
      config.documentation.sections.includes(doc.key)
    );
  }
  
  // If features flags exist, respect them
  if (config.features) {
    return DOCUMENT_PLAN.filter(doc => {
      // Always include core docs
      if (["system_overview", "module_catalog", "route_map"].includes(doc.key)) {
        return true;
      }
      
      // Check feature flags
      return config.features[doc.key] !== false;
    });
  }
  
  // Default: all documents
  return DOCUMENT_PLAN;
}
