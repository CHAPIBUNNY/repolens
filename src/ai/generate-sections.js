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
  createAPIDocumentationPrompt
} from "./prompts.js";
import { info, warn } from "../utils/logger.js";

export async function generateExecutiveSummary(context) {
  if (!isAIEnabled()) {
    return getFallbackExecutiveSummary(context);
  }
  
  info("Generating executive summary with AI...");
  
  const result = await generateText({
    system: SYSTEM_PROMPT,
    user: createExecutiveSummaryPrompt(context),
    temperature: 0.2,
    maxTokens: 1500
  });
  
  if (!result.success) {
    warn("AI generation failed, using fallback");
    return getFallbackExecutiveSummary(context);
  }
  
  return result.text;
}

export async function generateSystemOverview(context) {
  if (!isAIEnabled()) {
    return getFallbackSystemOverview(context);
  }
  
  info("Generating system overview with AI...");
  
  const result = await generateText({
    system: SYSTEM_PROMPT,
    user: createSystemOverviewPrompt(context),
    temperature: 0.2,
    maxTokens: 1200
  });
  
  if (!result.success) {
    return getFallbackSystemOverview(context);
  }
  
  return result.text;
}

export async function generateBusinessDomains(context) {
  if (!isAIEnabled()) {
    return getFallbackBusinessDomains(context);
  }
  
  info("Generating business domains with AI...");
  
  const result = await generateText({
    system: SYSTEM_PROMPT,
    user: createBusinessDomainsPrompt(context),
    temperature: 0.2,
    maxTokens: 2000
  });
  
  if (!result.success) {
    return getFallbackBusinessDomains(context);
  }
  
  return result.text;
}

export async function generateArchitectureOverview(context) {
  if (!isAIEnabled()) {
    return getFallbackArchitectureOverview(context);
  }
  
  info("Generating architecture overview with AI...");
  
  const result = await generateText({
    system: SYSTEM_PROMPT,
    user: createArchitectureOverviewPrompt(context),
    temperature: 0.2,
    maxTokens: 1800
  });
  
  if (!result.success) {
    return getFallbackArchitectureOverview(context);
  }
  
  return result.text;
}

export async function generateDataFlows(flows, context) {
  if (!isAIEnabled()) {
    return getFallbackDataFlows(flows);
  }
  
  info("Generating data flows with AI...");
  
  const result = await generateText({
    system: SYSTEM_PROMPT,
    user: createDataFlowsPrompt(flows, context),
    temperature: 0.2,
    maxTokens: 1800
  });
  
  if (!result.success) {
    return getFallbackDataFlows(flows);
  }
  
  return result.text;
}

export async function generateDeveloperOnboarding(context) {
  if (!isAIEnabled()) {
    return getFallbackDeveloperOnboarding(context);
  }
  
  info("Generating developer onboarding with AI...");
  
  const result = await generateText({
    system: SYSTEM_PROMPT,
    user: createDeveloperOnboardingPrompt(context),
    temperature: 0.2,
    maxTokens: 2200
  });
  
  if (!result.success) {
    return getFallbackDeveloperOnboarding(context);
  }
  
  return result.text;
}

// Fallback generators (deterministic, no AI)

function getFallbackExecutiveSummary(context) {
  return `# Executive Summary

## What this system does

${context.project.name} is a ${context.techStack.frameworks.join(", ") || "software"} application with ${context.project.modulesDetected} modules across ${context.project.filesScanned} files.

## Main system areas

The codebase is organized into ${context.domains.length} main domains:

${context.domains.map(d => `- ${d.name}: ${d.moduleCount} modules`).join("\n")}

## Technology stack

- Frameworks: ${context.techStack.frameworks.join(", ") || "Not detected"}
- Languages: ${context.techStack.languages.join(", ") || "Not detected"}
- Build tools: ${context.techStack.buildTools.join(", ") || "Not detected"}

## Key observations

- ${context.project.pagesDetected} pages detected
- ${context.project.apiRoutesDetected} API routes detected
- Architecture patterns: ${context.patterns.join(", ") || "Standard patterns"}

Note: AI-enhanced documentation is disabled. Enable with REPOLENS_AI_ENABLED=true for richer insights.`;
}

function getFallbackSystemOverview(context) {
  return `# System Overview

## Repository snapshot

- Files scanned: ${context.project.filesScanned}
- Modules: ${context.project.modulesDetected}
- Pages: ${context.project.pagesDetected}
- APIs: ${context.project.apiRoutesDetected}

## Technology patterns

${context.patterns.map(p => `- ${p}`).join("\n")}

## Dominant domains

${context.domains.slice(0, 5).map((d, i) => `${i + 1}. ${d.name} (${d.fileCount} files)`).join("\n")}

Note: AI-enhanced documentation is disabled. Enable with REPOLENS_AI_ENABLED=true for richer insights.`;
}

function getFallbackBusinessDomains(context) {
  let output = `# Business Domains\n\n`;
  
  for (const domain of context.domains) {
    output += `## Domain: ${domain.name}\n\n`;
    output += `${domain.description}\n\n`;
    output += `Modules: ${domain.moduleCount}\n`;
    output += `Files: ${domain.fileCount}\n\n`;
    output += `Main modules:\n`;
    output += domain.topModules.slice(0, 5).map(m => `- ${m}`).join("\n");
    output += `\n\n`;
  }
  
  output += `Note: AI-enhanced documentation is disabled. Enable with REPOLENS_AI_ENABLED=true for richer insights.`;
  
  return output;
}

function getFallbackArchitectureOverview(context) {
  return `# Architecture Overview

## Architecture style

Based on detected patterns: ${context.patterns.join(", ")}

## Key layers

${context.domains.slice(0, 5).map(d => `- ${d.name}: ${d.description}`).join("\n")}

## Technology stack

- Frameworks: ${context.techStack.frameworks.join(", ")}
- Languages: ${context.techStack.languages.join(", ")}
- Build tools: ${context.techStack.buildTools.join(", ")}

Note: AI-enhanced documentation is disabled. Enable with REPOLENS_AI_ENABLED=true for richer insights.`;
}

function getFallbackDataFlows(flows) {
  let output = `# Data Flows\n\n`;
  
  for (const flow of flows) {
    output += `## ${flow.name}\n\n`;
    output += `${flow.description}\n\n`;
    output += `Steps:\n`;
    output += flow.steps.map((s, i) => `${i + 1}. ${s}`).join("\n");
    output += `\n\n`;
  }
  
  output += `Note: AI-enhanced documentation is disabled. Enable with REPOLENS_AI_ENABLED=true for richer insights.`;
  
  return output;
}

function getFallbackDeveloperOnboarding(context) {
  return `# Developer Onboarding

## Start here

This is a ${context.project.name} repository with ${context.project.modulesDetected} modules.

## Main folders

${context.repoRoots.map(root => `- ${root}`).join("\n")}

## Technology stack

- ${context.techStack.frameworks.join(", ")}
- ${context.techStack.languages.join(", ")}

## Top modules by size

${context.topModules.slice(0, 10).map((m, i) => `${i + 1}. ${m.key} (${m.fileCount} files)`).join("\n")}

Note: AI-enhanced documentation is disabled. Enable with REPOLENS_AI_ENABLED=true for richer insights.`;
}
