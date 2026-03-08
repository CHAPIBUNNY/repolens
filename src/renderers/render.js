export function renderSystemOverview(cfg, scan) {
  const notes = [];
  
  // Generate meaningful notes based on detected metadata
  if (scan.metadata?.frameworks?.length) {
    notes.push(`**Tech Stack**: ${scan.metadata.frameworks.join(", ")}`);
  }
  
  if (scan.metadata?.languages?.size) {
    notes.push(`**Languages**: ${[...scan.metadata.languages].join(", ")}`);
  }
  
  if (scan.metadata?.buildTools?.length) {
    notes.push(`**Build Tools**: ${scan.metadata.buildTools.join(", ")}`);
  }
  
  if (scan.metadata?.testFrameworks?.length) {
    notes.push(`**Testing**: ${scan.metadata.testFrameworks.join(", ")}`);
  }
  
  // Add architectural insights
  if (scan.modules.length > 50) {
    notes.push(`**Architecture**: Large modular codebase with ${scan.modules.length} identified modules`);
  } else if (scan.modules.length > 20) {
    notes.push(`**Architecture**: Medium-sized modular structure with ${scan.modules.length} modules`);
  } else if (scan.modules.length > 0) {
    notes.push(`**Architecture**: Compact modular design with ${scan.modules.length} modules`);
  }
  
  if (scan.api?.length > 0) {
    notes.push(`**API Coverage**: ${scan.api.length} API endpoints detected`);
  }
  
  if (scan.pages?.length > 0) {
    notes.push(`**UI Pages**: ${scan.pages.length} application pages detected`);
  }
  
  // If no meaningful data, show default message
  if (notes.length === 0) {
    notes.push("This is an overview based on filesystem heuristics. Add a package.json to see framework and tooling details.");
  }
  
  return [
    `# ${cfg.project.name} — System Overview`,
    ``,
    `RepoLens generated this page from the current repository state.`,
    ``,
    `## Snapshot`,
    ``,
    `Files scanned: **${scan.filesCount}**`,
    `Modules detected: **${scan.modules.length}**`,
    `Pages detected: **${scan.pages?.length || 0}**`,
    `API route files detected: **${scan.api.length}**`,
    ``,
    `## Top Modules`,
    ``,
    ...(scan.modules.slice(0, 10).map((m) => `- \`${m.key}\` — ${m.fileCount} files`)),
    ``,
    `## Technical Profile`,
    ``,
    ...notes.map(note => note),
    ``
  ].join("\n");
}

export function renderModuleCatalog(cfg, scan) {
  const lines = [
    `# Module Catalog`,
    ``,
    `Detected modules based on configured module roots.`,
    ``
  ];

  if (!scan.modules.length) {
    lines.push(`No modules detected.`, ``);
    return lines.join("\n");
  }

  for (const module of scan.modules.slice(0, 100)) {
    lines.push(`- \`${module.key}\` — ${module.fileCount} files`);
  }

  lines.push(``, `_(Showing top 100 modules.)_`, ``);

  return lines.join("\n");
}

export function renderApiSurface(cfg, scan) {
  const lines = [
    `# API Surface`,
    ``
  ];

  if (!scan.api.length) {
    lines.push(`No Next.js API routes detected.`, ``);
    return lines.join("\n");
  }

  for (const route of scan.api) {
    lines.push(`- **${route.methods.join(", ")}** — \`${route.path}\` — \`${route.file}\``);
  }

  lines.push(``);

  return lines.join("\n");
}

export function renderRouteMap(cfg, scan) {
  const lines = [
    `# Route Map`,
    ``,
    `Detected application pages and API routes.`,
    ``
  ];

  if (scan.pages?.length) {
    lines.push(`## App Routes`, ``);

    for (const page of scan.pages.slice(0, 200)) {
      lines.push(`- \`${page.path}\` — \`${page.file}\``);
    }

    lines.push(``);
  }

  if (scan.api?.length) {
    lines.push(`## API Routes`, ``);

    for (const route of scan.api.slice(0, 200)) {
      lines.push(`- **${route.methods.join(", ")}**** \`${route.path}\` — \`${route.file}\``);
    }

    lines.push(``);
  }

  if (!scan.pages?.length && !scan.api?.length) {
    lines.push(`No routes detected.`, ``);
  }

  return lines.join("\n");
}