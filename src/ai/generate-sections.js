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
import { identifyFlowDependencies } from "../analyzers/flow-inference.js";
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

export async function generateExecutiveSummary(context, enrichment = {}) {
  return generateWithStructuredFallback(
    "executive_summary",
    createExecutiveSummaryPrompt(context),
    1500,
    () => getFallbackExecutiveSummary(context, enrichment),
  );
}

export async function generateSystemOverview(context, enrichment = {}) {
  return generateWithStructuredFallback(
    "system_overview",
    createSystemOverviewPrompt(context),
    1200,
    () => getFallbackSystemOverview(context, enrichment),
  );
}

export async function generateBusinessDomains(context, enrichment = {}) {
  return generateWithStructuredFallback(
    "business_domains",
    createBusinessDomainsPrompt(context),
    2000,
    () => getFallbackBusinessDomains(context, enrichment),
  );
}

export async function generateArchitectureOverview(context, enrichment = {}) {
  return generateWithStructuredFallback(
    "architecture_overview",
    createArchitectureOverviewPrompt(context),
    1800,
    () => getFallbackArchitectureOverview(context, enrichment),
  );
}

export async function generateDataFlows(flows, context, enrichment = {}) {
  return generateWithStructuredFallback(
    "data_flows",
    createDataFlowsPrompt(flows, context),
    1800,
    () => getFallbackDataFlows(flows, context, enrichment),
  );
}

export async function generateDeveloperOnboarding(context, enrichment = {}) {
  return generateWithStructuredFallback(
    "developer_onboarding",
    createDeveloperOnboardingPrompt(context),
    2200,
    () => getFallbackDeveloperOnboarding(context, enrichment),
  );
}

// Fallback generators (deterministic, no AI)

function getFallbackExecutiveSummary(context, enrichment = {}) {
  const { depGraph, flows } = enrichment;
  const frameworkList = context.techStack.frameworks.join(", ") || "general-purpose";
  const languageList = context.techStack.languages.join(", ") || "multiple languages";
  const domainSummary = context.domains.slice(0, 5).map(d => d.name).join(", ");
  const testFrameworks = context.techStack.testFrameworks || [];
  const isCLI = (context.patterns || []).some(p => p.toLowerCase().includes("cli"));

  // Build the "what it does" line based on project type
  let interfaceLine;
  if (isCLI) {
    interfaceLine = "It operates as a **command-line tool**, interacting through terminal commands rather than a web interface.";
  } else {
    const parts = [];
    if (context.project.apiRoutesDetected > 0) parts.push(`exposes **${context.project.apiRoutesDetected} API endpoint${context.project.apiRoutesDetected === 1 ? "" : "s"}**`);
    if (context.project.pagesDetected > 0) parts.push(`serves **${context.project.pagesDetected} application page${context.project.pagesDetected === 1 ? "" : "s"}** to end users`);
    interfaceLine = parts.length > 0 ? `It ${parts.join(" and ")}.` : "";
  }

  let output = `# Executive Summary

## What This System Does

${context.project.name} is a ${frameworkList} application built with ${languageList}. The codebase contains **${context.project.modulesDetected} modules** spread across **${context.project.filesScanned} files**, organized into ${context.domains.length} functional domain${context.domains.length === 1 ? "" : "s"}.

${interfaceLine}

## Primary Functional Areas

The application is organized around the following business domains:

| Domain | Modules | Description |
|--------|---------|-------------|
${context.domains.map(d => `| ${d.name} | ${d.moduleCount} | ${d.description || "—"} |`).join("\n")}

## Technology Profile

| Category | Details |
|----------|---------|
| Frameworks | ${context.techStack.frameworks.join(", ") || (isCLI ? "N/A (CLI tool)" : "Not detected")} |
| Languages | ${context.techStack.languages.join(", ") || "Not detected"} |
| Build Tools | ${context.techStack.buildTools.join(", ") || (isCLI ? "N/A (CLI tool)" : "Not detected")} |
${testFrameworks.length > 0 ? `| Test Frameworks | ${testFrameworks.join(", ")} |\n` : ""}`;

  // Module type breakdown
  const typeGroups = groupModulesByType(context.topModules);
  if (Object.keys(typeGroups).length > 1) {
    output += `\n## Module Composition\n\n`;
    output += `| Layer | Modules | Examples |\n`;
    output += `|-------|---------|----------|\n`;
    for (const [type, mods] of Object.entries(typeGroups)) {
      const examples = mods.slice(0, 3).map(m => `\`${m.key}\``).join(", ");
      output += `| ${formatModuleType(type)} | ${mods.length} | ${examples} |\n`;
    }
  }

  // Monorepo info
  if (context.monorepo) {
    output += `\n## Monorepo Structure\n\n`;
    output += `This is a **${context.monorepo.tool}** monorepo containing **${context.monorepo.packageCount} package${context.monorepo.packageCount === 1 ? "" : "s"}**:\n\n`;
    output += context.monorepo.packages.slice(0, 10).map(p => `- \`${p.name}\` (${p.path})`).join("\n");
    output += "\n";
  }

  // Dependency health
  if (depGraph?.stats) {
    const stats = depGraph.stats;
    output += `\n## Codebase Health\n\n`;
    output += `| Metric | Value |\n`;
    output += `|--------|-------|\n`;
    output += `| Internal imports | ${stats.totalEdges} |\n`;
    output += `| External dependencies | ${stats.externalDeps} |\n`;
    output += `| Circular dependencies | ${stats.cycles} |\n`;
    output += `| Orphan files | ${stats.orphanFiles} |\n`;
    if (stats.cycles === 0) {
      output += `\nThe dependency graph is **cycle-free**, indicating clean module boundaries.\n`;
    } else {
      output += `\n⚠️ **${stats.cycles} circular dependenc${stats.cycles === 1 ? "y" : "ies"}** detected — these may complicate refactoring and testing.\n`;
    }
  }

  // Data flows (filter out test file flows for exec summary)
  const summaryFlows = (flows || []).filter(f => !f.name?.toLowerCase().includes('test'));
  if (summaryFlows.length > 0) {
    output += `\n## Key Data Flows\n\n`;
    output += `${summaryFlows.length} data flow${summaryFlows.length === 1 ? "" : "s"} identified:\n\n`;
    for (const flow of summaryFlows) {
      output += `- **${flow.name}**${flow.critical ? " (critical)" : ""} — ${flow.description}\n`;
    }
  }

  output += `\n## Key Observations

The codebase follows ${context.patterns.length > 0 ? context.patterns.join(", ") : "standard"} architectural patterns. ${domainSummary ? `The core functional areas — ${domainSummary} — account for the majority of the application logic.` : ""}

---

*This summary is generated deterministically from repository structure. Enable AI enhancement (\`REPOLENS_AI_ENABLED=true\`) for natural language insights tailored to non-technical readers.*`;

  return output;
}

function getFallbackSystemOverview(context, enrichment = {}) {
  const { depGraph } = enrichment;
  const sizeLabel = context.project.modulesDetected > 50 ? "large-scale" :
                    context.project.modulesDetected > 20 ? "medium-sized" : "focused";
  const testFrameworks = context.techStack.testFrameworks || [];
  const isCLI = (context.patterns || []).some(p => p.toLowerCase().includes("cli"));

  let output = `# System Overview

## Repository Snapshot

This is a ${sizeLabel} codebase organized into **${context.project.modulesDetected} modules** across **${context.project.filesScanned} files**.

| Metric | Value |
|--------|-------|
| Files scanned | ${context.project.filesScanned} |
| Modules | ${context.project.modulesDetected} |
${context.project.pagesDetected > 0 ? `| Application pages | ${context.project.pagesDetected} |\n` : ""}${context.project.apiRoutesDetected > 0 ? `| API endpoints | ${context.project.apiRoutesDetected} |\n` : ""}
## Technology Stack

| Category | Technologies |
|----------|-------------|
| Frameworks | ${context.techStack.frameworks.join(", ") || (isCLI ? "N/A (CLI tool)" : "Not detected")} |
| Languages | ${context.techStack.languages.join(", ") || "Not detected"} |
| Build Tools | ${context.techStack.buildTools.join(", ") || (isCLI ? "N/A (CLI tool)" : "Not detected")} |
${testFrameworks.length > 0 ? `| Test Frameworks | ${testFrameworks.join(", ")} |\n` : ""}
## Detected Patterns

${context.patterns.length > 0 ? context.patterns.map(p => `- ${p}`).join("\n") : "No specific architectural patterns were detected. This typically means the project uses a straightforward directory-based organization."}
`;

  // Module type breakdown
  const typeGroups = groupModulesByType(context.topModules);
  if (Object.keys(typeGroups).length > 1) {
    output += `\n## Module Architecture\n\n`;
    output += `The codebase is organized into the following module layers:\n\n`;
    for (const [type, mods] of Object.entries(typeGroups)) {
      const moduleList = mods.slice(0, 5).map(m => `\`${m.key}\` (${m.fileCount} files)`).join(", ");
      output += `- **${formatModuleType(type)}** (${mods.length}): ${moduleList}\n`;
    }
  }

  output += `\n## Dominant Domains

The following domains represent the largest areas of the codebase by file count:

| Rank | Domain | Files |
|------|--------|-------|
${context.domains.slice(0, 5).map((d, i) => `| ${i + 1} | ${d.name} | ${d.fileCount} |`).join("\n")}
`;

  // Route highlights
  const routes = context.routes || {};
  const pages = routes.pages || [];
  const apis = routes.apis || [];
  if (pages.length > 0 || apis.length > 0) {
    output += `\n## Route Summary\n\n`;
    if (pages.length > 0) {
      output += `**Application Pages** (${pages.length} total):\n\n`;
      for (const p of pages.slice(0, 8)) {
        output += `- \`${p.path}\`\n`;
      }
      if (pages.length > 8) output += `- … and ${pages.length - 8} more\n`;
      output += "\n";
    }
    if (apis.length > 0) {
      output += `**API Endpoints** (${apis.length} total):\n\n`;
      for (const a of apis.slice(0, 8)) {
        const methods = a.methods ? ` [${a.methods.join(", ")}]` : "";
        output += `- \`${a.path}\`${methods}\n`;
      }
      if (apis.length > 8) output += `- … and ${apis.length - 8} more\n`;
      output += "\n";
    }
  }

  // Dependency graph highlights
  if (depGraph?.stats) {
    const stats = depGraph.stats;
    output += `## Dependency Graph\n\n`;
    output += `| Metric | Value |\n`;
    output += `|--------|-------|\n`;
    output += `| Internal imports | ${stats.totalEdges} |\n`;
    output += `| External packages | ${stats.externalDeps} |\n`;
    output += `| Circular dependencies | ${stats.cycles} |\n`;
    output += `| Orphan files | ${stats.orphanFiles} |\n`;
    if (stats.hubs && stats.hubs.length > 0) {
      output += `\n**Hub modules** (most imported):\n\n`;
      for (const hub of stats.hubs.slice(0, 5)) {
        output += `- \`${hub.key}\` — imported by ${hub.importedBy} files\n`;
      }
    }
    output += "\n";
  }

  // Monorepo
  if (context.monorepo) {
    output += `## Monorepo\n\n`;
    output += `Managed by **${context.monorepo.tool}** with **${context.monorepo.packageCount} packages**.\n\n`;
  }

  output += `---

*This overview is generated deterministically. Enable AI enhancement (\`REPOLENS_AI_ENABLED=true\`) for richer contextual explanations.*`;

  return output;
}

function getFallbackBusinessDomains(context, enrichment = {}) {
  const { depGraph } = enrichment;
  const routes = context.routes || {};
  const pages = routes.pages || [];
  const apis = routes.apis || [];

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

    // Match routes to this domain by checking if any domain module paths appear in routes
    const domainModules = domain.topModules || [];
    const domainPages = pages.filter(p =>
      domainModules.some(m => p.path.toLowerCase().includes(m.toLowerCase().split("/").pop()))
    );
    const domainApis = apis.filter(a =>
      domainModules.some(m => a.path.toLowerCase().includes(m.toLowerCase().split("/").pop()))
    );

    if (domainPages.length > 0 || domainApis.length > 0) {
      output += `**Routes in this domain:**\n\n`;
      for (const p of domainPages.slice(0, 5)) {
        output += `- 📄 \`${p.path}\`\n`;
      }
      for (const a of domainApis.slice(0, 5)) {
        const methods = a.methods ? ` [${a.methods.join(", ")}]` : "";
        output += `- 🔌 \`${a.path}\`${methods}\n`;
      }
      output += "\n";
    }
  }

  // Cross-domain dependency insights
  if (depGraph?.stats?.hubs && depGraph.stats.hubs.length > 0) {
    output += `## Cross-Domain Dependencies\n\n`;
    output += `The following modules are heavily imported across the codebase, likely serving as shared infrastructure:\n\n`;
    for (const hub of depGraph.stats.hubs.slice(0, 5)) {
      output += `- \`${hub.key}\` — imported by ${hub.importedBy} modules\n`;
    }
    output += "\n";
  }
  
  output += `---\n\n*Domain mapping is based on directory naming conventions. Enable AI enhancement (\`REPOLENS_AI_ENABLED=true\`) for natural language descriptions aimed at non-technical stakeholders.*`;
  
  return output;
}

function getFallbackArchitectureOverview(context, enrichment = {}) {
  const { depGraph, driftResult } = enrichment;
  const isCLI = (context.patterns || []).some(p => p.toLowerCase().includes("cli"));
  const patternDesc = context.patterns.length > 0
    ? `The detected architectural patterns are **${context.patterns.join(", ")}**. These patterns shape how data and control flow through the system.`
    : "No specific architectural patterns were detected. The project appears to follow a straightforward directory-based organization.";

  let output = `# Architecture Overview

## Architectural Style

${patternDesc}

## System Layers

The codebase is organized into ${context.domains.length} functional layers, each encapsulating a distinct area of responsibility:

| Layer | Description |
|-------|-------------|
${context.domains.slice(0, 8).map(d => `| **${d.name}** | ${d.description || "Handles a distinct functional concern"} |`).join("\n")}
`;

  // Module layer breakdown by type
  const typeGroups = groupModulesByType(context.topModules);
  if (Object.keys(typeGroups).length > 1) {
    output += `\n## Module Layers\n\n`;
    output += `Modules are classified into architectural layers based on their role:\n\n`;
    for (const [type, mods] of Object.entries(typeGroups)) {
      output += `### ${formatModuleType(type)}\n\n`;
      for (const m of mods.slice(0, 5)) {
        output += `- \`${m.key}\` (${m.fileCount} files)\n`;
      }
      output += "\n";
    }
  }

  output += `## Technology Stack

| Category | Technologies |
|----------|-------------|
| Frameworks | ${context.techStack.frameworks.join(", ") || (isCLI ? "N/A (CLI tool)" : "Not detected")} |
| Languages | ${context.techStack.languages.join(", ") || "Not detected"} |
| Build Tools | ${context.techStack.buildTools.join(", ") || (isCLI ? "N/A (CLI tool)" : "Not detected")} |

## Scale & Complexity

The repository comprises **${context.project.filesScanned} files** organized into **${context.project.modulesDetected} modules**.${context.project.apiRoutesDetected > 0 ? ` It exposes **${context.project.apiRoutesDetected} API endpoint${context.project.apiRoutesDetected === 1 ? "" : "s"}**.` : ""}${context.project.pagesDetected > 0 ? ` It serves **${context.project.pagesDetected} application page${context.project.pagesDetected === 1 ? "" : "s"}**.` : ""}${isCLI ? " It operates as a command-line tool." : ""}
`;

  // Dependency graph health
  if (depGraph?.stats) {
    const stats = depGraph.stats;
    output += `\n## Dependency Health\n\n`;
    output += `| Metric | Value |\n`;
    output += `|--------|-------|\n`;
    output += `| Import edges | ${stats.totalEdges} |\n`;
    output += `| External packages | ${stats.externalDeps} |\n`;
    output += `| Circular dependencies | ${stats.cycles} |\n`;
    output += `| Orphan files | ${stats.orphanFiles} |\n\n`;

    // Strengths
    const strengths = [];
    const concerns = [];
    if (stats.cycles === 0) strengths.push("No circular dependencies — clean module boundaries");
    if (stats.orphanFiles === 0) strengths.push("No orphan files — all code is connected");
    if (stats.hubs && stats.hubs.length > 0 && stats.hubs[0].importedBy < stats.totalFiles * 0.3)
      strengths.push("No excessively coupled hubs");

    if (stats.cycles > 0) concerns.push(`${stats.cycles} circular dependenc${stats.cycles === 1 ? "y" : "ies"} — may hinder testing and refactoring`);
    if (stats.orphanFiles > stats.totalFiles * 0.2)
      concerns.push(`High orphan file ratio (${stats.orphanFiles}/${stats.totalFiles}) — possible dead code`);
    if (stats.hubs && stats.hubs.length > 0 && stats.hubs[0].importedBy >= stats.totalFiles * 0.3)
      concerns.push(`\`${stats.hubs[0].key}\` is imported by ${stats.hubs[0].importedBy} files — high coupling risk`);

    if (strengths.length > 0) {
      output += `**Strengths:**\n\n`;
      for (const s of strengths) output += `- ✅ ${s}\n`;
      output += "\n";
    }
    if (concerns.length > 0) {
      output += `**Concerns:**\n\n`;
      for (const c of concerns) output += `- ⚠️ ${c}\n`;
      output += "\n";
    }

    if (stats.hubs && stats.hubs.length > 0) {
      output += `**Hub modules** (most imported):\n\n`;
      for (const hub of stats.hubs.slice(0, 5)) {
        output += `- \`${hub.key}\` — imported by ${hub.importedBy} files\n`;
      }
      output += "\n";
    }
  }

  // Drift summary
  if (driftResult?.drifts && driftResult.drifts.length > 0) {
    output += `## Architecture Drift\n\n`;
    output += `${driftResult.drifts.length} drift${driftResult.drifts.length === 1 ? "" : "s"} detected since last baseline:\n\n`;
    for (const drift of driftResult.drifts.slice(0, 5)) {
      output += `- **${drift.type}**: ${drift.description || drift.message || "Change detected"}\n`;
    }
    output += "\n";
  }

  // Monorepo
  if (context.monorepo) {
    output += `## Monorepo Architecture\n\n`;
    output += `This project is a **${context.monorepo.tool}** monorepo with **${context.monorepo.packageCount} packages**:\n\n`;
    for (const pkg of context.monorepo.packages.slice(0, 10)) {
      output += `- \`${pkg.name}\` — ${pkg.path}\n`;
    }
    output += "\n";
  }

  output += `---

*This architecture overview is generated deterministically. Enable AI enhancement (\`REPOLENS_AI_ENABLED=true\`) for deeper architectural narratives.*`;

  return output;
}

function getFallbackDataFlows(flows, context, enrichment = {}) {
  const { depGraph, scanResult } = enrichment;

  let output = `# Data Flows\n\n`;
  output += `> Data flows describe how information moves through the system — from external inputs through processing layers to storage or presentation.\n\n`;

  // Combine heuristic flows with dep-graph-derived flows, filtering out test file flows
  const allFlows = [...(flows || [])].filter(f => !f.name?.toLowerCase().includes('test'));

  // Generate additional flows from dependency graph hub chains
  if (depGraph?.nodes && depGraph.nodes.length > 0 && allFlows.length < 3) {
    const hubFlows = inferFlowsFromDepGraph(depGraph);
    for (const hf of hubFlows) {
      if (!allFlows.some(f => f.name === hf.name)) {
        allFlows.push(hf);
      }
    }
  }

  if (allFlows.length === 0) {
    output += `No data flows were detected. This typically means the system uses straightforward request–response patterns without distinct multi-step pipelines.\n\n`;
    output += `---\n\n*Enable AI enhancement (\`REPOLENS_AI_ENABLED=true\`) for heuristic-based flow descriptions.*`;
    return output;
  }

  output += `**${allFlows.length} flow${allFlows.length === 1 ? "" : "s"} detected** in the codebase.\n\n---\n\n`;
  
  for (const flow of allFlows) {
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

    // Add dependency context if available
    if (scanResult && flow.modules) {
      const deps = identifyFlowDependencies(flow, scanResult);
      if (deps.sharedLibraries.length > 0) {
        output += `**Shared libraries used:** ${deps.sharedLibraries.map(m => `\`${m}\``).join(", ")}\n\n`;
      }
      if (deps.externalDependencies.length > 0) {
        output += `**External services:** ${deps.externalDependencies.join(", ")}\n\n`;
      }
    }
  }

  // Import chain summary
  if (depGraph?.stats) {
    output += `## Import Network\n\n`;
    output += `The system has **${depGraph.stats.totalEdges} internal import edges** connecting ${depGraph.stats.totalFiles} source files.\n\n`;
    if (depGraph.stats.hubs && depGraph.stats.hubs.length > 0) {
      output += `Key integration points (most referenced modules):\n\n`;
      for (const hub of depGraph.stats.hubs.slice(0, 5)) {
        output += `- \`${hub.key}\` — referenced by ${hub.importedBy} files\n`;
      }
      output += "\n";
    }
  }
  
  output += `---\n\n*Flow detection is based on naming conventions and import patterns. Enable AI enhancement (\`REPOLENS_AI_ENABLED=true\`) for natural language flow narratives.*`;
  
  return output;
}

function getFallbackDeveloperOnboarding(context, enrichment = {}) {
  const { flows, depGraph } = enrichment;
  const frameworkList = context.techStack.frameworks.join(", ") || "general-purpose tools";
  const languageList = context.techStack.languages.join(", ") || "standard languages";
  const testFrameworks = context.techStack.testFrameworks || [];
  const isCLI = (context.patterns || []).some(p => p.toLowerCase().includes("cli"));
  const routes = context.routes || {};
  const pages = routes.pages || [];
  const apis = routes.apis || [];

  let output = `# Developer Onboarding

## Welcome

This guide helps new contributors get oriented in the **${context.project.name}** repository. The project is built with ${frameworkList} and ${languageList}, containing **${context.project.modulesDetected} modules** across **${context.project.filesScanned} files**.

## Repository Structure

The top-level directory is organized as follows:

| Directory | Purpose |
|-----------|---------|
${context.repoRoots.map(root => `| \`${root}\` | ${describeRoot(root)} |`).join("\n")}
`;

  // Monorepo navigation
  if (context.monorepo) {
    output += `\n## Monorepo Navigation\n\n`;
    output += `This is a **${context.monorepo.tool}** monorepo. Key packages:\n\n`;
    for (const pkg of context.monorepo.packages.slice(0, 10)) {
      output += `- \`${pkg.name}\` — \`${pkg.path}\`\n`;
    }
    output += "\n";
  }

  output += `## Technology Stack

| Category | Technologies |
|----------|-------------|
| Frameworks | ${context.techStack.frameworks.join(", ") || (isCLI ? "N/A (CLI tool)" : "Not detected")} |
| Languages | ${context.techStack.languages.join(", ") || "Not detected"} |
| Build Tools | ${context.techStack.buildTools.join(", ") || (isCLI ? "N/A (CLI tool)" : "Not detected")} |
${testFrameworks.length > 0 ? `| Test Frameworks | ${testFrameworks.join(", ")} |\n` : ""}
## Largest Modules

These are the primary modules by file count — good starting points for understanding the system:

| Module | Files | Type |
|--------|-------|------|
${context.topModules.slice(0, 10).map(m => `| \`${m.key}\` | ${m.fileCount} | ${formatModuleType(m.type)} |`).join("\n")}
`;

  // Key routes to explore
  if (pages.length > 0 || apis.length > 0) {
    output += `\n## Key Routes\n\n`;
    if (pages.length > 0) {
      output += `**Pages to explore:**\n\n`;
      for (const p of pages.slice(0, 5)) {
        output += `- \`${p.path}\` — ${p.file}\n`;
      }
      output += "\n";
    }
    if (apis.length > 0) {
      output += `**API endpoints:**\n\n`;
      for (const a of apis.slice(0, 5)) {
        const methods = a.methods ? ` [${a.methods.join(", ")}]` : "";
        output += `- \`${a.path}\`${methods} — ${a.file}\n`;
      }
      output += "\n";
    }
  }

  // Data flows overview (filter out test flows)
  const onboardingFlows = (flows || []).filter(f => !f.name?.toLowerCase().includes('test'));
  if (onboardingFlows.length > 0) {
    output += `## How Data Flows\n\n`;
    output += `Understanding these flows will help you see how the system works end-to-end:\n\n`;
    for (const flow of onboardingFlows) {
      output += `- **${flow.name}** — ${flow.description}\n`;
    }
    output += "\n";
  }

  // Dependency orientation
  if (depGraph?.stats?.hubs && depGraph.stats.hubs.length > 0) {
    output += `## Key Integration Points\n\n`;
    output += `These modules are the most widely imported — changes to them may have broad impact:\n\n`;
    for (const hub of depGraph.stats.hubs.slice(0, 5)) {
      output += `- \`${hub.key}\` — imported by ${hub.importedBy} files\n`;
    }
    output += "\n";
  }

  output += `## Getting Started

1. Clone the repository and install dependencies
2. Review the top-level directories above to understand the project layout
3. Start with the largest modules listed above — they contain the core functionality
4. Check for a \`README.md\` or \`CONTRIBUTING.md\` file for project-specific setup instructions`;

  // Test framework quickstart
  if (testFrameworks.length > 0) {
    output += `\n5. Run tests with your ${testFrameworks[0]} setup to verify everything works`;
  }

  output += `\n\n---

*This onboarding guide is generated deterministically. Enable AI enhancement (\`REPOLENS_AI_ENABLED=true\`) for a narrative-style guide with tips and common pitfalls.*`;

  return output;
}

// Helper: group top modules by their inferred type
function groupModulesByType(topModules) {
  const groups = {};
  for (const m of topModules) {
    const type = m.type || "other";
    if (!groups[type]) groups[type] = [];
    groups[type].push(m);
  }
  return groups;
}

// Helper: human-readable module type label
function formatModuleType(type) {
  const labels = {
    api: "API Layer",
    ui: "UI Components",
    library: "Shared Libraries",
    hooks: "React Hooks",
    state: "State Management",
    route: "Route/Page Modules",
    app: "Application Core",
    other: "Other Modules",
  };
  return labels[type] || type;
}

// Helper: derive flows from dependency graph hub chains
function inferFlowsFromDepGraph(depGraph) {
  const flows = [];
  if (!depGraph?.nodes || depGraph.nodes.length === 0) return flows;

  // Find hub nodes – modules imported by many others
  const hubThreshold = Math.max(3, Math.floor(depGraph.nodes.length * 0.05));
  const hubs = depGraph.nodes
    .filter(n => n.importedBy.length >= hubThreshold)
    .sort((a, b) => b.importedBy.length - a.importedBy.length)
    .slice(0, 3);

  for (const hub of hubs) {
    const testPattern = /(?:^|\/)(?:tests?|__tests?__|spec|__spec__)\/|\.(test|spec)\.[jt]sx?$/i;
    const importers = hub.importedBy.filter(i => !testPattern.test(i)).slice(0, 5);
    const downstream = hub.imports.slice(0, 3);
    const shortName = hub.key.split("/").pop();

    flows.push({
      name: `${shortName} Integration Flow`,
      description: `\`${hub.key}\` is a central module imported by ${hub.importedBy.length} files, acting as an integration point for data and logic`,
      steps: [
        ...importers.map(i => `\`${i.split("/").pop()}\` imports \`${shortName}\``),
        ...(downstream.length > 0 ? [`\`${shortName}\` depends on ${downstream.map(d => `\`${d.split("/").pop()}\``).join(", ")}`] : []),
      ],
      modules: [hub.key, ...importers.slice(0, 3)],
      critical: hub.importedBy.length >= hubThreshold * 2,
    });
  }

  return flows;
}

function describeRoot(root) {
  const lower = root.toLowerCase().replace(/\/$/, "");
  // Check the last segment for nested paths like src/core, src/analyzers
  const lastSeg = lower.split("/").pop();
  if (/^src$|^lib$/.test(lower)) return "Application source code";
  if (/^test|^__test|^spec/.test(lastSeg)) return "Test suites";
  if (/^doc/.test(lastSeg)) return "Documentation";
  if (/^bin$|^scripts?$/.test(lastSeg)) return "CLI entry points and scripts";
  if (/^config/.test(lastSeg)) return "Configuration files";
  if (/^public$|^static$|^assets$/.test(lastSeg)) return "Static assets";
  if (/^dist$|^build$|^out$/.test(lastSeg)) return "Build output";
  if (/^\.github$/.test(lastSeg)) return "GitHub Actions and workflows";
  if (/^api$|^endpoint/.test(lastSeg)) return "API definitions";
  if (/^components?$|^ui$/.test(lastSeg)) return "Shared UI components";
  if (/^pages?$|^views?$|^screens?$/.test(lastSeg)) return "Application pages/views";
  if (/^utils?$|^helpers?$/.test(lastSeg)) return "Utility functions";
  if (/^services?$/.test(lastSeg)) return "Service layer";
  if (/^hooks?$/.test(lastSeg)) return "Custom hooks";
  if (/^core$|^kernel$|^engine$/.test(lastSeg)) return "Core logic and foundations";
  if (/^analyz/.test(lastSeg)) return "Code analysis and detection";
  if (/^render/.test(lastSeg)) return "Rendering and output formatting";
  if (/^publish/.test(lastSeg)) return "Publishing and distribution";
  if (/^deliver/.test(lastSeg)) return "Content delivery";
  if (/^integrat/.test(lastSeg)) return "Third-party integrations";
  if (/^plugin/.test(lastSeg)) return "Plugin and extension system";
  if (/^ai$|^ml$|^llm$/.test(lastSeg)) return "AI/ML features and providers";
  if (/^middleware/.test(lastSeg)) return "Middleware pipeline";
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
