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
