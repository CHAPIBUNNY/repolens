// Write generated documentation set to disk

import fs from "node:fs/promises";
import path from "node:path";
import { info } from "../utils/logger.js";

export async function writeDocumentSet(docSet, targetDir = process.cwd()) {
  const { documents, artifacts, config } = docSet;
  
  // Determine output directory
  const outputDir = path.join(
    targetDir, 
    config.documentation?.output_dir || ".repolens"
  );
  
  // Create output directory
  await fs.mkdir(outputDir, { recursive: true });
  
  info(`Writing documentation to ${outputDir}`);
  
  // Write each document
  for (const doc of documents) {
    const filePath = path.join(outputDir, doc.filename);
    await fs.writeFile(filePath, doc.content, "utf8");
    info(`✓ Wrote ${doc.filename}`);
  }
  
  // Write artifacts if enabled
  if (config.documentation?.include_artifacts !== false) {
    const artifactsDir = path.join(outputDir, "artifacts");
    await fs.mkdir(artifactsDir, { recursive: true });
    
    // Write AI context
    await fs.writeFile(
      path.join(artifactsDir, "ai-context.json"),
      JSON.stringify(artifacts.context, null, 2),
      "utf8"
    );
    
    // Write module context
    await fs.writeFile(
      path.join(artifactsDir, "modules.json"),
      JSON.stringify(artifacts.modules, null, 2),
      "utf8"
    );
    
    // Write flows
    await fs.writeFile(
      path.join(artifactsDir, "flows.json"),
      JSON.stringify(artifacts.flows, null, 2),
      "utf8"
    );
    
    info(`✓ Wrote artifacts to artifacts/`);
  }
  
  info(`Documentation written successfully to ${outputDir}`);
  
  return {
    outputDir,
    documentCount: documents.length,
    files: documents.map(d => d.filename)
  };
}

export async function readPreviousDocumentSet(targetDir = process.cwd(), config) {
  const outputDir = path.join(
    targetDir,
    config.documentation?.output_dir || ".repolens"
  );
  
  try {
    const artifactsDir = path.join(outputDir, "artifacts");
    
    const contextData = await fs.readFile(
      path.join(artifactsDir, "ai-context.json"),
      "utf8"
    );
    
    return JSON.parse(contextData);
    
  } catch (error) {
    return null;
  }
}
