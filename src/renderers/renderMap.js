function sanitizeNodeId(value) {
  return value.replace(/[^a-zA-Z0-9_]/g, "_");
}

function normalizeLabel(value) {
  return value
    .replace(/^src\//, "")
    .replace(/^app\/\((.*?)\)/, "app/$1")
    .replace(/\/\((.*?)\)/g, "/$1")
    .replace(/\/+/g, "/");
}

function buildModuleGraph(modules) {
  // Create nodes with module details
  const nodes = modules.map(mod => ({
    id: sanitizeNodeId(mod.key),
    key: mod.key,
    label: normalizeLabel(mod.key),
    fileCount: mod.fileCount,
    category: categorizeModule(mod.key)
  }));

  // Infer relationships based on common patterns
  const relationships = [];

  for (const source of nodes) {
    for (const target of nodes) {
      if (source.id === target.id) continue;

      // CLI imports from core, publishers, renderers, utils
      if (source.label === "bin" || source.label.startsWith("bin/")) {
        if (target.label.startsWith("src/")) {
          relationships.push({
            from: source.id,
            to: target.id,
            type: "uses"
          });
        }
      }

      // Core modules are foundational - others depend on them
      if (target.label.startsWith("src/core")) {
        if (source.label.startsWith("src/publishers") || 
            source.label.startsWith("src/renderers") ||
            source.label.startsWith("src/delivery")) {
          relationships.push({
            from: source.id,
            to: target.id,
            type: "depends-on"
          });
        }
      }

      // Publishers use renderers
      if (source.label.startsWith("src/publishers") && target.label.startsWith("src/renderers")) {
        relationships.push({
          from: source.id,
          to: target.id,
          type: "renders"
        });
      }

      // Everything uses utils
      if (target.label.startsWith("src/utils")) {
        if (source.label.startsWith("src/") && source.label !== target.label) {
          relationships.push({
            from: source.id,
            to: target.id,
            type: "uses"
          });
        }
      }

      // Delivery uses publishers
      if (source.label.startsWith("src/delivery") && target.label.startsWith("src/publishers")) {
        relationships.push({
          from: source.id,
            to: target.id,
          type: "publishes-via"
        });
      }

      // Tests test everything
      if (source.label.startsWith("tests/") || source.label.startsWith("test/")) {
        if (!target.label.startsWith("tests/") && !target.label.startsWith("test/")) {
          relationships.push({
            from: source.id,
            to: target.id,
            type: "tests"
          });
        }
      }
    }
  }

  return { nodes, relationships };
}

function categorizeModule(key) {
  const normalized = key.toLowerCase();
  if (normalized.includes("core")) return "core";
  if (normalized.includes("publisher")) return "integration";
  if (normalized.includes("renderer")) return "business";
  if (normalized.includes("delivery")) return "integration";
  if (normalized.includes("util")) return "util";
  if (normalized.includes("test")) return "test";
  if (normalized.includes("bin")) return "cli";
  return "other";
}

function generateModuleDiagram(nodes, relationships) {
  const mermaidLines = [
    "graph LR",
    "  %% Module Dependency Graph",
    ""
  ];

  // Group nodes by category for better layout
  const categories = {
    cli: { color: "#E1BEE7", label: "CLI Entry" },
    core: { color: "#FFF9C4", label: "Core Logic" },
    business: { color: "#E8F5E9", label: "Business Logic" },
    integration: { color: "#E0F2F1", label: "Integration" },
    util: { color: "#ECEFF1", label: "Utilities" },
    test: { color: "#FFCCBC", label: "Testing" },
    other: { color: "#F5F5F5", label: "Other" }
  };

  // Create nodes with details
  for (const node of nodes) {
    const shortLabel = node.label.split('/').pop() || node.label;
    const detail = `${node.fileCount} file${node.fileCount !== 1 ? 's' : ''}`;
    const config = categories[node.category] || categories.other;
    
    mermaidLines.push(`  ${node.id}["<b>${shortLabel}</b><br/><small>${detail}</small>"]`);
    mermaidLines.push(`  style ${node.id} fill:${config.color},stroke:#333,stroke-width:2px`);
  }

  mermaidLines.push("");
  mermaidLines.push("  %% Dependencies");

  // Deduplicate relationships
  const seen = new Set();
  const uniqueRelationships = relationships.filter(rel => {
    const key = `${rel.from}-${rel.to}-${rel.type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Draw relationships
  for (const rel of uniqueRelationships) {
    const arrow = rel.type === "tests" ? "-.->": "-->";
    const label = rel.type.replace(/-/g, " ");
    mermaidLines.push(`  ${rel.from} ${arrow}|${label}| ${rel.to}`);
  }

  return mermaidLines.join("\n");
}

export function renderSystemMap(scan) {
  const modules = (scan.modules || []).slice(0, 30); // Limit for readability
  
  if (modules.length === 0) {
    const markdown = [
      "# 🏗️ System Map",
      "",
      "> **What is this?** This page shows how different parts of your codebase connect and depend on each other.",
      "",
      "No modules detected. Configure `module_roots` in `.repolens.yml` to visualize your architecture.",
      ""
    ].join("\n");
    
    return { markdown, mermaid: null };
  }

  const { nodes, relationships } = buildModuleGraph(modules);
  const mermaidCode = generateModuleDiagram(nodes, relationships);

  // Build markdown output
  const lines = [
    "# 🏗️ System Map",
    "",
    "> **What is this?** This visual diagram shows how different parts of your codebase connect to each other. Arrows indicate dependencies (which modules use which).",
    "",
    `**Showing**: ${nodes.length} modules and ${relationships.length} relationships`,
    "",
    "---",
    "",
    "## Architecture Diagram",
    "",
    "Below is an interactive diagram of your system architecture:",
    ""
  ];

  const markdown = lines.join("\n");
  
  return {
    markdown,
    mermaid: mermaidCode
  };
}