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

function buildModuleGraph(modules, depGraph) {
  // Create nodes with module details
  const nodes = modules.map(mod => ({
    id: sanitizeNodeId(mod.key),
    key: mod.key,
    label: normalizeLabel(mod.key),
    fileCount: mod.fileCount,
    category: categorizeModule(mod.key)
  }));

  const relationships = [];

  // Use real import edges from dependency graph when available
  if (depGraph && depGraph.edges && depGraph.edges.length > 0) {
    // Map file-level edges to module-level edges
    const moduleEdges = new Map(); // "sourceModule->targetModule" → count

    for (const edge of depGraph.edges) {
      const sourceModule = findModuleForFile(edge.from, modules);
      const targetModule = findModuleForFile(edge.to, modules);

      if (sourceModule && targetModule && sourceModule !== targetModule) {
        const edgeKey = `${sanitizeNodeId(sourceModule)}:${sanitizeNodeId(targetModule)}`;
        moduleEdges.set(edgeKey, (moduleEdges.get(edgeKey) || 0) + 1);
      }
    }

    for (const [edgeKey, count] of moduleEdges) {
      const [fromId, toId] = edgeKey.split(":");
      const sourceNode = nodes.find(n => n.id === fromId);
      const targetNode = nodes.find(n => n.id === toId);
      if (sourceNode && targetNode) {
        relationships.push({
          from: fromId,
          to: toId,
          type: targetNode.category === "test" ? "tests" : "imports",
          weight: count
        });
      }
    }
  } else {
    // Fallback: infer relationships based on common patterns
    for (const source of nodes) {
      for (const target of nodes) {
        if (source.id === target.id) continue;

        if (source.label === "bin" || source.label.startsWith("bin/")) {
          if (target.label.startsWith("src/")) {
            relationships.push({ from: source.id, to: target.id, type: "uses" });
          }
        }

        if (target.label.startsWith("src/core")) {
          if (source.label.startsWith("src/publishers") || 
              source.label.startsWith("src/renderers") ||
              source.label.startsWith("src/delivery")) {
            relationships.push({ from: source.id, to: target.id, type: "depends-on" });
          }
        }

        if (target.label.startsWith("src/utils")) {
          if (source.label.startsWith("src/") && source.label !== target.label) {
            relationships.push({ from: source.id, to: target.id, type: "uses" });
          }
        }

        if (source.label.startsWith("tests/") || source.label.startsWith("test/")) {
          if (!target.label.startsWith("tests/") && !target.label.startsWith("test/")) {
            relationships.push({ from: source.id, to: target.id, type: "tests" });
          }
        }
      }
    }
  }

  return { nodes, relationships };
}

/**
 * Find which module a file belongs to.
 * Edge keys from the dep graph are extensionless (e.g. "src/core/config")
 * while module keys may include extensions (e.g. "src/core/config.js").
 * We try both direct match and extension-stripped match.
 */
function findModuleForFile(fileKey, modules) {
  const normalized = fileKey.replace(/\\/g, "/");
  let bestMatch = null;
  for (const mod of modules) {
    const modKey = mod.key;
    // Direct match (with or without extension)
    if (normalized === modKey || normalized === modKey.replace(/\.[^/.]+$/, "")) {
      return modKey;
    }
    // Prefix match: file is inside this module
    if (normalized.startsWith(modKey + "/") || normalized.startsWith(modKey.replace(/\.[^/.]+$/, "") + "/")) {
      if (!bestMatch || modKey.length > bestMatch.length) {
        bestMatch = modKey;
      }
    }
  }
  return bestMatch;
}

function categorizeModule(key) {
  const normalized = key.toLowerCase();
  if (normalized.includes("test") || normalized.includes("spec")) return "test";
  if (normalized.includes("core") || normalized.includes("kernel")) return "core";
  if (normalized.includes("analyz") || normalized.includes("detect") || normalized.includes("inspect")) return "analyzer";
  if (normalized.includes("render") || normalized.includes("format") || normalized.includes("template")) return "renderer";
  if (normalized.includes("publish") || normalized.includes("output")) return "publisher";
  if (normalized.includes("deliver") || normalized.includes("dispatch")) return "delivery";
  if (normalized.includes("integrat") || normalized.includes("connect") || normalized.includes("adapter")) return "integration";
  if (normalized.includes("util") || normalized.includes("helper") || normalized.includes("lib") || normalized.includes("common")) return "util";
  if (normalized.includes("ai") || normalized.includes("llm") || normalized.includes("prompt")) return "ai";
  if (normalized.includes("doc") || normalized.includes("generate")) return "docs";
  if (normalized.includes("plugin") || normalized.includes("extension")) return "plugin";
  if (normalized.includes("config") || normalized.includes("setting")) return "config";
  if (normalized.includes("cli") || normalized.includes("bin") || normalized.includes("command")) return "cli";
  if (normalized.includes("api") || normalized.includes("endpoint")) return "api";
  if (normalized.includes("component") || normalized.includes("ui")) return "ui";
  if (normalized.includes("page") || normalized.includes("route") || normalized.includes("view")) return "page";
  if (normalized.includes("store") || normalized.includes("state")) return "state";
  if (normalized.includes("middleware")) return "middleware";
  if (normalized.includes("service")) return "service";
  return "other";
}

function generateUnicodeArchitectureDiagram(nodes, relationships) {
  // Group nodes by category
  const categories = {
    cli: { icon: "🎯", label: "CLI Entry", nodes: [] },
    core: { icon: "⚙️", label: "Core Logic", nodes: [] },
    config: { icon: "🔧", label: "Configuration", nodes: [] },
    analyzer: { icon: "🔍", label: "Analysis", nodes: [] },
    ai: { icon: "🤖", label: "AI / ML", nodes: [] },
    docs: { icon: "📝", label: "Documentation", nodes: [] },
    renderer: { icon: "📋", label: "Rendering", nodes: [] },
    publisher: { icon: "📤", label: "Publishing", nodes: [] },
    delivery: { icon: "📬", label: "Delivery", nodes: [] },
    integration: { icon: "🔌", label: "Integration", nodes: [] },
    plugin: { icon: "🧩", label: "Plugins", nodes: [] },
    api: { icon: "🌐", label: "API Layer", nodes: [] },
    ui: { icon: "🖼️", label: "UI Components", nodes: [] },
    page: { icon: "📄", label: "Pages / Routes", nodes: [] },
    state: { icon: "💾", label: "State Management", nodes: [] },
    middleware: { icon: "🔀", label: "Middleware", nodes: [] },
    service: { icon: "⚡", label: "Services", nodes: [] },
    util: { icon: "🛠️", label: "Utilities", nodes: [] },
    test: { icon: "✅", label: "Testing", nodes: [] },
    other: { icon: "📦", label: "Other", nodes: [] }
  };

  // Organize nodes by category
  for (const node of nodes) {
    const category = categories[node.category] || categories.other;
    category.nodes.push(node);
  }

  const lines = [];
  lines.push("```");
  lines.push("┌─────────────────────────────────────────────────────────────┐");
  lines.push("│              🏗️  SYSTEM ARCHITECTURE MAP                    │");
  lines.push("└─────────────────────────────────────────────────────────────┘");
  lines.push("");

  // Build dependency map for annotations
  const dependencyMap = new Map();
  for (const rel of relationships) {
    if (!dependencyMap.has(rel.from)) {
      dependencyMap.set(rel.from, []);
    }
    dependencyMap.get(rel.from).push({ to: rel.to, type: rel.type });
  }

  // Render each category with its nodes
  for (const [catKey, category] of Object.entries(categories)) {
    if (category.nodes.length === 0) continue;

    lines.push(`${category.icon}  ${category.label.toUpperCase()}`);
    lines.push("│");

    category.nodes.forEach((node, idx) => {
      const isLast = idx === category.nodes.length - 1;
      const prefix = isLast ? "└──" : "├──";
      const shortLabel = node.label.split('/').pop() || node.label;
      const fileInfo = `(${node.fileCount} file${node.fileCount !== 1 ? 's' : ''})`;
      
      lines.push(`${prefix} ${shortLabel} ${fileInfo}`);
      
      // Show dependencies for this node
      const deps = dependencyMap.get(node.id) || [];
      if (deps.length > 0) {
        const connector = isLast ? "    " : "│   ";
        deps.slice(0, 3).forEach((dep, depIdx) => {
          const depNode = nodes.find(n => n.id === dep.to);
          if (depNode) {
            const depLabel = depNode.label.split('/').pop() || depNode.label;
            const arrow = dep.type === "tests" ? "╌→" : "→";
            lines.push(`${connector}   ${arrow} ${depLabel}`);
          }
        });
        if (deps.length > 3) {
          lines.push(`${connector}   ... +${deps.length - 3} more`);
        }
      }
    });
    
    lines.push("│");
  }

  lines.push("");
  lines.push("Legend:");
  lines.push("  →  imports / depends on");
  lines.push("  ╌→ tests");
  lines.push("```");
  
  return lines.join("\n");
}

export function renderSystemMap(scan, config, depGraph) {
  const modules = (scan.modules || []).slice(0, 30); // Limit for readability
  
  if (modules.length === 0) {
    return [
      "# 🏗️ System Map",
      "",
      "> What is this? This page shows how different parts of your codebase connect and depend on each other.",
      "",
      "No modules detected. Configure `module_roots` in `.repolens.yml` to visualize your architecture.",
      ""
    ].join("\n");
  }

  const { nodes, relationships } = buildModuleGraph(modules, depGraph);
  const architectureDiagram = generateUnicodeArchitectureDiagram(nodes, relationships);

  const sourceLabel = depGraph && depGraph.edges && depGraph.edges.length > 0
    ? "**Source:** Real import analysis"
    : "**Source:** Heuristic inference (run full publish for import-based analysis)";

  // Build markdown output
  const lines = [
    "# 🏗️ System Map",
    "",
    "> What is this? This visual diagram shows how different parts of your codebase connect to each other. Arrows indicate dependencies (which modules use which).",
    "",
    `Showing: ${nodes.length} modules and ${relationships.length} relationships`,
    "",
    sourceLabel,
    "",
    "---",
    "",
    "## Architecture Diagram",
    "",
    architectureDiagram,
    ""
  ];

  // Add key connections summary when we have relationships
  if (relationships.length > 0) {
    lines.push("---", "", "## Key Connections", "");

    // Find most-depended-on modules (highest in-degree)
    const inDegree = new Map();
    const outDegree = new Map();
    for (const rel of relationships) {
      inDegree.set(rel.to, (inDegree.get(rel.to) || 0) + (rel.weight || 1));
      outDegree.set(rel.from, (outDegree.get(rel.from) || 0) + (rel.weight || 1));
    }

    const topDeps = [...inDegree.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    if (topDeps.length > 0) {
      lines.push("**Most depended-on modules** (highest import count):", "");
      lines.push("| Module | Imported by |");
      lines.push("|--------|------------|");
      for (const [nodeId, count] of topDeps) {
        const node = nodes.find(n => n.id === nodeId);
        if (node) {
          lines.push(`| \`${node.label}\` | ${count} module${count !== 1 ? "s" : ""} |`);
        }
      }
      lines.push("");
    }

    // Find modules with highest out-degree (most dependencies)
    const topConsumers = [...outDegree.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    if (topConsumers.length > 0) {
      lines.push("**Most dependent modules** (highest dependency count):", "");
      lines.push("| Module | Depends on |");
      lines.push("|--------|-----------|");
      for (const [nodeId, count] of topConsumers) {
        const node = nodes.find(n => n.id === nodeId);
        if (node) {
          lines.push(`| \`${node.label}\` | ${count} module${count !== 1 ? "s" : ""} |`);
        }
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}