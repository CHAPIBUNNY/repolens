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
  AI_SCHEMAS,
  renderStructuredToMarkdown,
} from "./prompts.js";
import { identifyFlowDependencies } from "../analyzers/flow-inference.js";
import { info, warn } from "../utils/logger.js";

// Strip conversational patterns that LLMs sometimes inject into documentation
const CONVERSATIONAL_PATTERNS = [
  /^(?:[-*]\s*)?if you (?:want|need|would like|prefer)[^.\n]*[.\n]/gmi,
  /^(?:[-*]\s*)?(?:shall|should) I [^.\n]*[.\n]/gmi,
  /^(?:[-*]\s*)?(?:let me know|feel free)[^.\n]*[.\n]/gmi,
  /^(?:[-*]\s*)?I can (?:also |additionally )?(?:produce|create|generate|help|provide|suggest|recommend)[^.\n]*[.\n]/gmi,
  /^(?:[-*]\s*)?(?:would you like|do you want)[^.\n]*[.\n]/gmi,
  /^(?:[-*]\s*)?(?:here is|here's) (?:a |the )?(?:summary|overview|breakdown)[^.\n]*:\s*$/gmi,
];

function sanitizeAIOutput(text) {
  if (!text || typeof text !== "string") return text;
  let cleaned = text;
  for (const pattern of CONVERSATIONAL_PATTERNS) {
    cleaned = cleaned.replace(pattern, "");
  }
  // Collapse multiple blank lines left by removals
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n").trim();
  return cleaned;
}

/**
 * Try structured JSON mode first, fall back to plain-text AI, then deterministic.
 */
async function generateWithStructuredFallback(key, promptText, maxTokens, fallbackFn, config) {
  if (!isAIEnabled(config)) return fallbackFn();

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
      config,
    });

    if (result.success && result.parsed) {
      const md = renderStructuredToMarkdown(key, result.parsed);
      if (md) return sanitizeAIOutput(md);
    }
    // If structured mode failed, fall through to plain-text
    warn(`Structured AI failed for ${key}: ${result.error || "invalid/empty response"}`);
  }

  // Plain-text AI fallback
  info(`Generating ${key} with AI...`);
  const result = await generateText({
    system: SYSTEM_PROMPT,
    user: promptText,
    maxTokens,
    config,
  });

  if (!result.success) {
    warn(`AI generation failed: ${result.error || "unknown error"}`);
    return fallbackFn();
  }

  // Guard against empty AI responses — fall back to deterministic
  const text = sanitizeAIOutput(result.text);
  if (!text || text.trim().length === 0) {
    warn("AI returned empty response, using fallback");
    return fallbackFn();
  }

  return text;
}

export async function generateExecutiveSummary(context, enrichment = {}, config) {
  return generateWithStructuredFallback(
    "executive_summary",
    createExecutiveSummaryPrompt(context),
    3000,
    () => getFallbackExecutiveSummary(context, enrichment),
    config,
  );
}

export async function generateSystemOverview(context, enrichment = {}, config) {
  return generateWithStructuredFallback(
    "system_overview",
    createSystemOverviewPrompt(context),
    2500,
    () => getFallbackSystemOverview(context, enrichment),
    config,
  );
}

export async function generateBusinessDomains(context, enrichment = {}, config) {
  return generateWithStructuredFallback(
    "business_domains",
    createBusinessDomainsPrompt(context),
    3500,
    () => getFallbackBusinessDomains(context, enrichment),
    config,
  );
}

export async function generateArchitectureOverview(context, enrichment = {}, config) {
  return generateWithStructuredFallback(
    "architecture_overview",
    createArchitectureOverviewPrompt(context),
    3500,
    () => getFallbackArchitectureOverview(context, enrichment),
    config,
  );
}

export async function generateDataFlows(flows, context, enrichment = {}, config) {
  return generateWithStructuredFallback(
    "data_flows",
    createDataFlowsPrompt(flows, context),
    3500,
    () => getFallbackDataFlows(flows, context, enrichment),
    config,
  );
}

export async function generateDeveloperOnboarding(context, enrichment = {}, config) {
  return generateWithStructuredFallback(
    "developer_onboarding",
    createDeveloperOnboardingPrompt(context),
    4000,
    () => getFallbackDeveloperOnboarding(context, enrichment),
    config,
  );
}

// Fallback generators (deterministic, no AI)

function getFallbackExecutiveSummary(context, enrichment = {}) {
  const { depGraph, flows } = enrichment;
  const frameworkList = context.techStack.frameworks.join(", ") || "general-purpose";
  const languageList = context.techStack.languages.join(", ") || "multiple languages";
  const testFrameworks = context.techStack.testFrameworks || [];
  const isCLI = (context.patterns || []).some(p => p.toLowerCase().includes("cli"));
  const projectName = context.project.name || "This system";

  // Calculate maturity indicators
  const hasTests = testFrameworks.length > 0;
  const hasBuildTools = context.techStack.buildTools.length > 0;
  const hasCleanDeps = depGraph?.stats?.cycles === 0;
  const maturityScore = [hasTests, hasBuildTools, hasCleanDeps].filter(Boolean).length;
  const maturityLabel = maturityScore >= 3 ? "Production-grade" : maturityScore >= 2 ? "Well-structured" : "Early-stage";

  // Determine project type for better descriptions
  const projectType = isCLI ? "command-line tool" : 
    (context.project.apiRoutesDetected > 0 && context.project.pagesDetected > 0) ? "full-stack application" :
    context.project.apiRoutesDetected > 0 ? "API service" :
    context.project.pagesDetected > 0 ? "web application" : "software system";

  let output = `# Executive Summary

## At a Glance

| Aspect | Summary |
|--------|---------|
| **What** | ${projectName} is a ${maturityLabel.toLowerCase()} ${projectType} |
| **Built With** | ${frameworkList} + ${languageList} |
| **Scale** | ${context.project.modulesDetected} modules across ${context.project.filesScanned} files |
| **Maturity** | ${maturityLabel} (${maturityScore}/3 indicators) |

---

## What This System Does

**${projectName}** is a ${frameworkList} ${projectType} built with ${languageList}. `;

  if (isCLI) {
    output += `It operates as a **command-line interface**, enabling users to interact with the system through terminal commands. This architecture is optimized for automation, scripting, and integration into CI/CD pipelines.`;
  } else if (context.project.apiRoutesDetected > 0 && context.project.pagesDetected > 0) {
    output += `It provides both a **user-facing interface** (${context.project.pagesDetected} pages) and a **programmatic API** (${context.project.apiRoutesDetected} endpoints), serving as a complete solution for end users and system integrations alike.`;
  } else if (context.project.apiRoutesDetected > 0) {
    output += `It exposes **${context.project.apiRoutesDetected} API endpoint${context.project.apiRoutesDetected === 1 ? "" : "s"}**, designed for programmatic access by client applications, mobile apps, or external services.`;
  } else if (context.project.pagesDetected > 0) {
    output += `It delivers **${context.project.pagesDetected} application page${context.project.pagesDetected === 1 ? "" : "s"}** to end users through a web interface.`;
  } else {
    output += `The codebase contains **${context.project.modulesDetected} modules** organized into ${context.domains.length} functional domain${context.domains.length === 1 ? "" : "s"}.`;
  }

  output += `\n\n## Business Capabilities

The system is organized around **${context.domains.length} functional domains**, each representing a distinct business capability:\n\n`;

  // Premium domain table with better descriptions
  const topDomains = context.domains.slice(0, 6);
  output += `| Domain | Capability | Scale |\n`;
  output += `|--------|------------|-------|\n`;
  for (const d of topDomains) {
    const desc = d.description || inferDomainCapability(d.name);
    output += `| **${d.name}** | ${desc} | ${d.moduleCount} modules, ${d.fileCount} files |\n`;
  }
  if (context.domains.length > 6) {
    output += `| *+${context.domains.length - 6} more* | Additional functional areas | — |\n`;
  }

  output += `\n## Technical Foundation\n\n`;
  output += `| Layer | Technologies | Purpose |\n`;
  output += `|-------|--------------|----------|\n`;
  if (context.techStack.frameworks.length > 0) {
    output += `| **Application** | ${context.techStack.frameworks.join(", ")} | Core runtime framework |\n`;
  }
  output += `| **Language** | ${context.techStack.languages.join(", ") || "Not detected"} | Primary development language |\n`;
  if (context.techStack.buildTools.length > 0) {
    output += `| **Build** | ${context.techStack.buildTools.join(", ")} | Compilation and bundling |\n`;
  }
  if (testFrameworks.length > 0) {
    output += `| **Testing** | ${testFrameworks.join(", ")} | Quality assurance |\n`;
  }

  // Module composition breakdown
  const typeGroups = groupModulesByType(context.topModules);
  if (Object.keys(typeGroups).length > 1) {
    output += `\n## Module Composition\n\n`;
    output += `The codebase follows a **layered architecture** with clear separation of concerns:\n\n`;
    output += `| Layer | Count | Key Modules | Responsibility |\n`;
    output += `|-------|-------|-------------|----------------|\n`;
    for (const [type, mods] of Object.entries(typeGroups)) {
      const examples = mods.slice(0, 2).map(m => `\`${m.key.split("/").pop()}\``).join(", ");
      const responsibility = getLayerResponsibility(type);
      output += `| **${formatModuleType(type)}** | ${mods.length} | ${examples} | ${responsibility} |\n`;
    }
  }

  // Monorepo structure
  if (context.monorepo) {
    output += `\n## Monorepo Structure\n\n`;
    output += `This is a **${context.monorepo.tool}** monorepo containing **${context.monorepo.packageCount} packages**. This structure enables:\n\n`;
    output += `- Independent versioning and deployment of packages\n`;
    output += `- Shared code reuse across internal projects\n`;
    output += `- Coordinated development with clear ownership boundaries\n\n`;
    output += `**Key packages:**\n\n`;
    for (const p of context.monorepo.packages.slice(0, 6)) {
      output += `- \`${p.name}\` — ${p.path}\n`;
    }
  }

  // Health assessment section
  output += `\n## Codebase Health\n\n`;
  
  if (depGraph?.stats) {
    const stats = depGraph.stats;
    const healthScore = calculateHealthScore(stats, context);
    const healthEmoji = healthScore >= 80 ? "🟢" : healthScore >= 60 ? "🟡" : "🔴";
    
    output += `**Overall Health: ${healthEmoji} ${healthScore}/100**\n\n`;
    output += `| Metric | Value | Status |\n`;
    output += `|--------|-------|--------|\n`;
    output += `| Internal imports | ${stats.totalEdges} edges | ${stats.totalEdges > 0 ? "✅ Connected" : "⚠️ Isolated"} |\n`;
    output += `| External Packages | ${stats.externalDeps} | ${stats.externalDeps < 50 ? "✅ Manageable" : stats.externalDeps < 100 ? "⚠️ Consider audit" : "🔴 High dependency count"} |\n`;
    output += `| Circular Dependencies | ${stats.cycles === 0 ? "cycle-free" : stats.cycles} | ${stats.cycles === 0 ? "✅ None" : `🔴 ${stats.cycles} detected`} |\n`;
    output += `| Orphan Files | ${stats.orphanFiles} | ${stats.orphanFiles === 0 ? "✅ All connected" : `⚠️ ${stats.orphanFiles} unused`} |\n`;

    // Key insights
    output += `\n### Key Insights\n\n`;
    if (stats.cycles === 0) {
      output += `- ✅ **Clean module boundaries** — No circular dependencies detected, enabling safe refactoring and testing.\n`;
    } else {
      output += `- 🔴 **Architectural concern** — ${stats.cycles} circular dependenc${stats.cycles === 1 ? "y" : "ies"} detected. These create tight coupling and make testing difficult.\n`;
    }
    if (stats.hubs && stats.hubs.length > 0) {
      const topHub = stats.hubs[0];
      if (topHub.importedBy > stats.totalFiles * 0.3) {
        output += `- ⚠️ **Coupling hotspot** — \`${topHub.key}\` is imported by ${topHub.importedBy} files (${Math.round(topHub.importedBy / stats.totalFiles * 100)}% of codebase). Consider splitting.\n`;
      } else {
        output += `- ✅ **Healthy coupling** — Most-imported module (\`${topHub.key}\`) serves ${topHub.importedBy} files without excessive centralization.\n`;
      }
    }
    if (stats.orphanFiles > stats.totalFiles * 0.1) {
      output += `- ⚠️ **Potential dead code** — ${stats.orphanFiles} files (${Math.round(stats.orphanFiles / stats.totalFiles * 100)}%) are not imported anywhere.\n`;
    }
  }

  // Data flows summary
  const summaryFlows = (flows || []).filter(f => !f.name?.toLowerCase().includes('test'));
  if (summaryFlows.length > 0) {
    output += `\n## Key Data Flows\n\n`;
    output += `The system processes information through **${summaryFlows.length} identified flow${summaryFlows.length === 1 ? "" : "s"}**:\n\n`;
    for (const flow of summaryFlows.slice(0, 5)) {
      const criticality = flow.critical ? " (critical)" : "";
      output += `- **${flow.name}**${criticality} — ${flow.description}\n`;
    }
  }

  // Strategic observations
  output += `\n## Strategic Observations\n\n`;
  
  const observations = [];
  if (context.patterns.length > 0) {
    observations.push(`The codebase follows **${context.patterns.join(", ")}** architectural patterns, providing a familiar structure for developers.`);
  }
  if (context.domains.length >= 5) {
    observations.push(`With ${context.domains.length} distinct domains, the system has clear separation of concerns suitable for team-based development.`);
  }
  if (hasTests && hasCleanDeps) {
    observations.push(`Strong engineering practices are in place: automated testing and clean dependency boundaries support ongoing development.`);
  }
  if (isCLI) {
    observations.push(`As a CLI tool, this system is automation-friendly and can integrate into existing workflows and pipelines.`);
  }
  
  for (const obs of observations) {
    output += `- ${obs}\n`;
  }

  output += `\n---

*This executive summary was generated from comprehensive repository analysis including dependency graphs, data flow detection, and architectural pattern recognition. Enable AI enhancement with \`GITHUB_TOKEN\` for strategic recommendations, risk assessments, and plain-language explanations tailored for non-technical stakeholders.*`;

  return output;
}

function getFallbackSystemOverview(context, enrichment = {}) {
  const { depGraph } = enrichment;
  const testFrameworks = context.techStack.testFrameworks || [];
  const isCLI = (context.patterns || []).some(p => p.toLowerCase().includes("cli"));
  const projectName = context.project.name || "This system";

  // Calculate scale classification
  const scaleLevel = context.project.modulesDetected > 100 ? "enterprise" :
                     context.project.modulesDetected > 50 ? "large" :
                     context.project.modulesDetected > 20 ? "medium" : "small";
  const scaleDesc = {
    enterprise: "an enterprise-scale codebase with significant complexity",
    large: "a large codebase with multiple interconnected subsystems",
    medium: "a medium-sized codebase with clear structure",
    small: "a focused codebase with a clear purpose"
  }[scaleLevel];

  let output = `# System Overview

## The Big Picture

**${projectName}** is ${scaleDesc}, containing **${context.project.modulesDetected} modules** spread across **${formatFileScale(context.project.filesScanned).split(' (')[0]}**.

| Dimension | Details |
|-----------|---------|
| **Total Files** | ${context.project.filesScanned} |
| **Module Count** | ${context.project.modulesDetected} |
| **Functional Domains** | ${context.domains.length} |`;

  if (context.project.pagesDetected > 0) {
    output += `\n| **User-Facing Pages** | ${context.project.pagesDetected} |`;
  }
  if (context.project.apiRoutesDetected > 0) {
    output += `\n| **API Endpoints** | ${context.project.apiRoutesDetected} |`;
  }
  if (isCLI) {
    output += `\n| **Interface Type** | Command-Line Tool |`;
  }

  output += `

---

## Technology Stack

The system is built on a modern technology foundation:\n\n`;

  output += `| Layer | Technologies | Purpose |\n`;
  output += `|-------|-------------|----------|\n`;
  
  if (context.techStack.frameworks.length > 0) {
    const frameworkPurpose = inferFrameworkPurpose(context.techStack.frameworks);
    output += `| **Runtime** | ${context.techStack.frameworks.join(", ")} | ${frameworkPurpose} |\n`;
  }
  
  output += `| **Language** | ${context.techStack.languages.join(", ") || "Not detected"} | Primary development language |\n`;
  
  if (context.techStack.buildTools.length > 0) {
    output += `| **Build** | ${context.techStack.buildTools.join(", ")} | Compilation and asset processing |\n`;
  }
  
  if (testFrameworks.length > 0) {
    output += `| **Quality** | ${testFrameworks.join(", ")} | Automated testing |\n`;
  }

  // Architecture patterns
  output += `\n## Architecture Patterns\n\n`;
  if (context.patterns.length > 0) {
    output += `The codebase follows **${context.patterns.length} identified architectural pattern${context.patterns.length === 1 ? '' : 's'}**:\n\n`;
    for (const pattern of context.patterns) {
      const patternExplanation = explainPattern(pattern);
      output += `- **${pattern}** — ${patternExplanation}\n`;
    }
  } else {
    output += `No specific architectural patterns were detected. The project follows a pragmatic, directory-based organization typical of ${scaleLevel}-scale projects.\n`;
  }

  // Module architecture breakdown
  const typeGroups = groupModulesByType(context.topModules);
  if (Object.keys(typeGroups).length > 1) {
    output += `\n## Module Architecture\n\n`;
    output += `The system is organized into **${Object.keys(typeGroups).length} architectural layers**:\n\n`;
    output += `| Layer | Modules | Key Examples | Responsibility |\n`;
    output += `|-------|---------|--------------|----------------|\n`;
    for (const [type, mods] of Object.entries(typeGroups)) {
      const examples = mods.slice(0, 2).map(m => `\`${m.key.split("/").pop()}\``).join(", ");
      const responsibility = getLayerResponsibility(type);
      output += `| **${formatModuleType(type)}** | ${mods.length} | ${examples} | ${responsibility} |\n`;
    }
    
    output += `\n### Layer Details\n\n`;
    for (const [type, mods] of Object.entries(typeGroups)) {
      output += `**${formatModuleType(type)}** — ${mods.length} module${mods.length === 1 ? '' : 's'}\n\n`;
      for (const m of mods.slice(0, 4)) {
        const desc = describeOnboardingModule(m.key);
        output += `- \`${m.key}\` — ${m.fileCount} files — ${desc}\n`;
      }
      if (mods.length > 4) {
        output += `- *+${mods.length - 4} more modules*\n`;
      }
      output += `\n`;
    }
  }

  // Dominant domains with rich descriptions
  output += `## Functional Domains\n\n`;
  output += `The following domains represent the largest functional areas by file count:\n\n`;
  output += `| Rank | Domain | Scale | Business Capability |\n`;
  output += `|------|--------|-------|---------------------|\n`;
  for (const [i, d] of context.domains.slice(0, 6).entries()) {
    const capability = d.description || inferDomainCapability(d.name);
    output += `| ${i + 1} | **${d.name}** | ${d.fileCount} files | ${capability} |\n`;
  }
  if (context.domains.length > 6) {
    output += `| — | *+${context.domains.length - 6} more* | — | Additional domains |\n`;
  }

  // Route summary with better organization
  const routes = context.routes || {};
  const pages = routes.pages || [];
  const apis = routes.apis || [];
  
  if (pages.length > 0 || apis.length > 0) {
    output += `\n## Route Summary\n\n`;
    const routeSummary = describeRoutePattern(context.routes);
    if (routeSummary) {
      output += `The system surfaces ${routeSummary}.\n\n`;
    }
    
    if (pages.length > 0) {
      output += `### User-Facing Pages (${pages.length})\n\n`;
      output += `| Path | Description |\n`;
      output += `|------|-------------|\n`;
      for (const p of pages.slice(0, 8)) {
        const pageName = p.path.split('/').pop() || 'root';
        const desc = inferPageDescription(pageName);
        output += `| \`${p.path}\` | ${desc} |\n`;
      }
      if (pages.length > 8) {
        output += `| *+${pages.length - 8} more* | Additional pages |\n`;
      }
      output += "\n";
    }
    
    if (apis.length > 0) {
      output += `### API Endpoints (${apis.length})\n\n`;
      output += `| Endpoint | Methods | Purpose |\n`;
      output += `|----------|---------|----------|\n`;
      for (const a of apis.slice(0, 8)) {
        const methods = a.methods?.join(", ") || "—";
        const purpose = inferAPIEndpointPurpose(a.path);
        output += `| \`${a.path}\` | ${methods} | ${purpose} |\n`;
      }
      if (apis.length > 8) {
        output += `| *+${apis.length - 8} more* | — | Additional endpoints |\n`;
      }
      output += "\n";
    }
  }

  // Dependency graph with rich analysis
  if (depGraph?.stats) {
    const stats = depGraph.stats;
    const healthScore = calculateHealthScore(stats, context);
    const healthEmoji = healthScore >= 80 ? "🟢" : healthScore >= 60 ? "🟡" : "🔴";
    
    output += `## Dependency Graph\n\n`;
    output += `**Codebase Health: ${healthEmoji} ${healthScore}/100**\n\n`;
    output += `| Metric | Value | Assessment |\n`;
    output += `|--------|-------|------------|\n`;
    output += `| Internal Imports | ${stats.totalEdges} | ${stats.totalEdges > 0 ? "Modules are connected" : "No internal imports"} |\n`;
    output += `| External Packages | ${stats.externalDeps} | ${stats.externalDeps < 50 ? "Lean dependencies" : stats.externalDeps < 100 ? "Moderate dependencies" : "Many dependencies"} |\n`;
    output += `| Circular Dependencies | ${stats.cycles} | ${stats.cycles === 0 ? "✅ Clean" : "⚠️ Needs attention"} |\n`;
    output += `| Orphan Files | ${stats.orphanFiles} | ${stats.orphanFiles === 0 ? "✅ All connected" : `⚠️ ${stats.orphanFiles} unused`} |\n`;
    
    if (stats.hubs && stats.hubs.length > 0) {
      output += `\n**Hub modules** (most imported):\n\n`;
      for (const hub of stats.hubs.slice(0, 5)) {
        output += `- \`${hub.key}\` — imported by ${hub.importedBy} files\n`;
      }
      output += "\n";
    }
  }

  // Monorepo structure
  if (context.monorepo) {
    output += `## Monorepo Structure\n\n`;
    output += `This is a **${context.monorepo.tool}** monorepo containing **${context.monorepo.packageCount} packages**:\n\n`;
    output += `| Package | Location | Description |\n`;
    output += `|---------|----------|-------------|\n`;
    for (const pkg of context.monorepo.packages.slice(0, 8)) {
      const pkgDesc = inferPackageDescription(pkg.name);
      output += `| \`${pkg.name}\` | \`${pkg.path}\` | ${pkgDesc} |\n`;
    }
    if (context.monorepo.packages.length > 8) {
      output += `| *+${context.monorepo.packages.length - 8} more* | — | Additional packages |\n`;
    }
    output += "\n";
  }

  output += `---

*This system overview was generated from comprehensive repository analysis. Enable AI enhancement with \`GITHUB_TOKEN\` for narrative context, architectural rationale, technology trade-off analysis, and scalability recommendations.*`;

  return output;
}

function getFallbackBusinessDomains(context, enrichment = {}) {
  const { depGraph } = enrichment;
  const routes = context.routes || {};
  const pages = routes.pages || [];
  const apis = routes.apis || [];
  const projectName = context.project.name || "The system";

  let output = `# Business Domains

## Overview

${projectName} is organized into **${context.domains.length} functional domain${context.domains.length === 1 ? '' : 's'}**, each representing a distinct area of business capability. This document maps the technical structure to business-oriented functional areas.

**Quick Reference:**

| Domain | Modules | Files | Primary Capability |
|--------|---------|-------|-------------------|
${context.domains.map(d => `| ${d.name} | ${d.moduleCount} | ${d.fileCount} | ${inferDomainCapability(d.name).split('.')[0]} |`).join("\n")}

---

`;

  // Detailed domain breakdowns
  for (const [index, domain] of context.domains.entries()) {
    const capability = domain.description || inferDomainCapability(domain.name);
    const sizeLabel = domain.fileCount > 50 ? "major" : domain.fileCount > 20 ? "significant" : "focused";
    
    output += `## ${index + 1}. ${domain.name}\n\n`;
    output += `### Business Capability\n\n`;
    output += `${capability}\n\n`;
    output += `This is a **${sizeLabel} domain** with ${domain.moduleCount} module${domain.moduleCount === 1 ? '' : 's'} and ${domain.fileCount} source file${domain.fileCount === 1 ? '' : 's'}.\n\n`;
    
    // Key modules with descriptions
    if (domain.topModules?.length > 0) {
      output += `### Key Modules\n\n`;
      output += `| Module | Purpose |\n`;
      output += `|--------|----------|\n`;
      for (const mod of domain.topModules.slice(0, 5)) {
        const modPurpose = describeOnboardingModule(mod);
        output += `| \`${mod}\` | ${modPurpose} |\n`;
      }
      if (domain.topModules.length > 5) {
        output += `| *+${domain.topModules.length - 5} more* | Additional modules |\n`;
      }
      output += "\n";
    }

    // Match routes to this domain
    const domainModules = domain.topModules || [];
    const domainPages = pages.filter(p =>
      domainModules.some(m => p.path.toLowerCase().includes(m.toLowerCase().split("/").pop()))
    );
    const domainApis = apis.filter(a =>
      domainModules.some(m => a.path.toLowerCase().includes(m.toLowerCase().split("/").pop()))
    );

    if (domainPages.length > 0 || domainApis.length > 0) {
      output += `### User-Facing Interfaces\n\n`;
      if (domainPages.length > 0) {
        output += `**Pages:**\n`;
        for (const p of domainPages.slice(0, 5)) {
          const pageName = p.path.split('/').pop() || 'root';
          output += `- 📄 \`${p.path}\` — ${inferPageDescription(pageName)}\n`;
        }
        output += "\n";
      }
      if (domainApis.length > 0) {
        output += `**API Endpoints:**\n`;
        for (const a of domainApis.slice(0, 5)) {
          const methods = a.methods ? `[${a.methods.join(", ")}]` : "";
          const purpose = inferAPIEndpointPurpose(a.path);
          output += `- 🔌 \`${a.path}\` ${methods} — ${purpose}\n`;
        }
        output += "\n";
      }
    }
    
    // Business impact assessment
    const impactLevel = domain.fileCount > 50 ? "high" : domain.fileCount > 20 ? "medium" : "low";
    output += `### Business Impact\n\n`;
    output += `- **Change Frequency Impact:** ${impactLevel.charAt(0).toUpperCase() + impactLevel.slice(1)} — Changes here affect ${domain.fileCount} file${domain.fileCount === 1 ? '' : 's'}\n`;
    output += `- **Domain Complexity:** ${domain.moduleCount > 5 ? "Complex (multiple modules)" : domain.moduleCount > 2 ? "Moderate" : "Simple"}\n`;
    if (impactLevel === "high") {
      output += `- **Recommendation:** Ensure comprehensive testing before modifying this domain\n`;
    }
    output += "\n---\n\n";
  }

  // Cross-domain dependency insights with richer analysis
  if (depGraph?.stats?.hubs && depGraph.stats.hubs.length > 0) {
    output += `## Cross-Domain Dependencies\n\n`;
    output += `The following modules serve as **shared infrastructure** across multiple domains:\n\n`;
    output += `| Module | Consumers | Role |\n`;
    output += `|--------|-----------|------|\n`;
    for (const hub of depGraph.stats.hubs.slice(0, 6)) {
      const consumers = hub.importedBy;
      const role = describeOnboardingModule(hub.key);
      output += `| \`${hub.key}\` | ${consumers} modules | ${role} |\n`;
    }
    output += `\n`;
    
    output += `### Cross-Domain Integration Points\n\n`;
    output += `These modules facilitate communication and data sharing between domains:\n\n`;
    for (const hub of depGraph.stats.hubs.slice(0, 3)) {
      output += `- **\`${hub.key}\`** serves as a central integration point, imported by ${hub.importedBy} different modules. Changes to this module have wide-ranging impact and should be carefully coordinated.\n`;
    }
    output += "\n";
  }
  
  // Domain health assessment
  output += `## Domain Health Summary\n\n`;
  const totalFiles = context.domains.reduce((sum, d) => sum + d.fileCount, 0);
  const avgFilesPerDomain = Math.round(totalFiles / context.domains.length);
  const largestDomain = context.domains[0];
  const domainConcentration = largestDomain ? Math.round((largestDomain.fileCount / totalFiles) * 100) : 0;
  
  output += `| Metric | Value | Assessment |\n`;
  output += `|--------|-------|------------|\n`;
  output += `| Total Domains | ${context.domains.length} | ${context.domains.length < 3 ? "Consider finer-grained domain separation" : context.domains.length > 12 ? "Consider consolidating related domains" : "Well-balanced"} |\n`;
  output += `| Avg Files/Domain | ${avgFilesPerDomain} | ${avgFilesPerDomain > 100 ? "Domains may be too large" : "Appropriate size"} |\n`;
  output += `| Largest Domain | ${largestDomain?.name || "—"} (${largestDomain?.fileCount || 0} files) | ${domainConcentration > 50 ? "Consider breaking down" : "Reasonable"} |\n`;
  output += `| Domain Concentration | ${domainConcentration}% in largest | ${domainConcentration > 60 ? "⚠️ High concentration" : "✅ Well distributed"} |\n`;

  output += `\n---\n\n*Domain mapping is based on directory naming conventions and code organization patterns. Enable AI enhancement with \`GITHUB_TOKEN\` for business-language descriptions, stakeholder impact analysis, strategic recommendations, and cross-domain relationship narratives.*`;
  
  return output;
}

function getFallbackArchitectureOverview(context, enrichment = {}) {
  const { depGraph, driftResult } = enrichment;
  const isCLI = (context.patterns || []).some(p => p.toLowerCase().includes("cli"));
  const projectName = context.project.name || "This system";
  const testFrameworks = context.techStack.testFrameworks || [];

  let output = `# Architecture Overview

## Architectural Philosophy

`;

  if (context.patterns.length > 0) {
    output += `**${projectName}** follows a **${context.patterns[0]}** architecture`;
    if (context.patterns.length > 1) {
      output += ` with elements of **${context.patterns.slice(1).join(", ")}**`;
    }
    output += `.\n\n`;
    
    output += `### Pattern Analysis\n\n`;
    for (const pattern of context.patterns) {
      const explanation = explainPattern(pattern);
      const benefits = getBenefitsForPattern(pattern);
      output += `**${pattern}**\n\n`;
      output += `${explanation}\n\n`;
      output += `*Benefits:* ${benefits}\n\n`;
    }
  } else {
    output += `The codebase follows a **pragmatic, directory-based organization** without a specific named architectural pattern. This is a common approach for ${context.project.modulesDetected < 30 ? "smaller" : "organically grown"} projects that prioritize simplicity over formalism.\n\n`;
    output += `### Structural Approach\n\n`;
    output += `- Files are grouped by type or feature\n`;
    output += `- No strict layer enforcement\n`;
    output += `- Flexibility for rapid development\n\n`;
  }

  // System layers with rich descriptions
  output += `## System Layers\n\n`;
  output += `The system is organized into **${context.domains.length} functional layer${context.domains.length === 1 ? '' : 's'}**, each encapsulating a distinct area of responsibility:\n\n`;
  
  output += `| Layer | Responsibility | Scale | Key Insight |\n`;
  output += `|-------|----------------|-------|-------------|\n`;
  for (const d of context.domains.slice(0, 8)) {
    const responsibility = d.description || inferDomainCapability(d.name);
    const insight = getLayerInsight(d.name, d.fileCount, d.moduleCount);
    output += `| **${d.name}** | ${responsibility.split('.')[0]} | ${d.fileCount} files | ${insight} |\n`;
  }
  if (context.domains.length > 8) {
    output += `| *+${context.domains.length - 8} more* | Additional layers | — | — |\n`;
  }
  output += `\n`;

  // Module architecture
  const typeGroups = groupModulesByType(context.topModules);
  if (Object.keys(typeGroups).length > 0) {
    output += `## Module Layers\n\n`;
    output += `Modules are classified into **${Object.keys(typeGroups).length} architectural role${Object.keys(typeGroups).length === 1 ? '' : 's'}**:\n\n`;
    
    for (const [type, mods] of Object.entries(typeGroups)) {
      const role = formatModuleType(type);
      const responsibility = getLayerResponsibility(type);
      output += `### ${role}\n\n`;
      output += `**Role:** ${responsibility}\n\n`;
      output += `| Module | Files | Description |\n`;
      output += `|--------|-------|-------------|\n`;
      for (const m of mods.slice(0, 5)) {
        const desc = describeOnboardingModule(m.key);
        output += `| \`${m.key}\` | ${m.fileCount} | ${desc} |\n`;
      }
      if (mods.length > 5) {
        output += `| *+${mods.length - 5} more* | — | Additional modules |\n`;
      }
      output += "\n";
    }
  }

  // Technology stack with architectural implications
  output += `## Technology Foundation\n\n`;
  output += `| Layer | Technologies | Architectural Implication |\n`;
  output += `|-------|-------------|---------------------------|\n`;
  
  if (context.techStack.frameworks.length > 0) {
    const frameworkImpl = getFrameworkArchitecturalImplication(context.techStack.frameworks);
    output += `| **Application** | ${context.techStack.frameworks.join(", ")} | ${frameworkImpl} |\n`;
  }
  output += `| **Language** | ${context.techStack.languages.join(", ") || "Not detected"} | ${getLanguageImplication(context.techStack.languages)} |\n`;
  if (context.techStack.buildTools.length > 0) {
    output += `| **Build** | ${context.techStack.buildTools.join(", ")} | Modern bundling and optimization |\n`;
  }
  if (testFrameworks.length > 0) {
    output += `| **Quality** | ${testFrameworks.join(", ")} | Enables confident refactoring |\n`;
  }

  // Scale and complexity analysis
  output += `\n## Scale & Complexity Analysis\n\n`;
  const complexityLevel = context.project.modulesDetected > 100 ? "high" :
                          context.project.modulesDetected > 50 ? "medium-high" :
                          context.project.modulesDetected > 20 ? "medium" : "low";
  
  output += `| Dimension | Value | Assessment |\n`;
  output += `|-----------|-------|------------|\n`;
  output += `| **Total Files** | ${context.project.filesScanned} | ${formatFileScale(context.project.filesScanned).split('(')[1]?.replace(')', '') || "—"} |\n`;
  output += `| **Module Count** | ${context.project.modulesDetected} | ${complexityLevel} complexity |\n`;
  output += `| **Domain Spread** | ${context.domains.length} domains | ${context.domains.length > 10 ? "High specialization" : context.domains.length > 5 ? "Good separation" : "Focused scope"} |\n`;
  if (context.project.apiRoutesDetected > 0) {
    output += `| **API Surface** | ${context.project.apiRoutesDetected} endpoints | ${context.project.apiRoutesDetected > 50 ? "Large API" : context.project.apiRoutesDetected > 20 ? "Medium API" : "Compact API"} |\n`;
  }
  if (context.project.pagesDetected > 0) {
    output += `| **UI Surface** | ${context.project.pagesDetected} pages | ${context.project.pagesDetected > 30 ? "Feature-rich UI" : context.project.pagesDetected > 10 ? "Moderate UI" : "Focused UI"} |\n`;
  }
  if (isCLI) {
    output += `| **Interface** | CLI | Terminal-driven interaction |\n`;
  }

  // Dependency health with deep analysis
  if (depGraph?.stats) {
    const stats = depGraph.stats;
    const healthScore = calculateHealthScore(stats, context);
    const healthEmoji = healthScore >= 80 ? "🟢" : healthScore >= 60 ? "🟡" : "🔴";
    
    output += `\n## Dependency Health\n\n`;
    output += `**Architecture Health Score: ${healthEmoji} ${healthScore}/100**\n\n`;
    
    output += `| Metric | Value | Status | Recommendation |\n`;
    output += `|--------|-------|--------|----------------|\n`;
    output += `| Import Edges | ${stats.totalEdges} | ${stats.totalEdges > 0 ? "✅" : "⚠️"} | ${stats.totalEdges > 0 ? "Healthy module connectivity" : "Consider connecting modules"} |\n`;
    output += `| External Packages | ${stats.externalDeps} | ${stats.externalDeps < 50 ? "✅" : stats.externalDeps < 100 ? "⚠️" : "🔴"} | ${stats.externalDeps >= 100 ? "Audit for unused dependencies" : stats.externalDeps >= 50 ? "Review dependency necessity" : "Lean dependency set"} |\n`;
    output += `| Circular Deps | ${stats.cycles} | ${stats.cycles === 0 ? "✅" : "🔴"} | ${stats.cycles === 0 ? "Clean module boundaries" : "Refactor to break cycles"} |\n`;
    output += `| Orphan Files | ${stats.orphanFiles} | ${stats.orphanFiles === 0 ? "✅" : "⚠️"} | ${stats.orphanFiles === 0 ? "All code is connected" : "Review for dead code"} |\n`;

    // Architectural strengths and concerns
    output += `\n### Architectural Strengths\n\n`;
    const strengths = [];
    if (stats.cycles === 0) {
      strengths.push("**Clean module boundaries** — No circular dependencies detected. This enables safe refactoring, isolated testing, and clear ownership boundaries.");
    }
    if (stats.orphanFiles === 0) {
      strengths.push("**Fully connected codebase** — Every file is part of the dependency graph. No dead code or forgotten modules.");
    }
    if (stats.hubs && stats.hubs.length > 0 && stats.hubs[0].importedBy < stats.totalFiles * 0.3) {
      strengths.push("**Balanced coupling** — No single module dominates the import graph. This reduces change risk and enables parallel development.");
    }
    if (testFrameworks.length > 0) {
      strengths.push("**Testing infrastructure** — Automated testing with " + testFrameworks.join(", ") + " supports confident evolution.");
    }
    
    for (const s of strengths) {
      output += `- ${s}\n`;
    }
    if (strengths.length === 0) {
      output += `- *No major architectural strengths identified — consider improving test coverage and reducing circular dependencies.*\n`;
    }

    // Concerns
    const concerns = [];
    if (stats.cycles > 0) {
      concerns.push(`**Circular dependencies detected** — ${stats.cycles} circular dependenc${stats.cycles === 1 ? 'y' : 'ies'} create tight coupling, complicate testing, and hinder refactoring. Priority: High.`);
    }
    if (stats.orphanFiles > stats.totalFiles * 0.2) {
      concerns.push(`**High orphan file ratio** — ${stats.orphanFiles}/${stats.totalFiles} files (${Math.round(stats.orphanFiles / stats.totalFiles * 100)}%) are not imported. Consider removing dead code. Priority: Medium.`);
    }
    if (stats.hubs && stats.hubs.length > 0 && stats.hubs[0].importedBy >= stats.totalFiles * 0.3) {
      concerns.push(`**Central coupling hotspot** — \`${stats.hubs[0].key}\` is imported by ${stats.hubs[0].importedBy} files (${Math.round(stats.hubs[0].importedBy / stats.totalFiles * 100)}%). Consider breaking into smaller modules. Priority: Medium.`);
    }
    if (stats.externalDeps > 100) {
      concerns.push(`**Heavy external dependencies** — ${stats.externalDeps} packages increase security surface and maintenance burden. Audit regularly. Priority: Low.`);
    }
    
    if (concerns.length > 0) {
      output += `\n### Concerns\n\n`;
      for (const c of concerns) {
        output += `- ${c}\n`;
      }
    }

    // Hub modules
    if (stats.hubs && stats.hubs.length > 0) {
      output += `\n**Hub modules** (most imported):\n\n`;
      for (const hub of stats.hubs.slice(0, 5)) {
        output += `- \`${hub.key}\` — imported by ${hub.importedBy} files\n`;
      }
      output += "\n";
    }
  }

  // Architecture drift
  if (driftResult?.drifts && driftResult.drifts.length > 0) {
    output += `## Architecture Drift Analysis\n\n`;
    output += `**${driftResult.drifts.length} drift${driftResult.drifts.length === 1 ? '' : 's'} detected** since the last baseline:\n\n`;
    output += `| Type | Description | Severity |\n`;
    output += `|------|-------------|----------|\n`;
    for (const drift of driftResult.drifts.slice(0, 6)) {
      const severity = drift.severity || "medium";
      const severityEmoji = severity === "high" ? "🔴" : severity === "medium" ? "🟡" : "🟢";
      output += `| ${drift.type} | ${drift.description || drift.message || "Change detected"} | ${severityEmoji} ${severity} |\n`;
    }
    if (driftResult.drifts.length > 6) {
      output += `| *+${driftResult.drifts.length - 6} more* | Additional drifts | — |\n`;
    }
    output += "\n";
  }

  // Monorepo architecture
  if (context.monorepo) {
    output += `## Monorepo Architecture\n\n`;
    output += `This project uses a **${context.monorepo.tool}** monorepo with **${context.monorepo.packageCount} packages**.\n\n`;
    output += `### Package Structure\n\n`;
    output += `| Package | Location | Architectural Role |\n`;
    output += `|---------|----------|--------------------|\n`;
    for (const pkg of context.monorepo.packages.slice(0, 10)) {
      const role = inferPackageDescription(pkg.name);
      output += `| \`${pkg.name}\` | \`${pkg.path}\` | ${role} |\n`;
    }
    if (context.monorepo.packages.length > 10) {
      output += `| *+${context.monorepo.packages.length - 10} more* | — | — |\n`;
    }
    output += "\n";
    
    output += `### Monorepo Benefits\n\n`;
    output += `- **Shared infrastructure** — Common tooling and configurations\n`;
    output += `- **Atomic changes** — Cross-package updates in single commits\n`;
    output += `- **Independent deployment** — Each package can be released separately\n`;
    output += `- **Clear ownership** — Package boundaries define team responsibilities\n\n`;
  }

  output += `---

*This architecture overview was generated from comprehensive dependency graph analysis and pattern detection. Enable AI enhancement with \`GITHUB_TOKEN\` for architectural narratives, design rationale explanations, scalability analysis, and refactoring recommendations.*`;

  return output;
}

function getFallbackDataFlows(flows, context, enrichment = {}) {
  const { depGraph, scanResult } = enrichment;
  const projectName = context.project.name || "The system";

  let output = `# Data Flows

## Understanding Data Movement

Data flows describe how information moves through **${projectName}** — from external inputs through processing layers to storage or presentation. Understanding these flows is essential for debugging, performance optimization, and architectural decisions.

`;

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
    output += `## Flow Detection Results

No data flows were detected in the codebase. This typically indicates one of the following:

1. **Simple request-response pattern** — The system uses straightforward HTTP request/response patterns without complex pipelines
2. **Event-driven architecture** — Data flows through event listeners that are harder to detect statically
3. **External orchestration** — Flow control happens outside this codebase (e.g., in a parent service or message queue)

### Recommendations

To help RepoLens detect flows more accurately, consider:

- Adding descriptive naming conventions (e.g., \`processOrder\`, \`handlePayment\`)
- Using consistent file patterns for flow entry points
- Documenting flows explicitly in code comments

`;
    
    // Even without flows, show import network info
    if (depGraph?.stats) {
      output += `## Import Network Analysis

Even without identified flows, we can understand data movement through the import graph:

| Metric | Value | Insight |
|--------|-------|---------|
| Internal Imports | ${depGraph.stats.totalEdges} | Data can flow along ${depGraph.stats.totalEdges} import edges |
| Total Files | ${depGraph.stats.totalFiles} | ${depGraph.stats.totalFiles} potential processing points |
| Hub Modules | ${depGraph.stats.hubs?.length || 0} | Central integration points |

`;
      if (depGraph.stats.hubs && depGraph.stats.hubs.length > 0) {
        output += `### Likely Integration Points\n\n`;
        output += `These highly-imported modules are probable data aggregation points:\n\n`;
        for (const hub of depGraph.stats.hubs.slice(0, 5)) {
          const shortName = hub.key.split("/").pop();
          const role = describeOnboardingModule(hub.key);
          output += `- **\`${shortName}\`** — ${hub.importedBy} consumers — ${role}\n`;
        }
        output += "\n";
      }
    }
    
    output += `---

*Flow detection is based on naming conventions and import patterns. Enable AI enhancement with \`GITHUB_TOKEN\` for intelligent flow inference from code structure, even when explicit patterns are absent.*`;
    return output;
  }

  // Flow summary table
  output += `## Flow Summary\n\n`;
  output += `**${allFlows.length} data flow${allFlows.length === 1 ? '' : 's'}** identified in the codebase:\n\n`;
  output += `| Flow | Type | Complexity | Critical |\n`;
  output += `|------|------|------------|----------|\n`;
  for (const flow of allFlows) {
    const stepCount = flow.steps?.length || 0;
    const complexity = stepCount > 5 ? "High" : stepCount > 2 ? "Medium" : "Low";
    const critical = flow.critical ? "🔴 Yes" : "—";
    output += `| ${flow.name} | ${flow.type || "Integration"} | ${complexity} (${stepCount} steps) | ${critical} |\n`;
  }
  output += "\n---\n\n";
  
  // Detailed flow documentation
  for (const [index, flow] of allFlows.entries()) {
    const stepCount = flow.steps?.length || 0;
    const criticality = flow.critical ? "🔴 **CRITICAL FLOW**" : "";
    
    output += `## ${index + 1}. ${flow.name} ${criticality}\n\n`;
    output += `### Description\n\n`;
    output += `${flow.description}\n\n`;
    
    // Flow characteristics
    output += `### Characteristics\n\n`;
    output += `| Property | Value |\n`;
    output += `|----------|-------|\n`;
    output += `| Steps | ${stepCount} |\n`;
    output += `| Modules Involved | ${(flow.modules || []).length} |\n`;
    output += `| Criticality | ${flow.critical ? "Critical" : "Standard"} |\n`;
    
    // Step-by-step breakdown
    if (flow.steps && flow.steps.length > 0) {
      output += `\n### Processing Steps\n\n`;
      output += `| Step | Action | Purpose |\n`;
      output += `|------|--------|----------|\n`;
      for (const [i, step] of flow.steps.entries()) {
        const purpose = inferStepPurpose(step);
        output += `| ${i + 1} | ${step} | ${purpose} |\n`;
      }
      output += "\n";
      
      // Flow diagram (text-based)
      output += `### Flow Diagram\n\n`;
      output += "```\n";
      for (const [i, step] of flow.steps.entries()) {
        const shortStep = step.length > 50 ? step.substring(0, 47) + "..." : step;
        if (i === 0) {
          output += `┌─ START ─┐\n`;
          output += `│ ${shortStep.padEnd(50)} │\n`;
        } else if (i === flow.steps.length - 1) {
          output += `│         ↓\n`;
          output += `│ ${shortStep.padEnd(50)} │\n`;
          output += `└─ END ───┘\n`;
        } else {
          output += `│         ↓\n`;
          output += `│ ${shortStep.padEnd(50)} │\n`;
        }
      }
      output += "```\n\n";
    }
    
    // Involved modules
    if (flow.modules && flow.modules.length > 0) {
      output += `### Involved Modules\n\n`;
      output += `| Module | Role |\n`;
      output += `|--------|------|\n`;
      for (const mod of flow.modules.slice(0, 8)) {
        const shortMod = mod.split("/").pop();
        const role = describeOnboardingModule(mod);
        output += `| \`${shortMod}\` | ${role} |\n`;
      }
      if (flow.modules.length > 8) {
        output += `| *+${flow.modules.length - 8} more* | Additional modules |\n`;
      }
      output += "\n";
    }

    // Dependency context
    if (scanResult && flow.modules) {
      const deps = identifyFlowDependencies(flow, scanResult);
      if (deps.sharedLibraries.length > 0 || deps.externalDependencies.length > 0) {
        output += `### Dependencies\n\n`;
        if (deps.sharedLibraries.length > 0) {
          output += `**Shared libraries used:** ${deps.sharedLibraries.map(m => `\`${m}\``).join(", ")}\n\n`;
        }
        if (deps.externalDependencies.length > 0) {
          output += `**External services:** ${deps.externalDependencies.join(", ")}\n\n`;
        }
      }
    }
    
    // Flow insights
    output += `### Insights\n\n`;
    if (flow.critical) {
      output += `- ⚠️ **Critical path** — Failures here have significant business impact\n`;
      output += `- 📊 Consider adding monitoring and alerting\n`;
      output += `- 🧪 Ensure comprehensive test coverage\n`;
    } else {
      output += `- Standard integration flow with ${stepCount} processing step${stepCount === 1 ? '' : 's'}\n`;
    }
    output += "\n---\n\n";
  }

  // Import network analysis
  if (depGraph?.stats) {
    output += `## Import Network\n\n`;
    output += `The system has **${depGraph.stats.totalEdges} internal import edges** connecting ${depGraph.stats.totalFiles} source files.\n\n`;
    
    output += `### Network Topology\n\n`;
    output += `| Metric | Value | Meaning |\n`;
    output += `|--------|-------|----------|\n`;
    output += `| Total Edges | ${depGraph.stats.totalEdges} | Direct import relationships |\n`;
    output += `| Hub Count | ${depGraph.stats.hubs?.length || 0} | Central integration points |\n`;
    output += `| Avg Connections | ~${Math.round(depGraph.stats.totalEdges / Math.max(depGraph.stats.totalFiles, 1) * 10) / 10} per file | Coupling density |\n`;
    
    if (depGraph.stats.hubs && depGraph.stats.hubs.length > 0) {
      output += `\n### Key Integration Points\n\n`;
      output += `These modules aggregate data from multiple sources:\n\n`;
      output += `| Hub | Inbound | Role |\n`;
      output += `|-----|---------|------|\n`;
      for (const hub of depGraph.stats.hubs.slice(0, 5)) {
        const shortName = hub.key.split("/").pop();
        const role = describeOnboardingModule(hub.key);
        output += `| \`${shortName}\` | ${hub.importedBy} files | ${role} |\n`;
      }
      output += "\n";
    }
  }
  
  output += `---

*Flow detection uses naming conventions, import patterns, and dependency graph analysis. Enable AI enhancement with \`GITHUB_TOKEN\` for end-to-end flow narratives, failure mode analysis, data transformation descriptions, and performance bottleneck identification.*`;
  
  return output;
}

function getFallbackDeveloperOnboarding(context, enrichment = {}) {
  const { flows, depGraph } = enrichment;
  const frameworkList = context.techStack.frameworks.join(", ") || "general-purpose tools";
  const languageList = context.techStack.languages.join(", ") || "standard languages";
  const testFrameworks = context.techStack.testFrameworks || [];
  const isCLI = (context.patterns || []).some(p => p.toLowerCase().includes("cli"));
  const projectName = context.project.name || "this project";
  const routes = context.routes || {};
  const pages = routes.pages || [];
  const apis = routes.apis || [];

  let output = `# Developer Onboarding Guide

## Welcome to ${projectName}! 👋

This guide will help you get up to speed quickly. **${projectName}** is a ${frameworkList} project built with ${languageList}, containing **${context.project.modulesDetected} modules** across **${context.project.filesScanned} files**.

### What You'll Learn

1. ✅ Repository structure and organization
2. ✅ Technology stack and tools
3. ✅ Key modules to understand first
4. ✅ How data flows through the system
5. ✅ How to start contributing

---

## Quick Reference Card

| Aspect | Details |
|--------|---------|
| **Languages** | ${languageList} |
| **Frameworks** | ${frameworkList} |
| **Build Tools** | ${context.techStack.buildTools.join(", ") || "Standard toolchain"} |
${testFrameworks.length > 0 ? `| **Testing** | ${testFrameworks.join(", ")} |\n` : ""}| **Size** | ${context.project.modulesDetected} modules, ${context.project.filesScanned} files |
| **Domains** | ${context.domains.length} functional areas |
${isCLI ? "| **Type** | Command-line interface |\n" : ""}${context.project.apiRoutesDetected > 0 ? `| **API** | ${context.project.apiRoutesDetected} endpoints |\n` : ""}${context.project.pagesDetected > 0 ? `| **UI** | ${context.project.pagesDetected} pages |\n` : ""}

---

## Repository Structure

Understanding the directory layout is your first step to navigating the codebase:

| Directory | Purpose | Start Here? |
|-----------|---------|-------------|
${context.repoRoots.map(root => {
  const purpose = describeRoot(root);
  const startHere = shouldStartHere(root) ? "⭐ Yes" : "—";
  return `| \`${root}\` | ${purpose} | ${startHere} |`;
}).join("\n")}

### Where to Begin

`;
  
  const entryPoints = context.repoRoots.filter(r => shouldStartHere(r));
  if (entryPoints.length > 0) {
    output += `Focus on these directories first:\n\n`;
    for (const ep of entryPoints) {
      const purpose = describeRoot(ep);
      output += `1. **\`${ep}\`** — ${purpose}\n`;
    }
  } else {
    output += `Start by exploring the main \`src/\` directory or look for entry point files like \`index.js\`, \`main.js\`, or \`app.js\`.\n`;
  }

  // Monorepo navigation
  if (context.monorepo) {
    output += `\n---\n\n## Monorepo Navigation\n\n`;
    output += `This is a **${context.monorepo.tool}** monorepo with ${context.monorepo.packageCount} packages. Here's how to navigate:\n\n`;
    output += `| Package | Location | What It Does |\n`;
    output += `|---------|----------|-------------|\n`;
    for (const pkg of context.monorepo.packages.slice(0, 10)) {
      const desc = inferPackageDescription(pkg.name);
      output += `| \`${pkg.name}\` | \`${pkg.path}\` | ${desc} |\n`;
    }
    if (context.monorepo.packages.length > 10) {
      output += `| *+${context.monorepo.packages.length - 10} more* | — | Additional packages |\n`;
    }
    output += `\n**Pro tip:** Each package can typically be developed independently. Check the package's own \`README.md\` for specific setup instructions.\n`;
  }

  // Technology deep-dive
  output += `\n---\n\n## Technology Stack\n\n`;
  output += `| Layer | Technologies | What to Learn |\n`;
  output += `|-------|-------------|---------------|\n`;
  
  if (context.techStack.frameworks.length > 0) {
    const frameworks = context.techStack.frameworks;
    const learnTip = getFrameworkLearningTip(frameworks);
    output += `| **Framework** | ${frameworks.join(", ")} | ${learnTip} |\n`;
  }
  output += `| **Language** | ${languageList} | ${getLanguageLearningTip(context.techStack.languages)} |\n`;
  if (context.techStack.buildTools.length > 0) {
    output += `| **Build** | ${context.techStack.buildTools.join(", ")} | Understand the build pipeline |\n`;
  }
  if (testFrameworks.length > 0) {
    output += `| **Testing** | ${testFrameworks.join(", ")} | Run existing tests to understand behavior |\n`;
  }

  // Core modules to understand
  output += `\n---\n\n## Core Modules to Understand\n\n`;
  output += `These are the most important modules by size and centrality. Understanding them will unlock the rest of the codebase:\n\n`;
  output += `| Priority | Module | Files | Type | Why It Matters |\n`;
  output += `|----------|--------|-------|------|----------------|\n`;
  
  const priorityModules = context.topModules.slice(0, 10);
  for (const [i, m] of priorityModules.entries()) {
    const priority = i < 3 ? "⭐ High" : i < 6 ? "Medium" : "Low";
    const whyMatters = getModuleImportance(m.key, m.type, m.fileCount);
    output += `| ${priority} | \`${m.key}\` | ${m.fileCount} | ${formatModuleType(m.type)} | ${whyMatters} |\n`;
  }

  // Hub modules (most imported)
  if (depGraph?.stats?.hubs && depGraph.stats.hubs.length > 0) {
    output += `\n### Key Integration Points\n\n`;
    output += `These modules are imported by many other files. Changes here have wide impact:\n\n`;
    for (const hub of depGraph.stats.hubs.slice(0, 5)) {
      const role = describeOnboardingModule(hub.key);
      output += `- **\`${hub.key}\`** — Used by ${hub.importedBy} files — ${role}\n`;
    }
    output += `\n⚠️ **Caution:** Be extra careful when modifying these files. Consider the ripple effects.\n`;
  }

  // Routes exploration
  if (pages.length > 0 || apis.length > 0) {
    output += `\n---\n\n## Key Routes\n\n`;
    output += `Understanding the routing structure helps you trace user interactions through the system.\n\n`;
    
    if (pages.length > 0) {
      output += `### User-Facing Pages\n\n`;
      output += `| Path | File | What It Does |\n`;
      output += `|------|------|--------------|\n`;
      for (const p of pages.slice(0, 6)) {
        const pageName = p.path.split('/').pop() || 'root';
        const desc = inferPageDescription(pageName);
        output += `| \`${p.path}\` | ${p.file} | ${desc} |\n`;
      }
      if (pages.length > 6) {
        output += `| *+${pages.length - 6} more* | — | Additional pages |\n`;
      }
      output += "\n";
    }
    
    if (apis.length > 0) {
      output += `### API Endpoints\n\n`;
      output += `| Endpoint | Methods | File | Purpose |\n`;
      output += `|----------|---------|------|---------|\n`;
      for (const a of apis.slice(0, 6)) {
        const methods = a.methods?.join(", ") || "—";
        const purpose = inferAPIEndpointPurpose(a.path);
        output += `| \`${a.path}\` | ${methods} | ${a.file} | ${purpose} |\n`;
      }
      if (apis.length > 6) {
        output += `| *+${apis.length - 6} more* | — | — | Additional endpoints |\n`;
      }
      output += "\n";
    }
  }

  // Data flows for understanding behavior
  const onboardingFlows = (flows || []).filter(f => !f.name?.toLowerCase().includes('test'));
  if (onboardingFlows.length > 0) {
    output += `---\n\n## How Data Flows\n\n`;
    output += `Understanding these flows helps you see how the system processes information end-to-end:\n\n`;
    output += `| Flow | Description | Key Modules |\n`;
    output += `|------|-------------|-------------|\n`;
    for (const flow of onboardingFlows.slice(0, 5)) {
      const keyModules = (flow.modules || []).slice(0, 2).map(m => `\`${m.split("/").pop()}\``).join(", ") || "—";
      output += `| **${flow.name}** | ${flow.description.substring(0, 60)}${flow.description.length > 60 ? "..." : ""} | ${keyModules} |\n`;
    }
    output += `\n**Debugging tip:** When investigating issues, trace the data flow from input to output to identify where problems occur.\n`;
  }

  // Getting started checklist
  output += `\n---\n\n## Getting Started Checklist\n\n`;
  output += `Follow these steps to set up your development environment:\n\n`;
  
  let stepNum = 1;
  output += `### ${stepNum++}. Clone and Install\n\n`;
  output += "```bash\n";
  output += `git clone <repository-url>\n`;
  output += `cd ${projectName.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase()}\n`;
  output += `npm install  # or yarn, pnpm\n`;
  output += "```\n\n";

  output += `### ${stepNum++}. Explore the Structure\n\n`;
  output += `- Review the directory structure above\n`;
  output += `- Open the \`README.md\` for project-specific instructions\n`;
  output += `- Look for \`CONTRIBUTING.md\` for contribution guidelines\n\n`;

  output += `### ${stepNum++}. Understand Core Modules\n\n`;
  output += `Start with the high-priority modules listed above. Read the code and comments to understand:\n\n`;
  output += `- What problem each module solves\n`;
  output += `- How modules interact with each other\n`;
  output += `- What data structures are used\n\n`;

  if (testFrameworks.length > 0) {
    output += `### ${stepNum++}. Run the Tests\n\n`;
    output += "```bash\n";
    output += `npm test  # or: npx ${testFrameworks[0].toLowerCase()} run\n`;
    output += "```\n\n";
    output += `Running tests helps you:\n`;
    output += `- Verify your setup is correct\n`;
    output += `- See expected behavior documented in test cases\n`;
    output += `- Understand module interfaces through test examples\n\n`;
  }

  output += `### ${stepNum++}. Make Your First Change\n\n`;
  output += `Start small:\n\n`;
  output += `1. Find a small bug or typo to fix\n`;
  output += `2. Make the change in a feature branch\n`;
  output += `3. Run tests to ensure nothing breaks\n`;
  output += `4. Submit a pull request for review\n\n`;

  // Common pitfalls
  output += `---\n\n## Common Pitfalls\n\n`;
  output += `New contributors often run into these issues:\n\n`;
  
  const pitfalls = [];
  if (depGraph?.stats?.cycles > 0) {
    pitfalls.push(`**Circular dependencies** — This codebase has ${depGraph.stats.cycles} circular import${depGraph.stats.cycles === 1 ? '' : 's'}. Be careful not to introduce more.`);
  }
  if (depGraph?.stats?.hubs?.length > 0 && depGraph.stats.hubs[0].importedBy >= depGraph.stats.totalFiles * 0.3) {
    pitfalls.push(`**High-impact modules** — \`${depGraph.stats.hubs[0].key.split("/").pop()}\` is used by ${Math.round(depGraph.stats.hubs[0].importedBy / depGraph.stats.totalFiles * 100)}% of the codebase. Changes here need thorough testing.`);
  }
  if (context.monorepo) {
    pitfalls.push(`**Monorepo boundaries** — Remember to build dependent packages when making changes.`);
  }
  pitfalls.push(`**Environment setup** — Check for \`.env.example\` files and ensure you have all required environment variables.`);
  pitfalls.push(`**Branch naming** — Follow the team's branch naming conventions (usually \`feature/\`, \`fix/\`, \`docs/\`).`);
  
  for (const pitfall of pitfalls) {
    output += `- ${pitfall}\n`;
  }

  // Resources
  output += `\n---\n\n## Additional Resources\n\n`;
  output += `| Resource | Purpose |\n`;
  output += `|----------|----------|\n`;
  output += `| \`README.md\` | Project overview and quick start |\n`;
  output += `| \`CONTRIBUTING.md\` | Contribution guidelines (if exists) |\n`;
  output += `| \`CHANGELOG.md\` | Recent changes and release history |\n`;
  output += `| \`package.json\` | Available scripts and dependencies |\n`;
  if (context.monorepo) {
    output += `| Root \`package.json\` | Monorepo workspace configuration |\n`;
  }

  output += `\n---

*This onboarding guide was generated from comprehensive repository analysis. Enable AI enhancement with \`GITHUB_TOKEN\` for narrative walkthroughs, common pitfall documentation, debugging tips, architecture deep-dives, and personalized contribution recommendations.*

**Welcome to the team! Happy coding! 🚀**`;

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

// Helper: infer business capability from domain name
function inferDomainCapability(name) {
  const lower = name.toLowerCase();
  if (/auth|identity|login|sso/.test(lower)) return "User identity verification and access control";
  if (/payment|billing|checkout|stripe/.test(lower)) return "Payment processing and financial transactions";
  if (/analytic|report|metric|dashboard/.test(lower)) return "Data analysis and business intelligence";
  if (/content|cms|article|post|blog/.test(lower)) return "Content creation and editorial workflow";
  if (/search|discovery|find|browse/.test(lower)) return "Search and content discovery";
  if (/notif|alert|email|sms|push/.test(lower)) return "User notifications and messaging";
  if (/api|endpoint|rest|graphql/.test(lower)) return "External API interface layer";
  if (/ui|component|widget|button/.test(lower)) return "Reusable visual interface elements";
  if (/hook|state|redux|store/.test(lower)) return "Application state and data flow management";
  if (/util|helper|shared|common/.test(lower)) return "Cross-cutting utility functions";
  if (/data|database|model|schema/.test(lower)) return "Data persistence and modeling";
  if (/config|setting|env/.test(lower)) return "Application configuration";
  if (/test|spec|mock/.test(lower)) return "Quality assurance and testing";
  if (/job|queue|worker|task/.test(lower)) return "Background processing and async tasks";
  if (/user|profile|account/.test(lower)) return "User profiles and preferences";
  if (/order|cart|product|inventory/.test(lower)) return "E-commerce and inventory management";
  if (/media|image|video|upload/.test(lower)) return "Media handling and file uploads";
  if (/cache|redis|memcache/.test(lower)) return "Performance optimization and caching";
  if (/security|audit|log/.test(lower)) return "Security monitoring and audit trails";
  if (/ai|ml|llm|model/.test(lower)) return "AI/ML capabilities and inference";
  if (/plugin|extension|addon/.test(lower)) return "Extensibility and plugin architecture";
  if (/render|template|view/.test(lower)) return "Output generation and templating";
  if (/publish|deploy|release/.test(lower)) return "Content distribution and deployment";
  if (/integrate|connect|sync/.test(lower)) return "Third-party system integration";
  return "Supporting business operations";
}

// Helper: describe layer responsibility
function getLayerResponsibility(type) {
  const responsibilities = {
    api: "Handles HTTP requests, input validation, and response formatting",
    ui: "Renders user interface elements and manages component state",
    library: "Provides shared utilities and abstractions used across modules",
    hooks: "Encapsulates reusable stateful logic and side effects",
    state: "Manages application-wide data synchronization",
    route: "Maps URL paths to page components and handles navigation",
    app: "Orchestrates application initialization and core bootstrapping",
    other: "General purpose functionality",
  };
  return responsibilities[type] || "Supporting application functionality";
}

// Helper: calculate codebase health score
function calculateHealthScore(stats, context) {
  let score = 100;
  
  // Circular dependencies are a major concern
  if (stats.cycles > 0) score -= Math.min(30, stats.cycles * 10);
  
  // Orphan files indicate potential dead code
  const orphanRatio = stats.orphanFiles / Math.max(stats.totalFiles, 1);
  if (orphanRatio > 0.2) score -= 20;
  else if (orphanRatio > 0.1) score -= 10;
  
  // Too many external dependencies
  if (stats.externalDeps > 100) score -= 15;
  else if (stats.externalDeps > 50) score -= 5;
  
  // No test framework detected
  const hasTests = (context.techStack.testFrameworks || []).length > 0;
  if (!hasTests) score -= 10;
  
  // Give bonus for clean, connected codebase
  if (stats.cycles === 0 && stats.totalEdges > 0) score = Math.min(100, score + 5);
  
  return Math.max(0, Math.min(100, score));
}

// Helper: format file count with proper granularity descriptions
function formatFileScale(count) {
  if (count < 20) return `${count} files (small project)`;
  if (count < 100) return `${count} files (medium project)`;
  if (count < 500) return `${count} files (large project)`;
  return `${count} files (enterprise scale)`;
}

// Helper: describe route patterns
function describeRoutePattern(routes) {
  if (!routes) return null;
  
  // Handle routes object with pages and apis arrays
  const pages = routes.pages || [];
  const apis = routes.apis || [];
  
  const patterns = [];
  if (apis.length > 0) {
    const methods = [...new Set(apis.map(r => r.methods || []).flat().filter(Boolean))];
    patterns.push(`${apis.length} API endpoint${apis.length === 1 ? '' : 's'}${methods.length > 0 ? ` (${methods.join(', ')})` : ''}`);
  }
  if (pages.length > 0) {
    patterns.push(`${pages.length} page route${pages.length === 1 ? '' : 's'}`);
  }
  
  return patterns.length > 0 ? patterns.join(' and ') : null;
}

// Helper: explain what a framework is used for
function inferFrameworkPurpose(frameworks) {
  const purposes = [];
  for (const fw of frameworks) {
    const lower = fw.toLowerCase();
    if (/next\.?js/i.test(lower)) purposes.push("Full-stack React with SSR/SSG");
    else if (/react/i.test(lower)) purposes.push("Component-based UI rendering");
    else if (/vue/i.test(lower)) purposes.push("Progressive frontend framework");
    else if (/express/i.test(lower)) purposes.push("HTTP server and middleware");
    else if (/fastify/i.test(lower)) purposes.push("High-performance HTTP server");
    else if (/nest/i.test(lower)) purposes.push("Enterprise Node.js framework");
    else if (/angular/i.test(lower)) purposes.push("Opinionated frontend platform");
    else if (/svelte/i.test(lower)) purposes.push("Compile-time reactive UI");
  }
  return purposes.length > 0 ? purposes.join(", ") : "Application runtime";
}

// Helper: explain an architectural pattern
function explainPattern(pattern) {
  const lower = pattern.toLowerCase();
  if (/cli/i.test(lower)) return "The system operates as a command-line interface, accepting user input through terminal commands and producing structured output.";
  if (/monorepo/i.test(lower)) return "Multiple related packages are managed in a single repository, enabling coordinated development and shared tooling.";
  if (/microservice/i.test(lower)) return "The system is decomposed into independently deployable services communicating over network protocols.";
  if (/mvc|model.?view/i.test(lower)) return "The application separates data (Model), presentation (View), and business logic (Controller) into distinct layers.";
  if (/spa|single.?page/i.test(lower)) return "The UI is rendered client-side as a single-page application, with dynamic content updates without full page reloads.";
  if (/api.?first/i.test(lower)) return "The system is designed API-first, with a well-defined interface contract that drives both backend and frontend development.";
  if (/layered/i.test(lower)) return "The codebase is organized into horizontal layers (e.g., presentation, business, data) with clear boundaries.";
  if (/modular/i.test(lower)) return "Functionality is divided into self-contained modules with explicit interfaces and minimal coupling.";
  if (/plugin/i.test(lower)) return "The system supports extensibility through a plugin architecture allowing third-party additions.";
  return "A structured approach to organizing code and managing complexity.";
}

// Helper: get benefits of a pattern
function getBenefitsForPattern(pattern) {
  const lower = pattern.toLowerCase();
  if (/cli/i.test(lower)) return "Automation-friendly, scriptable, integrates with CI/CD pipelines";
  if (/monorepo/i.test(lower)) return "Shared tooling, atomic cross-package changes, unified versioning";
  if (/microservice/i.test(lower)) return "Independent deployment, tech flexibility, team autonomy";
  if (/mvc|model.?view/i.test(lower)) return "Separation of concerns, testability, parallel development";
  if (/spa|single.?page/i.test(lower)) return "Fast navigation, rich interactivity, offline capabilities";
  if (/api.?first/i.test(lower)) return "Clear contracts, parallel development, documentation-driven";
  if (/layered/i.test(lower)) return "Clear responsibilities, easier testing, technology swapping";
  if (/modular/i.test(lower)) return "Reusability, isolated testing, team ownership boundaries";
  if (/plugin/i.test(lower)) return "Extensibility, community contributions, core stability";
  return "Structured organization, maintainability, clarity";
}

// Helper: insight for a layer/domain
function getLayerInsight(name, fileCount, moduleCount) {
  const lower = name.toLowerCase();
  if (fileCount > 100) return "Large domain — consider breaking down";
  if (moduleCount === 1 && fileCount > 30) return "Single large module — evaluate decomposition";
  if (/util|helper|common|shared/i.test(lower)) return "Shared infrastructure — high reuse";
  if (/test/i.test(lower)) return "Quality assurance — critical for refactoring";
  if (/api|endpoint|route/i.test(lower)) return "External interface — versioning important";
  if (/auth/i.test(lower)) return "Security-critical — extra review needed";
  return "Standard domain";
}

// Helper: architectural implication of frameworks
function getFrameworkArchitecturalImplication(frameworks) {
  for (const fw of frameworks) {
    const lower = fw.toLowerCase();
    if (/next\.?js/i.test(lower)) return "File-based routing, hybrid rendering strategies";
    if (/react/i.test(lower)) return "Component tree, unidirectional data flow";
    if (/vue/i.test(lower)) return "Reactive data binding, component composition";
    if (/express|fastify/i.test(lower)) return "Middleware pipeline, request/response cycle";
    if (/nest/i.test(lower)) return "Decorators, dependency injection, modules";
    if (/angular/i.test(lower)) return "Module system, dependency injection, RxJS";
  }
  return "Standard application patterns";
}

// Helper: architectural implication of languages
function getLanguageImplication(languages) {
  const langs = (languages || []).map(l => l.toLowerCase());
  if (langs.includes("typescript")) return "Static typing enables tooling and refactoring confidence";
  if (langs.includes("javascript")) return "Dynamic typing, flexible but requires discipline";
  if (langs.includes("python")) return "Readable syntax, rich ecosystem";
  if (langs.includes("go")) return "Fast compilation, strong concurrency support";
  if (langs.includes("rust")) return "Memory safety, zero-cost abstractions";
  return "Standard language patterns";
}

// Helper: describe a page from its name
function inferPageDescription(pageName) {
  const lower = (pageName || "").toLowerCase();
  if (/^index$|^home$|^\/$/.test(lower)) return "Main entry page";
  if (/login|signin/i.test(lower)) return "User authentication";
  if (/register|signup/i.test(lower)) return "User registration";
  if (/dashboard/i.test(lower)) return "User dashboard overview";
  if (/settings/i.test(lower)) return "User preferences and settings";
  if (/profile/i.test(lower)) return "User profile management";
  if (/admin/i.test(lower)) return "Administrative interface";
  if (/search/i.test(lower)) return "Search functionality";
  if (/about/i.test(lower)) return "About/information page";
  if (/contact/i.test(lower)) return "Contact form or information";
  if (/help|faq|support/i.test(lower)) return "Help and support";
  if (/blog|post|article/i.test(lower)) return "Content display";
  if (/cart|checkout/i.test(lower)) return "Shopping cart or checkout";
  if (/order/i.test(lower)) return "Order management";
  if (/product/i.test(lower)) return "Product display";
  if (/404|error|not.?found/i.test(lower)) return "Error handling page";
  return "Application page";
}

// Helper: describe an API endpoint from its path
function inferAPIEndpointPurpose(path) {
  const lower = (path || "").toLowerCase();
  if (/\/auth\/|\/login|\/signin/i.test(lower)) return "Authentication";
  if (/\/user/i.test(lower)) return "User management";
  if (/\/admin/i.test(lower)) return "Administrative operations";
  if (/\/search/i.test(lower)) return "Search functionality";
  if (/\/upload|\/file/i.test(lower)) return "File operations";
  if (/\/payment|\/checkout|\/order/i.test(lower)) return "Transaction processing";
  if (/\/webhook/i.test(lower)) return "External integrations";
  if (/\/health|\/status|\/ping/i.test(lower)) return "Health monitoring";
  if (/\/config|\/setting/i.test(lower)) return "Configuration";
  if (/\/analytic|\/metric|\/stat/i.test(lower)) return "Analytics and metrics";
  if (/\/notify|\/email|\/sms/i.test(lower)) return "Notifications";
  if (/\/export|\/download/i.test(lower)) return "Data export";
  if (/\/import/i.test(lower)) return "Data import";
  return "Data operations";
}

// Helper: describe a package from its name
function inferPackageDescription(name) {
  const lower = (name || "").toLowerCase();
  if (/core|main|base/i.test(lower)) return "Core functionality and shared code";
  if (/cli|command/i.test(lower)) return "Command-line interface";
  if (/api|server|backend/i.test(lower)) return "Backend/API server";
  if (/web|app|frontend|client/i.test(lower)) return "Frontend application";
  if (/ui|component/i.test(lower)) return "Shared UI components";
  if (/util|common|shared|lib/i.test(lower)) return "Utility libraries";
  if (/config/i.test(lower)) return "Configuration management";
  if (/test|spec/i.test(lower)) return "Testing utilities";
  if (/doc/i.test(lower)) return "Documentation";
  if (/type|schema/i.test(lower)) return "Type definitions and schemas";
  if (/plugin|extension/i.test(lower)) return "Extension/plugin support";
  return "Package functionality";
}

// Helper: infer the purpose of a flow step
function inferStepPurpose(step) {
  const lower = (step || "").toLowerCase();
  if (/import|load|read|fetch|get/i.test(lower)) return "Data acquisition";
  if (/valid|check|verify/i.test(lower)) return "Input validation";
  if (/transform|convert|map|parse/i.test(lower)) return "Data transformation";
  if (/save|write|store|persist|create|update|delete/i.test(lower)) return "Data persistence";
  if (/send|emit|dispatch|notify|publish/i.test(lower)) return "Event/message dispatch";
  if (/render|display|show|format/i.test(lower)) return "Output generation";
  if (/auth|login|permission/i.test(lower)) return "Security check";
  if (/cache|memo/i.test(lower)) return "Performance optimization";
  if (/log|track|metric/i.test(lower)) return "Observability";
  return "Processing step";
}

// Helper: determine if a directory is a good starting point
function shouldStartHere(root) {
  const lower = (root || "").toLowerCase().replace(/\/$/, "");
  const lastSeg = lower.split("/").pop();
  // Good starting points
  if (/^src$|^lib$|^app$/i.test(lastSeg)) return true;
  if (/^core$|^main$/.test(lastSeg)) return true;
  // Not entry points
  if (/^test|^spec|^__test|^doc|^dist|^build|^node_module|^\./.test(lastSeg)) return false;
  return false;
}

// Helper: framework learning tip
function getFrameworkLearningTip(frameworks) {
  for (const fw of frameworks) {
    const lower = fw.toLowerCase();
    if (/next\.?js/i.test(lower)) return "Learn the pages/ directory structure and data fetching methods";
    if (/react/i.test(lower)) return "Understand component lifecycle and hooks";
    if (/vue/i.test(lower)) return "Learn the Options API or Composition API patterns";
    if (/express/i.test(lower)) return "Understand middleware chains and route handling";
    if (/nest/i.test(lower)) return "Learn decorators, modules, and dependency injection";
    if (/angular/i.test(lower)) return "Understand modules, components, and services";
  }
  return "Review the framework documentation";
}

// Helper: language learning tip
function getLanguageLearningTip(languages) {
  const langs = (languages || []).map(l => l.toLowerCase());
  if (langs.includes("typescript")) return "Strong typing — check types when debugging";
  if (langs.includes("javascript")) return "Dynamic typing — use console.log for runtime inspection";
  if (langs.includes("python")) return "Read docstrings and type hints";
  return "Review language idioms used in the codebase";
}

// Helper: explain why a module matters for onboarding
function getModuleImportance(key, type, fileCount) {
  if (type === "api") return "External interface — understand inputs/outputs";
  if (type === "app" || type === "state") return "Central logic — understand data flow";
  if (type === "ui") return "User experience — see visible behavior";
  if (type === "library") return "Shared code — reused throughout";
  if (type === "hooks") return "Business logic — encapsulates state patterns";
  if (fileCount > 20) return "Large module — core functionality";
  return "Key system component";
}
