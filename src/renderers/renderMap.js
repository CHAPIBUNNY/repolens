function sanitizeNodeId(value) {
  return value.replace(/[^a-zA-Z0-9_]/g, "_");
}

function normalizeLabel(value) {
  return value
    .replace(/^src\//, "")
    .replace(/^app\/\((.*?)\)/, "app/$1")
    .replace(/\/\((.*?)\)/g, "/$1")
    .replace(/\/+/g, "/")
    .toLowerCase();
}

function groupModules(modules) {
  const groups = {
    app: [],
    components: [],
    lib: [],
    hooks: [],
    store: [],
    other: []
  };

  for (const module of modules) {
    const label = normalizeLabel(module.key);

    if (label.startsWith("app/")) groups.app.push(label);
    else if (label.startsWith("components/")) groups.components.push(label);
    else if (label.startsWith("lib/")) groups.lib.push(label);
    else if (label.startsWith("hooks/")) groups.hooks.push(label);
    else if (label.startsWith("store/")) groups.store.push(label);
    else groups.other.push(label);
  }

  return groups;
}

export function renderSystemMap(scan) {
  const modules = (scan.modules || []).slice(0, 50);
  const groups = groupModules(modules);

  // Build Mermaid code
  const mermaidLines = ["flowchart TD"];
  const order = ["app", "components", "lib", "hooks", "store", "other"];

  for (const groupName of order) {
    const items = groups[groupName];
    if (!items.length) continue;

    const subgraphId = sanitizeNodeId(groupName);
    mermaidLines.push(`  subgraph ${subgraphId}["${groupName}"]`);

    for (const label of items) {
      const id = sanitizeNodeId(label);
      mermaidLines.push(`    ${id}["${label}"]`);
    }

    mermaidLines.push("  end");
  }

  const mermaidCode = mermaidLines.join("\n");

  // Build markdown output
  const lines = [
    "# System Map",
    "",
    "Generated Mermaid diagram from detected modules.",
    "",
    "```mermaid",
    mermaidCode,
    "```",
    ""
  ];

  if (!modules.length) {
    lines.push("No modules detected.", "");
  }

  const markdown = lines.join("\n");
  
  // Return both markdown and raw mermaid for flexible rendering
  return {
    markdown,
    mermaid: modules.length > 0 ? mermaidCode : null
  };
}