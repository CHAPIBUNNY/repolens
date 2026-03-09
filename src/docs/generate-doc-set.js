// Orchestrate generation of complete documentation set

import { buildAIContext, buildModuleContext } from "../analyzers/context-builder.js";
import { inferDataFlows } from "../analyzers/flow-inference.js";
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
import { info } from "../utils/logger.js";

export async function generateDocumentSet(scanResult, config, diffData = null) {
  info("Building structured context for AI...");
  
  // Build AI context from scan results
  const aiContext = buildAIContext(scanResult, config);
  const moduleContext = buildModuleContext(scanResult.modules, config);
  const flows = inferDataFlows(scanResult, config);
  
  // Get active documents based on config
  const activeDocuments = getActiveDocuments(config);
  
  info(`Generating ${activeDocuments.length} documentation files...`);
  
  const documents = [];
  const artifacts = {
    context: aiContext,
    modules: moduleContext,
    flows
  };
  
  // Generate each document
  for (const docPlan of activeDocuments) {
    let content = null;
    
    try {
      content = await generateDocument(docPlan, {
        scanResult,
        config,
        aiContext,
        moduleContext,
        flows,
        diffData
      });
      
      documents.push({
        ...docPlan,
        content,
        generated: new Date().toISOString()
      });
      
      info(`✓ Generated ${docPlan.filename}`);
      
    } catch (error) {
      info(`✗ Failed to generate ${docPlan.filename}: ${error.message}`);
    }
  }
  
  return {
    documents,
    artifacts,
    config
  };
}

async function generateDocument(docPlan, context) {
  const { key } = docPlan;
  const { scanResult, config, aiContext, moduleContext, flows, diffData } = context;
  
  switch (key) {
    case "executive_summary":
      return await generateExecutiveSummary(aiContext);
      
    case "system_overview":
      return await generateSystemOverview(aiContext);
      
    case "business_domains":
      return await generateBusinessDomains(aiContext);
      
    case "architecture_overview":
      return await generateArchitectureOverview(aiContext);
      
    case "module_catalog":
      // Hybrid: deterministic skeleton + AI enhancement (for now, just deterministic)
      return renderModuleCatalogOriginal(config, scanResult);
      
    case "route_map":
      // Hybrid: deterministic skeleton + AI enhancement (for now, just deterministic)
      return renderRouteMapOriginal(config, scanResult);
      
    case "api_surface":
      // Hybrid: deterministic skeleton + AI enhancement (for now, just deterministic)
      return renderApiSurfaceOriginal(config, scanResult);
      
    case "data_flows":
      return await generateDataFlows(flows, aiContext);
      
    case "change_impact":
      if (!diffData) {
        return "# Change Impact\n\nNo changes detected.";
      }
      return renderArchitectureDiff(diffData);
      
    case "system_map":
      // Hybrid: deterministic diagram + AI explanation (for now, just diagram)
      return renderSystemMap(scanResult, config);
      
    case "developer_onboarding":
      return await generateDeveloperOnboarding(aiContext);
      
    default:
      throw new Error(`Unknown document type: ${key}`);
  }
}
