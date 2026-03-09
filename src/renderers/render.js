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
    `**What is this?** This page provides a high-level snapshot of your codebase structure, showing what technologies you're using and how your code is organized.`,
    ``,
    `📊 **Last Updated**: ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`,
    ``,
    `---`,
    ``,
    `## 📸 Quick Stats`,
    ``,
    `Here's what we found in your repository:`,
    ``,
    `- **${scan.filesCount} files** scanned across your codebase`,
    `- **${scan.modules.length} modules** (major code sections) detected`,
    `- **${scan.pages?.length || 0} pages** in your application`,
    `- **${scan.api.length} API endpoints** for backend functionality`,
    ``,
    `## 📦 Largest Modules`,
    ``,
    `These are your biggest code modules (folders with the most files):`,
    ``,
    ...(scan.modules.slice(0, 10).map((m) => `- **\`${m.key}\`** contains ${m.fileCount} files`)),
    ``,
    `## 🔧 Technology Stack`,
    ``,
    `Your project uses these technologies:`,
    ``,
    ...notes.map(note => note),
    ``,
    `---`,
    ``,
    `💡 **Tip**: This documentation auto-updates on every push to your main branch!`,
    ``
  ].join("\n");
}

export function renderModuleCatalog(cfg, scan) {
  const lines = [
    `# 📁 Module Catalog`,
    ``,
    `**What is this?** This is a complete inventory of all code modules (folders) in your project, showing how your codebase is organized.`,
    ``,
    `**Total modules found**: ${scan.modules.length}`,
    ``,
    `---`,
    ``,
    `## All Modules`,
    ``,
    `Each module represents a major section of your codebase. The file count shows relative size:`,
    ``
  ];

  if (!scan.modules.length) {
    lines.push(`No modules detected. Configure \`module_roots\` in \`.repolens.yml\` to organize your code.`, ``);
    return lines.join("\n");
  }

  for (const module of scan.modules.slice(0, 100)) {
    lines.push(`- **\`${module.key}\`** — ${module.fileCount} files`);
  }

  if (scan.modules.length > 100) {
    lines.push(``, `_(Showing top 100 of ${scan.modules.length} modules)_`);
  }

  lines.push(``, `---`, ``, `💡 **Tip**: Click any module name to see its location in your codebase.`, ``);

  return lines.join("\n");
}

export function renderApiSurface(cfg, scan) {
  const lines = [
    `# 🔌 API Surface`,
    ``,
    `**What is this?** This page lists all the API endpoints (backend services) your application provides. Each endpoint handles specific HTTP requests like GET, POST, PUT, DELETE.`,
    ``,
    `**Total endpoints**: ${scan.api.length}`,
    ``,
    `---`,
    ``
  ];

  if (!scan.api.length) {
    lines.push(
      `## No API Routes Detected`,
      ``,
      `Your project doesn't appear to have Next.js API routes yet. API routes provide backend functionality like:`,
      ``,
      `- Fetching data from databases`,
      `- Processing form submissions`,
      `- Authenticating users`,
      `- Integrating with third-party services`,
      ``,
      `To add API routes, create files in \`pages/api/\` or \`app/*/route.ts\`.`,
      ``
    );
    return lines.join("\n");
  }

  lines.push(
    `## Detected Endpoints`,
    ``,
    `Each line shows: **HTTP Method** → API Path → Implementation File`,
    ``
  );

  for (const route of scan.api) {
    lines.push(`- **${route.methods.join(", ")}** \`${route.path}\` • \`${route.file}\``);
  }

  lines.push(
    ``,
    `---`,
    ``,
    `💡 **Tip**: HTTP methods indicate the type of operation:`,
    `- **GET**: Retrieve data`,
    `- **POST**: Create new data`,
    `- **PUT/PATCH**: Update existing data`,
    `- **DELETE**: Remove data`,
    ``
  );

  return lines.join("\n");
}

export function renderRouteMap(cfg, scan) {
  const lines = [
    `# 🗺️ Route Map`,
    ``,
    `**What is this?** This page shows all the pages (URLs) users can visit in your application, plus the backend API endpoints that power them.`,
    ``,
    `---`,
    ``
  ];

  if (scan.pages?.length) {
    lines.push(
      `## 🏠 Application Pages (${scan.pages.length})`,
      ``,
      `These are the user-facing pages in your app:`,
      ``
    );

    for (const page of scan.pages.slice(0, 200)) {
      lines.push(`- **\`${page.path}\`** • \`${page.file}\``);
    }

    lines.push(``);
  }

  if (scan.api?.length) {
    lines.push(
      `## 🔌 API Endpoints (${scan.api.length})`,
      ``,
      `These are backend services that handle data operations:`,
      ``
    );

    for (const route of scan.api.slice(0, 200)) {
      lines.push(`- **${route.methods.join(", ")}** \`${route.path}\` • \`${route.file}\``);
    }

    lines.push(``);
  }

  if (!scan.pages?.length && !scan.api?.length) {
    lines.push(
      `## No Routes Detected`,
      ``,
      `RepoLens looks for Next.js pages and API routes. If you're using a different framework, routes might not be auto-detected yet.`,
      ``
    );
  }

  lines.push(
    `---`,
    ``,
    `💡 **Tip**: URL paths starting with \`/api/\` are backend endpoints, others are user-facing pages.`,
    ``
  );

  return lines.join("\n");
}