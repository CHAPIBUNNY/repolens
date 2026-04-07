import fs from "node:fs/promises";
import path from "node:path";
import { info } from "../utils/logger.js";

function outputDir(cfg) {
  return path.join(cfg.__repoRoot, ".repolens");
}

function pageFileName(key) {
  const mapping = {
    executive_summary: "executive_summary.md",
    system_overview: "system_overview.md",
    business_domains: "business_domains.md",
    architecture_overview: "architecture_overview.md",
    module_catalog: "module_catalog.md",
    api_surface: "api_surface.md",
    data_flows: "data_flows.md",
    arch_diff: "architecture_diff.md",
    route_map: "route_map.md",
    system_map: "system_map.md",
    developer_onboarding: "developer_onboarding.md",
    graphql_schema: "graphql_schema.md",
    type_graph: "type_graph.md",
    dependency_graph: "dependency_graph.md",
    architecture_drift: "architecture_drift.md",
    security_hotspots: "security_hotspots.md",
    code_health: "code_health.md"
  };

  return mapping[key] || `${key}.md`;
}

export async function publishToMarkdown(cfg, renderedPages) {
  const dir = outputDir(cfg);
  await fs.mkdir(dir, { recursive: true });

  for (const [key, markdown] of Object.entries(renderedPages)) {
    const filePath = path.join(dir, pageFileName(key));
    await fs.writeFile(filePath, markdown, "utf8");
  }

  info(`markdown docs written to ${dir}`);
}