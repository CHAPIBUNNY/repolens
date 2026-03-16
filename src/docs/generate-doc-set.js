// Orchestrate generation of complete documentation set

import { buildAIContext, buildModuleContext } from "../analyzers/context-builder.js";
import { inferDataFlows } from "../analyzers/flow-inference.js";
import { analyzeGraphQL } from "../analyzers/graphql-analyzer.js";
import { analyzeTypeScript } from "../analyzers/typescript-analyzer.js";
import { analyzeDependencyGraph } from "../analyzers/dependency-graph.js";
import { buildSnapshot, loadBaseline, saveBaseline, detectDrift } from "../analyzers/drift-detector.js";
import { parseCodeowners, buildOwnershipMap } from "../analyzers/codeowners.js";
import { getActiveDocuments } from "../ai/document-plan.js";
import {
  generateExecutiveSummary,
  generateSystemOverview,
  generateBusinessDomains,
  generateArchitectureOverview,
  generateDataFlows,
  generateDeveloperOnboarding
} from "../ai/generate-sections.js";
import { renderModuleCatalog as renderModuleCatalogOriginal } from "../renderers/render.js";
import { renderRouteMap as renderRouteMapOriginal } from "../renderers/render.js";
import { renderApiSurface as renderApiSurfaceOriginal } from "../renderers/render.js";
import { renderSystemMap } from "../renderers/renderMap.js";
import { renderArchitectureDiff } from "../renderers/renderDiff.js";
import {
  renderGraphQLSchema,
  renderTypeGraph,
  renderDependencyGraph,
  renderArchitectureDrift as renderDriftReport
} from "../renderers/renderAnalysis.js";
import { info, warn } from "../utils/logger.js";
import path from "node:path";

export async function generateDocumentSet(scanResult, config, diffData = null, pluginManager = null) {
  info("Building structured context for AI...");
  
  // Build AI context from scan results (dep graph computed later, patched in after)
  let aiContext = buildAIContext(scanResult, config);
  let moduleContext = buildModuleContext(scanResult.modules, config);
  let flows = inferDataFlows(scanResult, config);
  
  // Run extended analysis (v0.8.0)
  const repoRoot = config.__repoRoot || process.cwd();
  const scanFiles = scanResult._files || [];
  
  info("Running extended analysis...");
  let graphqlResult = { detected: false };
  let tsResult = { detected: false };
  let depGraph = { stats: {}, graph: {} };
  try { graphqlResult = await analyzeGraphQL(scanFiles, repoRoot); } catch (e) { warn(`GraphQL analysis failed: ${e.message}`); }
  try { tsResult = await analyzeTypeScript(scanFiles, repoRoot); } catch (e) { warn(`TypeScript analysis failed: ${e.message}`); }
  try { depGraph = await analyzeDependencyGraph(scanFiles, repoRoot); } catch (e) { warn(`Dependency graph analysis failed: ${e.message}`); }
  
  // Architecture drift detection
  const outputDir = path.join(repoRoot, ".repolens");
  let baseline = null;
  let snapshot = null;
  let driftResult = { drifts: [], summary: "No drift data available" };
  try {
    baseline = await loadBaseline(outputDir);
    snapshot = buildSnapshot(scanResult, depGraph, graphqlResult, tsResult);
    driftResult = detectDrift(baseline, snapshot);
    // Save current snapshot as new baseline
    await saveBaseline(snapshot, outputDir);
  } catch (e) { warn(`Drift detection failed: ${e.message}`); }

  // Rebuild AI context with dep graph for enriched module roles and pattern verification
  aiContext = buildAIContext(scanResult, config, depGraph);
  moduleContext = buildModuleContext(scanResult.modules, config, depGraph);
  flows = inferDataFlows(scanResult, config, depGraph);

  // CODEOWNERS integration
  const codeowners = await parseCodeowners(repoRoot);
  const ownershipMap = codeowners.found
    ? buildOwnershipMap(scanResult.modules, scanFiles, codeowners.rules)
    : {};
  
  // Get active documents based on config
  const activeDocuments = getActiveDocuments(config);
  
  info(`Generating ${activeDocuments.length} documentation files...`);
  
  const documents = [];
  const artifacts = {
    context: aiContext,
    modules: moduleContext,
    flows,
    graphql: graphqlResult.detected ? graphqlResult : undefined,
    typescript: tsResult.detected ? tsResult : undefined,
    dependencyGraph: depGraph.stats,
    drift: driftResult,
    codeowners: codeowners.found ? { file: codeowners.file, ruleCount: codeowners.rules.length } : undefined,
    ownershipMap: Object.keys(ownershipMap).length > 0 ? ownershipMap : undefined,
  };
  
  // Run afterScan hook
  let hookScanResult = scanResult;
  if (pluginManager) {
    hookScanResult = await pluginManager.runHook("afterScan", scanResult);
  }

  // Generate each document
  const totalDocs = activeDocuments.length;
  let docIndex = 0;
  
  for (const docPlan of activeDocuments) {
    docIndex++;
    info(`[${docIndex}/${totalDocs}] Generating ${docPlan.key}...`);
    let content = null;
    
    try {
      content = await generateDocument(docPlan, {
        scanResult: hookScanResult,
        config,
        aiContext,
        moduleContext,
        flows,
        diffData,
        graphqlResult,
        tsResult,
        depGraph,
        driftResult,
        ownershipMap,
        pluginManager,
      });
      
      // Validate that content was actually generated
      if (!content || (typeof content === "string" && content.trim() === "")) {
        warn(`Document ${docPlan.key} returned empty content, using placeholder`);
        content = `# ${docPlan.title}\n\n> This document could not be generated. Check the logs for errors.\n`;
      }
      
      documents.push({
        ...docPlan,
        content,
        generated: new Date().toISOString()
      });
      
      info(`✓ Generated ${docPlan.filename} (${content.length} chars)`);
      
    } catch (error) {
      warn(`✗ Failed to generate ${docPlan.filename}: ${error.message}`);
      // Add placeholder document so publishers know about the failure
      documents.push({
        ...docPlan,
        content: `# ${docPlan.title}\n\n> **Generation Error:** ${error.message}\n\nPlease check the RepoLens logs for details.\n`,
        generated: new Date().toISOString(),
        error: true
      });
    }
  }

  // Generate plugin-provided documents (not in core document plan)
  if (pluginManager) {
    const pluginRenderers = pluginManager.getRenderers();
    const coreKeys = new Set(activeDocuments.map(d => d.key));

    for (const [key, renderer] of Object.entries(pluginRenderers)) {
      if (coreKeys.has(key)) continue; // Already generated by core

      try {
        const content = await renderer.render({
          scanResult: hookScanResult,
          config,
          aiContext,
          moduleContext,
          flows,
          diffData,
          graphqlResult,
          tsResult,
          depGraph,
          driftResult,
        });

        documents.push({
          key,
          title: renderer.title,
          filename: renderer.filename || `${key}.md`,
          category: renderer.category || "custom",
          audience: renderer.audience || ["technical"],
          content,
          generated: new Date().toISOString(),
        });

        info(`✓ Generated plugin document: ${renderer.title}`);
      } catch (err) {
        info(`✗ Failed to generate plugin document "${key}": ${err.message}`);
      }
    }
  }

  // Run afterRender hook
  if (pluginManager) {
    const rendered = await pluginManager.runHook("afterRender", documents);
    return { documents: rendered, artifacts, config };
  }

  return {
    documents,
    artifacts,
    config
  };
}

async function generateDocument(docPlan, context) {
  const { key } = docPlan;
  const { scanResult, config, aiContext, moduleContext, flows, diffData, graphqlResult, tsResult, depGraph, driftResult, ownershipMap, pluginManager } = context;
  
  switch (key) {
    case "executive_summary":
      return await generateExecutiveSummary(aiContext, { depGraph, flows }, config);
      
    case "system_overview":
      return await generateSystemOverview(aiContext, { depGraph }, config);
      
    case "business_domains":
      return await generateBusinessDomains(aiContext, { depGraph }, config);
      
    case "architecture_overview":
      return await generateArchitectureOverview(aiContext, { depGraph, driftResult }, config);
      
    case "module_catalog":
      // Hybrid: deterministic skeleton + ownership info + dep-graph roles
      return renderModuleCatalogOriginal(config, scanResult, ownershipMap, depGraph);
      
    case "route_map":
      // Hybrid: deterministic skeleton + context-aware messaging
      return renderRouteMapOriginal(config, scanResult, aiContext);
      
    case "api_surface":
      // Hybrid: deterministic skeleton + AI enhancement (for now, just deterministic)
      return renderApiSurfaceOriginal(config, scanResult);
      
    case "data_flows":
      return await generateDataFlows(flows, aiContext, { depGraph, scanResult, moduleContext }, config);
      
    case "arch_diff":
      if (!diffData) {
        return "# Architecture Diff\n\nNo changes detected.";
      }
      return renderArchitectureDiff(diffData);
      
    case "system_map":
      // Hybrid: deterministic diagram + AI explanation (for now, just diagram)
      return renderSystemMap(scanResult, config, depGraph);
      
    case "developer_onboarding":
      return await generateDeveloperOnboarding(aiContext, { flows, depGraph }, config);
      
    case "graphql_schema":
      return renderGraphQLSchema(graphqlResult);
      
    case "type_graph":
      return renderTypeGraph(tsResult);
      
    case "dependency_graph":
      return renderDependencyGraph(depGraph);
      
    case "architecture_drift":
      return renderDriftReport(driftResult);
      
    default: {
      // Check if a plugin provides this renderer
      if (pluginManager) {
        const pluginRenderers = pluginManager.getRenderers();
        if (pluginRenderers[key]) {
          return await pluginRenderers[key].render(context);
        }
      }
      throw new Error(`Unknown document type: ${key}`);
    }
  }
}
