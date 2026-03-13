// Generate documentation sections using AI

import { generateText, isAIEnabled } from "./provider.js";
import { 
  SYSTEM_PROMPT, 
  createExecutiveSummaryPrompt,
  createSystemOverviewPrompt,
  createBusinessDomainsPrompt,
  createArchitectureOverviewPrompt,
  createDataFlowsPrompt,
  createDeveloperOnboardingPrompt,
  createModuleSummaryPrompt,
  createRouteSummaryPrompt,
  createAPIDocumentationPrompt,
  AI_SCHEMAS,
  renderStructuredToMarkdown,
} from "./prompts.js";
import { info, warn } from "../utils/logger.js";

/**
 * Try structured JSON mode first, fall back to plain-text AI, then deterministic.
 */
async function generateWithStructuredFallback(key, promptText, maxTokens, fallbackFn) {
  if (!isAIEnabled()) return fallbackFn();

  const schema = AI_SCHEMAS[key];

  // Try structured JSON mode
  if (schema) {
    info(`Generating ${key} with structured AI...`);
    const jsonPrompt = promptText + `\n\nRespond ONLY with a JSON object matching this schema: ${JSON.stringify({ required: schema.required })}. No markdown, no explanation — just the JSON object.`;

    const result = await generateText({
      system: SYSTEM_PROMPT,
      user: jsonPrompt,
      maxTokens,
      jsonMode: true,
      jsonSchema: schema,
    });

    if (result.success && result.parsed) {
      const md = renderStructuredToMarkdown(key, result.parsed);
      if (md) return md;
    }
    // If structured mode failed, fall through to plain-text
    warn(`Structured AI failed for ${key}, trying plain-text mode...`);
  }

  // Plain-text AI fallback
  info(`Generating ${key} with AI...`);
  const result = await generateText({
    system: SYSTEM_PROMPT,
    user: promptText,
    maxTokens,
  });

  if (!result.success) {
    warn("AI generation failed, using fallback");
    return fallbackFn();
  }

  return result.text;
}

export async function generateExecutiveSummary(context) {
  return generateWithStructuredFallback(
    "executive_summary",
    createExecutiveSummaryPrompt(context),
    1500,
    () => getFallbackExecutiveSummary(context),
  );
}

export async function generateSystemOverview(context) {
  return generateWithStructuredFallback(
    "system_overview",
    createSystemOverviewPrompt(context),
    1200,
    () => getFallbackSystemOverview(context),
  );
}

export async function generateBusinessDomains(context) {
  return generateWithStructuredFallback(
    "business_domains",
    createBusinessDomainsPrompt(context),
    2000,
    () => getFallbackBusinessDomains(context),
  );
}

export async function generateArchitectureOverview(context) {
  return generateWithStructuredFallback(
    "architecture_overview",
    createArchitectureOverviewPrompt(context),
    1800,
    () => getFallbackArchitectureOverview(context),
  );
}

export async function generateDataFlows(flows, context) {
  return generateWithStructuredFallback(
    "data_flows",
    createDataFlowsPrompt(flows, context),
    1800,
    () => getFallbackDataFlows(flows),
  );
}

export async function generateDeveloperOnboarding(context) {
  return generateWithStructuredFallback(
    "developer_onboarding",
    createDeveloperOnboardingPrompt(context),
    2200,
    () => getFallbackDeveloperOnboarding(context),
  );
}

// Fallback generators (deterministic, no AI)

function getFallbackExecutiveSummary(context) {
  const frameworkList = context.techStack.frameworks.join(", ") || "general-purpose";
  const languageList = context.techStack.languages.join(", ") || "multiple languages";
  const domainSummary = context.domains.slice(0, 5).map(d => d.name).join(", ");

  return `# Executive Summary

## What This System Does

${context.project.name} is a ${frameworkList} application built with ${languageList}. The codebase contains **${context.project.modulesDetected} modules** spread across **${context.project.filesScanned} files**, organized into ${context.domains.length} functional domain${context.domains.length === 1 ? "" : "s"}.

${context.project.apiRoutesDetected > 0 ? `The system exposes **${context.project.apiRoutesDetected} API endpoint${context.project.apiRoutesDetected === 1 ? "" : "s"}** and` : "It"} serves **${context.project.pagesDetected} application page${context.project.pagesDetected === 1 ? "" : "s"}** to end users.

## Primary Functional Areas

The application is organized around the following business domains:

| Domain | Modules | Description |
|--------|---------|-------------|
${context.domains.map(d => `| ${d.name} | ${d.moduleCount} | ${d.description || "—"} |`).join("\n")}

## Technology Profile

| Category | Details |
|----------|---------|
| Frameworks | ${context.techStack.frameworks.join(", ") || "Not detected"} |
| Languages | ${context.techStack.languages.join(", ") || "Not detected"} |
| Build Tools | ${context.techStack.buildTools.join(", ") || "Not detected"} |

## Key Observations

The codebase follows ${context.patterns.length > 0 ? context.patterns.join(", ") : "standard"} architectural patterns. ${domainSummary ? `The core functional areas — ${domainSummary} — account for the majority of the application logic.` : ""}

---

*This summary is generated deterministically from repository structure. Enable AI enhancement (\`REPOLENS_AI_ENABLED=true\`) for natural language insights tailored to non-technical readers.*`;
}

function getFallbackSystemOverview(context) {
  const sizeLabel = context.project.modulesDetected > 50 ? "large-scale" :
                    context.project.modulesDetected > 20 ? "medium-sized" : "focused";

  return `# System Overview

## Repository Snapshot

This is a ${sizeLabel} codebase organized into **${context.project.modulesDetected} modules** across **${context.project.filesScanned} files**.

| Metric | Value |
|--------|-------|
| Files scanned | ${context.project.filesScanned} |
| Modules | ${context.project.modulesDetected} |
| Application pages | ${context.project.pagesDetected} |
| API endpoints | ${context.project.apiRoutesDetected} |

## Detected Patterns

${context.patterns.length > 0 ? context.patterns.map(p => `- ${p}`).join("\n") : "No specific architectural patterns were detected. This typically means the project uses a straightforward directory-based organization."}

## Dominant Domains

The following domains represent the largest areas of the codebase by file count:

| Rank | Domain | Files |
|------|--------|-------|
${context.domains.slice(0, 5).map((d, i) => `| ${i + 1} | ${d.name} | ${d.fileCount} |`).join("\n")}

---

*This overview is generated deterministically. Enable AI enhancement (\`REPOLENS_AI_ENABLED=true\`) for richer contextual explanations.*`;
}

function getFallbackBusinessDomains(context) {
  let output = `# Business Domains\n\n`;
  output += `> This document maps the codebase into business-oriented functional areas. Each domain represents a distinct area of responsibility.\n\n`;
  output += `**Total domains identified:** ${context.domains.length}\n\n`;
  output += `---\n\n`;
  
  for (const domain of context.domains) {
    output += `## ${domain.name}\n\n`;
    output += `${domain.description || "This domain covers a distinct functional area of the application."}\n\n`;
    output += `| Metric | Value |\n`;
    output += `|--------|-------|\n`;
    output += `| Modules | ${domain.moduleCount} |\n`;
    output += `| Files | ${domain.fileCount} |\n\n`;
    if (domain.topModules?.length > 0) {
      output += `**Key modules:** ${domain.topModules.slice(0, 5).map(m => `\`${m}\``).join(", ")}\n\n`;
    }
  }
  
  output += `---\n\n*Domain mapping is based on directory naming conventions. Enable AI enhancement (\`REPOLENS_AI_ENABLED=true\`) for natural language descriptions aimed at non-technical stakeholders.*`;
  
  return output;
}

function getFallbackArchitectureOverview(context) {
  const patternDesc = context.patterns.length > 0
    ? `The detected architectural patterns are **${context.patterns.join(", ")}**. These patterns shape how data and control flow through the system.`
    : "No specific architectural patterns were detected. The project appears to follow a straightforward directory-based organization.";

  return `# Architecture Overview

## Architectural Style

${patternDesc}

## System Layers

The codebase is organized into ${context.domains.length} functional layers, each encapsulating a distinct area of responsibility:

| Layer | Description |
|-------|-------------|
${context.domains.slice(0, 8).map(d => `| **${d.name}** | ${d.description || "Handles a distinct functional concern"} |`).join("\n")}

## Technology Stack

| Category | Technologies |
|----------|-------------|
| Frameworks | ${context.techStack.frameworks.join(", ") || "Not detected"} |
| Languages | ${context.techStack.languages.join(", ") || "Not detected"} |
| Build Tools | ${context.techStack.buildTools.join(", ") || "Not detected"} |

## Scale & Complexity

The repository comprises **${context.project.filesScanned} files** organized into **${context.project.modulesDetected} modules**. ${context.project.apiRoutesDetected > 0 ? `It exposes **${context.project.apiRoutesDetected} API endpoint${context.project.apiRoutesDetected === 1 ? "" : "s"}** and` : "It"} serves **${context.project.pagesDetected} application page${context.project.pagesDetected === 1 ? "" : "s"}**.

---

*This architecture overview is generated deterministically. Enable AI enhancement (\`REPOLENS_AI_ENABLED=true\`) for deeper architectural narratives.*`;
}

function getFallbackDataFlows(flows) {
  let output = `# Data Flows\n\n`;
  output += `> Data flows describe how information moves through the system — from external inputs through processing layers to storage or presentation.\n\n`;

  if (!flows || flows.length === 0) {
    output += `No data flows were detected. This typically means the system uses straightforward request–response patterns without distinct multi-step pipelines.\n\n`;
    output += `---\n\n*Enable AI enhancement (\`REPOLENS_AI_ENABLED=true\`) for heuristic-based flow descriptions.*`;
    return output;
  }

  output += `**${flows.length} flow${flows.length === 1 ? "" : "s"} detected** in the codebase.\n\n---\n\n`;
  
  for (const flow of flows) {
    output += `## ${flow.name}\n\n`;
    output += `${flow.description}\n\n`;
    if (flow.steps && flow.steps.length > 0) {
      output += `| Step | Action |\n`;
      output += `|------|--------|\n`;
      output += flow.steps.map((s, i) => `| ${i + 1} | ${s} |`).join("\n");
      output += `\n\n`;
    }
    if (flow.modules && flow.modules.length > 0) {
      output += `**Involved modules:** ${flow.modules.map(m => `\`${m}\``).join(", ")}\n\n`;
    }
  }
  
  output += `---\n\n*Flow detection is based on naming conventions and import patterns. Enable AI enhancement (\`REPOLENS_AI_ENABLED=true\`) for natural language flow narratives.*`;
  
  return output;
}

function getFallbackDeveloperOnboarding(context) {
  const frameworkList = context.techStack.frameworks.join(", ") || "general-purpose tools";
  const languageList = context.techStack.languages.join(", ") || "standard languages";

  return `# Developer Onboarding

## Welcome

This guide helps new contributors get oriented in the **${context.project.name}** repository. The project is built with ${frameworkList} and ${languageList}, containing **${context.project.modulesDetected} modules** across **${context.project.filesScanned} files**.

## Repository Structure

The top-level directory is organized as follows:

| Directory | Purpose |
|-----------|---------|
${context.repoRoots.map(root => `| \`${root}\` | ${describeRoot(root)} |`).join("\n")}

## Technology Stack

| Category | Technologies |
|----------|-------------|
| Frameworks | ${context.techStack.frameworks.join(", ") || "Not detected"} |
| Languages | ${context.techStack.languages.join(", ") || "Not detected"} |
| Build Tools | ${context.techStack.buildTools.join(", ") || "Not detected"} |

## Largest Modules

These are the primary modules by file count — good starting points for understanding the system:

| Module | Files | Description |
|--------|-------|-------------|
${context.topModules.slice(0, 10).map((m, i) => `| \`${m.key}\` | ${m.fileCount} | ${describeOnboardingModule(m.key)} |`).join("\n")}

## Getting Started

1. Clone the repository and install dependencies
2. Review the top-level directories above to understand the project layout
3. Start with the largest modules listed above — they contain the core functionality
4. Check for a \`README.md\` or \`CONTRIBUTING.md\` file for project-specific setup instructions

---

*This onboarding guide is generated deterministically. Enable AI enhancement (\`REPOLENS_AI_ENABLED=true\`) for a narrative-style guide with tips and common pitfalls.*`;
}

function describeRoot(root) {
  const lower = root.toLowerCase().replace(/\/$/, "");
  if (/^src$|^lib$/.test(lower)) return "Application source code";
  if (/^test|^__test|^spec/.test(lower)) return "Test suites";
  if (/^doc/.test(lower)) return "Documentation";
  if (/^bin$|^scripts?$/.test(lower)) return "CLI entry points and scripts";
  if (/^config/.test(lower)) return "Configuration files";
  if (/^public$|^static$|^assets$/.test(lower)) return "Static assets";
  if (/^dist$|^build$|^out$/.test(lower)) return "Build output";
  if (/^\.github$/.test(lower)) return "GitHub Actions and workflows";
  if (/^api$/.test(lower)) return "API definitions";
  if (/^components?$/.test(lower)) return "Shared UI components";
  if (/^pages?$|^views?$|^screens?$/.test(lower)) return "Application pages/views";
  if (/^utils?$|^helpers?$/.test(lower)) return "Utility functions";
  if (/^services?$/.test(lower)) return "Service layer";
  if (/^hooks?$/.test(lower)) return "Custom hooks";
  return "Project files";
}

function describeOnboardingModule(key) {
  const lower = key.toLowerCase();
  if (/auth/.test(lower)) return "Authentication and authorization logic";
  if (/api|route|endpoint/.test(lower)) return "API layer and route handlers";
  if (/component|widget|ui/.test(lower)) return "User interface components";
  if (/hook/.test(lower)) return "Custom hooks and shared state logic";
  if (/util|helper|lib/.test(lower)) return "Utility and helper functions";
  if (/service/.test(lower)) return "Service layer / business logic";
  if (/model|schema|entity/.test(lower)) return "Data models and schemas";
  if (/config|setting/.test(lower)) return "Configuration management";
  if (/test|spec/.test(lower)) return "Test infrastructure";
  if (/style|css|theme/.test(lower)) return "Styling and theming";
  if (/page|view|screen/.test(lower)) return "Application pages and views";
  if (/store|state|redux/.test(lower)) return "State management";
  if (/middleware/.test(lower)) return "Request/response middleware";
  if (/database|db|migration/.test(lower)) return "Database layer";
  if (/render/.test(lower)) return "Rendering and template logic";
  if (/publish/.test(lower)) return "Publishing and output delivery";
  if (/scan/.test(lower)) return "File and repository scanning";
  if (/analyz/.test(lower)) return "Code analysis and inference";
  return "Core application module";
}
