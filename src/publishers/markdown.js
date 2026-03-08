import fs from "node:fs/promises";
import path from "node:path";
import { info } from "../utils/logger.js";
import { renderMermaidToSvg } from "../utils/mermaid.js";

function outputDir(cfg) {
  return path.join(cfg.__repoRoot, ".repolens");
}

function pageFileName(key) {
  const mapping = {
    system_overview: "system_overview.md",
    module_catalog: "module_catalog.md",
    api_surface: "api_surface.md",
    arch_diff: "architecture_diff.md",
    route_map: "route_map.md",
    system_map: "system_map.md"
  };

  return mapping[key] || `${key}.md`;
}

export async function publishToMarkdown(cfg, renderedPages) {
  const dir = outputDir(cfg);
  await fs.mkdir(dir, { recursive: true });

  for (const [key, content] of Object.entries(renderedPages)) {
    const filePath = path.join(dir, pageFileName(key));
    
    // Handle both string content and object with {markdown, mermaid}
    if (typeof content === 'object' && content.mermaid) {
      // Generate SVG diagram
      const svgPath = path.join(dir, "diagrams", `${key}.svg`);
      await renderMermaidToSvg(content.mermaid, svgPath);
      
      // Append reference to SVG in markdown
      const markdownWithDiagram = content.markdown + 
        `\n\n![System Diagram](./diagrams/${key}.svg)\n\n` +
        `*Visual diagram generated from architecture scan*\n`;
      
      await fs.writeFile(filePath, markdownWithDiagram, "utf8");
    } else {
      const markdown = typeof content === 'string' ? content : content.markdown;
      await fs.writeFile(filePath, markdown, "utf8");
    }
  }

  info(`markdown docs written to ${dir}`);
}