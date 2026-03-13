// Strict prompt templates for AI-generated documentation sections

const MAX_CONTEXT_CHARS = 12000; // ~3000 tokens, safe for all models

/**
 * Truncate a context object to fit within token limits.
 * Prunes large arrays (routes, modules, domains) to keep context compact.
 */
function truncateContext(context) {
  let json = JSON.stringify(context, null, 2);
  if (json.length <= MAX_CONTEXT_CHARS) return json;

  // Progressively shrink: reduce array sizes
  const trimmed = { ...context };

  // Trim routes
  if (trimmed.routes) {
    if (trimmed.routes.pages && trimmed.routes.pages.length > 15) {
      trimmed.routes = { ...trimmed.routes, pages: trimmed.routes.pages.slice(0, 15) };
    }
    if (trimmed.routes.apis && trimmed.routes.apis.length > 15) {
      trimmed.routes = { ...trimmed.routes, apis: trimmed.routes.apis.slice(0, 15) };
    }
  }

  // Trim domains
  if (Array.isArray(trimmed.domains) && trimmed.domains.length > 8) {
    trimmed.domains = trimmed.domains.slice(0, 8);
  }

  // Trim top modules
  if (Array.isArray(trimmed.topModules) && trimmed.topModules.length > 10) {
    trimmed.topModules = trimmed.topModules.slice(0, 10);
  }

  json = JSON.stringify(trimmed, null, 2);

  // Final hard truncation if still over limit
  if (json.length > MAX_CONTEXT_CHARS) {
    json = json.slice(0, MAX_CONTEXT_CHARS) + "\n... (context truncated for token limit)";
  }

  return json;
}

export const SYSTEM_PROMPT = `You are a senior software architect and technical writer.
Your job is to turn structured repository analysis into clear documentation.

Rules:
- Use only the supplied context.
- Never invent files, modules, routes, APIs, or business capabilities.
- If context is insufficient, say so briefly and continue with what is known.
- Write for mixed audiences when requested.
- Prefer clear prose and short sections over bullet spam.
- Be concrete and practical.
- Output valid markdown only.
- Do not mention AI, LLMs, or that you are an assistant.
- No markdown tables unless specifically requested.
- Use simple formatting: headings, paragraphs, lists.
- Maximum 2 heading levels deep within sections.`;

export function createExecutiveSummaryPrompt(context) {
  return `Write an executive summary for a mixed audience of technical and non-technical readers.

Use this context:
${truncateContext(context)}

Requirements:
- Explain what the system appears to do based on the modules and routes.
- Explain the main system areas using the domain information.
- Explain the business capabilities implied by the codebase structure.
- Mention key external dependencies only if they are present in the context.
- Mention architectural or operational risks if they are strongly supported by the context.
- Do not mention file counts more than once.
- Maximum 500 words.
- Use this structure:

# Executive Summary

## What this system does

## Who it serves

## Core capabilities

## Main system areas

## Key dependencies

## Operational and architectural risks

## Recommended focus areas`;
}

export function createSystemOverviewPrompt(context) {
  return `Write a system overview for a mixed audience.

Use this context:
${truncateContext(context)}

Requirements:
- Provide a concise, high-level orientation to the codebase.
- Technical enough for developers, readable enough for everyone else.
- Focus on what is observable from the structure.
- Maximum 400 words.
- Use this structure:

# System Overview

## Repository snapshot

## Main architectural layers

## Dominant domains

## Main technology patterns

## Where most logic lives

## Key observations`;
}

export function createBusinessDomainsPrompt(context) {
  return `Write business domain documentation for a mixed audience, especially non-technical readers.

Use this context:
${truncateContext(context)}

Requirements:
- Translate codebase structure into business language.
- For each domain in the context, explain:
  - Business responsibility
  - Main directories/modules
  - Dependencies
  - User-visible functionality (inferred from structure)
- Maximum 150 words per domain.
- Use this structure:

# Business Domains

## Domain: [Name]

[Business explanation]

Main modules:
- [module paths]

User-visible functionality:
[what users can do]

Dependencies:
[other domains this depends on]`;
}

export function createArchitectureOverviewPrompt(context) {
  return `Write an architecture overview for engineers, architects, and technical PMs.

Use this context:
${truncateContext(context)}

Requirements:
- Explain the layered architecture based on observable patterns.
- Describe flows across layers.
- Be specific about what is present in the context.
- Maximum 600 words.
- Use this structure:

# Architecture Overview

## Architecture style

## Application layer

## UI / component layer

## Domain / service layer

## Data / integration layer

## Cross-cutting concerns

## Dependency flow

## Architectural strengths

## Architectural weaknesses`;
}

export function createDataFlowsPrompt(flows, context) {
  return `Write data flow documentation for a mixed audience.

Use this flow information:
${truncateContext(flows)}

And this context:
${truncateContext(context)}

Requirements:
- Explain major information flows in plain language.
- For each flow, describe the journey from user action to system response.
- Be concrete about which modules are involved.
- Maximum 200 words per flow.
- Use this structure:

# Data Flows

## [Flow Name]

[Plain language description of the flow]

Flow steps:
[numbered steps]

Involved modules:
- [module paths]

Critical dependencies:
[what this flow depends on]`;
}

export function createDeveloperOnboardingPrompt(context) {
  return `Write developer onboarding documentation to help new engineers get productive quickly.

Use this context:
${truncateContext(context)}

Requirements:
- Guide new developers through the codebase structure.
- Point out the most important folders and files.
- Explain core product flows.
- Highlight complexity hotspots.
- Be practical and actionable.
- Maximum 800 words.
- Use this structure:

# Developer Onboarding

## Start here

## Main folders

## Core product flows

## Important routes

## Important shared libraries

## Common change areas

## What to understand first

## Known complexity hotspots`;
}

export function createModuleSummaryPrompt(module, context) {
  return `Write a short module documentation section.

Module: ${module.key}
File count: ${module.fileCount}
Type: ${module.type}
Domain: ${module.domain}

Additional context:
${truncateContext(context)}

Requirements:
- Explain the module's likely purpose.
- List concrete responsibilities.
- Mention important dependencies from context.
- Mention complexity or centrality if supported.
- No speculation beyond the provided context.
- Maximum 180 words.
- Use this structure:

## ${module.key}

Purpose:
[brief explanation]

Responsibilities:
- [concrete responsibilities]

Main dependencies:
[from context]

Complexity notes:
[if applicable]`;
}

export function createRouteSummaryPrompt(route, context) {
  return `Write a route documentation section.

Route: ${route.path}
File: ${route.file}
Type: ${route.type}

Additional context:
${truncateContext(context)}

Requirements:
- Explain the user purpose of this route.
- Explain the technical role.
- Mention main dependencies.
- Maximum 120 words.
- Use this structure:

## ${route.path}

User purpose:
[what users do here]

Technical role:
[what this route does]

Main dependencies:
[modules this uses]

Notes:
[any important observations]`;
}

export function createAPIDocumentationPrompt(api, context) {
  return `Write API endpoint documentation.

API: ${api.methods.join(", ")} ${api.path}
File: ${api.file}

Additional context:
${truncateContext(context)}

Requirements:
- Explain the purpose in plain language and technical language.
- Describe what it returns or does.
- Mention dependencies and integrations.
- Mention risks if any are apparent.
- Maximum 150 words.
- Use this structure:

## ${api.methods.join(", ")} ${api.path}

Purpose:
[plain language explanation]

Source file:
${api.file}

Used by:
[routes or components]

Dependencies:
[external services or internal modules]

Risks:
[if applicable]`;
}

// --- JSON schemas for structured AI output ---

export const AI_SCHEMAS = {
  executive_summary: {
    required: ["whatItDoes", "whoItServes", "coreCapabilities", "mainAreas", "risks"],
    description: "Executive summary for mixed audience",
  },
  system_overview: {
    required: ["snapshot", "layers", "domains", "patterns", "observations"],
    description: "High-level system overview",
  },
  business_domains: {
    required: ["domains"],
    description: "Business domain breakdown",
  },
  architecture_overview: {
    required: ["style", "layers", "strengths", "weaknesses"],
    description: "Architecture overview for engineers",
  },
  data_flows: {
    required: ["flows"],
    description: "Data flow documentation",
  },
  developer_onboarding: {
    required: ["startHere", "mainFolders", "coreFlows", "complexityHotspots"],
    description: "Developer onboarding guide",
  },
};

/**
 * Render a structured JSON response into Markdown for the given document type.
 */
export function renderStructuredToMarkdown(key, parsed) {
  switch (key) {
    case "executive_summary":
      return renderExecutiveSummaryJSON(parsed);
    case "system_overview":
      return renderSystemOverviewJSON(parsed);
    case "business_domains":
      return renderBusinessDomainsJSON(parsed);
    case "architecture_overview":
      return renderArchitectureOverviewJSON(parsed);
    case "data_flows":
      return renderDataFlowsJSON(parsed);
    case "developer_onboarding":
      return renderDeveloperOnboardingJSON(parsed);
    default:
      return null;
  }
}

/**
 * Safely convert any AI response value to a readable string.
 * Handles: strings, arrays (of strings or objects), plain objects, and other types.
 */
function safeStr(val) {
  if (val == null) return "";
  if (typeof val === "string") return val;
  if (Array.isArray(val)) return val.map(safeStr).join(", ");
  if (typeof val === "object") {
    // Try common field patterns the AI might use
    if (val.name) return val.description ? `${val.name}: ${val.description}` : val.name;
    if (val.title) return val.description ? `${val.title}: ${val.description}` : val.title;
    // Fallback: render object key/value pairs
    return Object.entries(val).map(([k, v]) => `${k}: ${typeof v === "string" ? v : safeStr(v)}`).join("; ");
  }
  return String(val);
}

/**
 * Convert a value to a bullet list.
 * Handles strings, arrays of strings, arrays of objects, and plain objects.
 */
function toBulletList(val) {
  if (val == null) return "";
  if (typeof val === "string") return val;
  if (Array.isArray(val)) {
    return val.map(item => {
      if (typeof item === "string") return `- ${item}`;
      if (typeof item === "object" && item !== null) {
        const label = item.name || item.title || Object.keys(item)[0] || "";
        const desc = item.description || item[Object.keys(item)[0]];
        if (label && desc && label !== desc) return `- **${label}**: ${desc}`;
        return `- ${safeStr(item)}`;
      }
      return `- ${String(item)}`;
    }).join("\n");
  }
  if (typeof val === "object") {
    // Object with key/value pairs → render as list
    return Object.entries(val).map(([k, v]) => `- **${k}**: ${typeof v === "string" ? v : safeStr(v)}`).join("\n");
  }
  return String(val);
}

/**
 * Convert a value to a heading-based section list (### heading per item).
 */
function toHeadingSections(val) {
  if (val == null) return "";
  if (typeof val === "string") return val;
  if (Array.isArray(val)) {
    return val.map(item => {
      if (typeof item === "string") return `### ${item}`;
      if (typeof item === "object" && item !== null) {
        const label = item.name || item.title || Object.keys(item)[0] || "Section";
        const desc = item.description || item[Object.keys(item)[0]] || "";
        return `### ${label}\n\n${typeof desc === "string" ? desc : safeStr(desc)}`;
      }
      return `### ${String(item)}`;
    }).join("\n\n");
  }
  if (typeof val === "object") {
    return Object.entries(val).map(([k, v]) => `### ${k}\n\n${typeof v === "string" ? v : safeStr(v)}`).join("\n\n");
  }
  return String(val);
}

function renderExecutiveSummaryJSON(d) {
  let md = `# Executive Summary\n\n`;
  md += `## What This System Does\n\n${safeStr(d.whatItDoes)}\n\n`;
  md += `## Who It Serves\n\n${safeStr(d.whoItServes)}\n\n`;
  md += `## Core Capabilities\n\n${toBulletList(d.coreCapabilities)}\n\n`;
  md += `## Main System Areas\n\n${toBulletList(d.mainAreas)}\n\n`;
  if (d.dependencies) md += `## Key Dependencies\n\n${toBulletList(d.dependencies)}\n\n`;
  md += `## Operational and Architectural Risks\n\n${toBulletList(d.risks)}\n\n`;
  if (d.focusAreas) md += `## Recommended Focus Areas\n\n${toBulletList(d.focusAreas)}\n`;
  return md;
}

function renderSystemOverviewJSON(d) {
  let md = `# System Overview\n\n`;
  md += `## Repository Snapshot\n\n${safeStr(d.snapshot)}\n\n`;
  md += `## Main Architectural Layers\n\n${toBulletList(d.layers)}\n\n`;
  md += `## Dominant Domains\n\n${toBulletList(d.domains)}\n\n`;
  md += `## Main Technology Patterns\n\n${toBulletList(d.patterns)}\n\n`;
  md += `## Key Observations\n\n${toBulletList(d.observations)}\n`;
  return md;
}

function renderBusinessDomainsJSON(d) {
  let md = `# Business Domains\n\n`;
  if (!Array.isArray(d.domains)) {
    // Handle object-style domains: { "Auth": { description: "..." }, ... }
    if (typeof d.domains === "object" && d.domains !== null) {
      for (const [name, info] of Object.entries(d.domains)) {
        const desc = typeof info === "string" ? info : info?.description || safeStr(info);
        md += `## ${name}\n\n${desc}\n\n`;
        if (info?.modules) md += `**Key modules:** ${safeStr(info.modules)}\n\n`;
        if (info?.userFunctionality) md += `**User-visible functionality:** ${info.userFunctionality}\n\n`;
        if (info?.dependencies) md += `**Dependencies:** ${safeStr(info.dependencies)}\n\n`;
      }
      return md;
    }
    return md + safeStr(d.domains);
  }
  for (const dom of d.domains) {
    const name = dom.name || dom.title || safeStr(dom);
    md += `## ${name}\n\n${dom.description || ""}\n\n`;
    if (dom.modules) md += `**Key modules:** ${safeStr(dom.modules)}\n\n`;
    if (dom.userFunctionality) md += `**User-visible functionality:** ${dom.userFunctionality}\n\n`;
    if (dom.dependencies) md += `**Dependencies:** ${safeStr(dom.dependencies)}\n\n`;
  }
  return md;
}

function renderArchitectureOverviewJSON(d) {
  let md = `# Architecture Overview\n\n`;
  md += `## Architecture Style\n\n${safeStr(d.style)}\n\n`;
  md += `## Layers\n\n${toHeadingSections(d.layers)}\n\n`;
  md += `## Architectural Strengths\n\n${toBulletList(d.strengths)}\n\n`;
  md += `## Architectural Weaknesses\n\n${toBulletList(d.weaknesses)}\n`;
  return md;
}

function renderDataFlowsJSON(d) {
  let md = `# Data Flows\n\n`;
  if (!Array.isArray(d.flows)) {
    if (typeof d.flows === "object" && d.flows !== null) {
      for (const [name, info] of Object.entries(d.flows)) {
        const desc = typeof info === "string" ? info : info?.description || safeStr(info);
        md += `## ${name}\n\n${desc}\n\n`;
        if (info?.steps) md += `**Steps:**\n${toBulletList(info.steps)}\n\n`;
        if (info?.modules) md += `**Involved modules:** ${safeStr(info.modules)}\n\n`;
      }
      return md;
    }
    return md + safeStr(d.flows);
  }
  for (const flow of d.flows) {
    const name = flow.name || flow.title || safeStr(flow);
    md += `## ${name}\n\n${flow.description || ""}\n\n`;
    if (flow.steps) {
      const steps = Array.isArray(flow.steps)
        ? flow.steps.map((s, i) => `${i + 1}. ${safeStr(s)}`).join("\n")
        : safeStr(flow.steps);
      md += `**Steps:**\n${steps}\n\n`;
    }
    if (flow.modules) md += `**Involved modules:** ${safeStr(flow.modules)}\n\n`;
    if (flow.criticalDependencies) md += `**Critical dependencies:** ${safeStr(flow.criticalDependencies)}\n\n`;
  }
  return md;
}

function renderDeveloperOnboardingJSON(d) {
  let md = `# Developer Onboarding\n\n`;
  md += `## Start Here\n\n${safeStr(d.startHere)}\n\n`;
  md += `## Main Folders\n\n${toBulletList(d.mainFolders)}\n\n`;
  md += `## Core Product Flows\n\n${toBulletList(d.coreFlows)}\n\n`;
  if (d.importantRoutes) md += `## Important Routes\n\n${toBulletList(d.importantRoutes)}\n\n`;
  if (d.sharedLibraries) md += `## Important Shared Libraries\n\n${toBulletList(d.sharedLibraries)}\n\n`;
  md += `## Known Complexity Hotspots\n\n${toBulletList(d.complexityHotspots)}\n`;
  return md;
}
