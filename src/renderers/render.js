export function renderSystemOverview(cfg, scan) {
  const projectName = cfg.project?.name || "Project";
  const date = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  const lines = [
    `# ${projectName} — System Overview`,
    ``,
    `> This page provides a high-level snapshot of the codebase, including its technology stack, structural composition, and scale. It is generated automatically by RepoLens and updated on every publish.`,
    ``,
    `**Last Updated:** ${date}`,
    ``,
    `---`,
    ``,
    `## Repository at a Glance`,
    ``,
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Files scanned | ${scan.filesCount} |`,
    `| Modules detected | ${scan.modules.length} |`,
    `| Application pages | ${scan.pages?.length || 0} |`,
    `| API endpoints | ${scan.api.length} |`,
    ``
  ];

  // Technology stack as a proper section with prose
  const frameworks = scan.metadata?.frameworks || [];
  const languages = scan.metadata?.languages ? [...scan.metadata.languages] : [];
  const buildTools = scan.metadata?.buildTools || [];
  const testFrameworks = scan.metadata?.testFrameworks || [];

  if (frameworks.length || languages.length || buildTools.length || testFrameworks.length) {
    lines.push(
      `## Technology Stack`,
      ``,
      `| Category | Technologies |`,
      `|----------|-------------|`
    );
    if (frameworks.length) lines.push(`| Frameworks | ${frameworks.join(", ")} |`);
    if (languages.length) lines.push(`| Languages | ${languages.join(", ")} |`);
    if (buildTools.length) lines.push(`| Build Tools | ${buildTools.join(", ")} |`);
    if (testFrameworks.length) lines.push(`| Testing | ${testFrameworks.join(", ")} |`);
    lines.push(``);
  }

  // Architecture summary as descriptive prose
  if (scan.modules.length > 0) {
    let sizeDesc;
    if (scan.modules.length > 50) sizeDesc = "a large, modular codebase";
    else if (scan.modules.length > 20) sizeDesc = "a medium-sized modular codebase";
    else sizeDesc = "a focused, compact codebase";

    lines.push(
      `## Architecture Summary`,
      ``,
      `The repository is organized as ${sizeDesc} with **${scan.modules.length} modules** spanning **${scan.filesCount} files**. `
      + (scan.api.length > 0 ? `It exposes **${scan.api.length} API endpoint${scan.api.length === 1 ? "" : "s"}** ` : "")
      + (scan.pages?.length > 0 ? `and serves **${scan.pages.length} application page${scan.pages.length === 1 ? "" : "s"}**. ` : ". ")
      + `The largest modules are listed below, ranked by file count.`,
      ``
    );
  }

  // Largest modules as a table instead of bullets
  const topModules = scan.modules.slice(0, 10);
  if (topModules.length > 0) {
    lines.push(
      `## Largest Modules`,
      ``,
      `| Module | Files | Description |`,
      `|--------|-------|-------------|`
    );
    for (const m of topModules) {
      const desc = describeModule(m.key);
      lines.push(`| \`${m.key}\` | ${m.fileCount} | ${desc} |`);
    }
    lines.push(``);
  }

  lines.push(
    `---`,
    ``,
    `*This documentation is generated automatically by [RepoLens](https://github.com/CHAPIBUNNY/repolens) and refreshes on every push to the main branch.*`,
    ``
  );

  return lines.join("\n");
}

function describeModule(key) {
  const normalized = key.toLowerCase();
  if (normalized.includes("core")) return "Core business logic and shared foundations";
  if (normalized.includes("util")) return "Shared utilities and helper functions";
  if (normalized.includes("api")) return "API route handlers and endpoint definitions";
  if (normalized.includes("component")) return "Reusable UI components";
  if (normalized.includes("hook")) return "Custom React hooks";
  if (normalized.includes("page")) return "Application page components";
  if (normalized.includes("lib")) return "Library code and third-party integrations";
  if (normalized.includes("service")) return "Service layer and external integrations";
  if (normalized.includes("model")) return "Data models and schema definitions";
  if (normalized.includes("store") || normalized.includes("state")) return "State management";
  if (normalized.includes("config")) return "Configuration and settings";
  if (normalized.includes("test")) return "Test suites and fixtures";
  if (normalized.includes("style") || normalized.includes("css")) return "Styling and design tokens";
  if (normalized.includes("type")) return "Type definitions and interfaces";
  if (normalized.includes("middleware")) return "Request middleware and interceptors";
  if (normalized.includes("auth")) return "Authentication and authorization";
  if (normalized.includes("render")) return "Rendering logic and output formatters";
  if (normalized.includes("publish")) return "Publishing and delivery integrations";
  if (normalized.includes("analyz")) return "Code analysis and intelligence";
  if (normalized.includes("delivery")) return "Content delivery and distribution";
  if (normalized.includes("integrat")) return "Third-party service integrations";
  if (normalized.includes("doc")) return "Documentation generation";
  if (normalized.includes("bin") || normalized.includes("cli")) return "CLI entry point and commands";
  return "Application module";
}

export function renderModuleCatalog(cfg, scan) {
  const lines = [
    `# Module Catalog`,
    ``,
    `> A complete inventory of all code modules in the repository, organized by location and size. Each module represents a distinct area of responsibility within the codebase.`,
    ``,
    `**Total modules:** ${scan.modules.length}`,
    ``,
    `---`,
    ``
  ];

  if (!scan.modules.length) {
    lines.push(
      `No modules detected. Configure \`module_roots\` in \`.repolens.yml\` to define the top-level directories that organize your source code.`,
      ``
    );
    return lines.join("\n");
  }

  lines.push(
    `## Module Inventory`,
    ``,
    `| Module | Files | Role |`,
    `|--------|-------|------|`
  );

  for (const module of scan.modules.slice(0, 100)) {
    const desc = describeModule(module.key);
    lines.push(`| \`${module.key}\` | ${module.fileCount} | ${desc} |`);
  }

  if (scan.modules.length > 100) {
    lines.push(``, `*Showing the top 100 of ${scan.modules.length} modules.*`);
  }

  lines.push(
    ``,
    `---`,
    ``,
    `*Module detection is based on the \`module_roots\` setting in your RepoLens configuration. Adjust this setting to change how modules are grouped.*`,
    ``
  );

  return lines.join("\n");
}

export function renderApiSurface(cfg, scan) {
  const lines = [
    `# API Surface`,
    ``,
    `> This page documents both the API endpoints the application exposes and the external services it integrates with. Use it as a reference for understanding the system's interfaces.`,
    ``,
    `---`,
    ``
  ];

  // Section 1: Internal API Endpoints
  lines.push(
    `## Internal API Endpoints`,
    ``,
    `These are the backend services the application provides to handle incoming requests.`,
    ``
  );

  if (!scan.api.length) {
    lines.push(
      `No API routes were detected in this scan. If your project uses a routing framework (Express, Fastify, NestJS, etc.), ensure the relevant directories are included in your \`scan.include\` patterns.`,
      ``
    );
  } else {
    lines.push(
      `**Total endpoints:** ${scan.api.length}`,
      ``,
      `| Method | Path | Implementation |`,
      `|--------|------|----------------|`
    );

    for (const route of scan.api) {
      lines.push(`| ${route.methods.join(", ")} | \`${route.path}\` | \`${route.file}\` |`);
    }

    lines.push(``);
  }

  // Section 2: External API Integrations
  lines.push(
    `---`,
    ``,
    `## External API Integrations`,
    ``,
    `Third-party services the application connects to, grouped by category.`,
    ``
  );

  if (!scan.externalApis || scan.externalApis.length === 0) {
    lines.push(
      `No external API integrations were detected. This section populates automatically when RepoLens identifies SDK imports or API client usage in your codebase.`,
      ``
    );
  } else {
    const byCategory = {};
    for (const api of scan.externalApis) {
      if (!byCategory[api.category]) byCategory[api.category] = [];
      byCategory[api.category].push(api);
    }

    for (const [category, apis] of Object.entries(byCategory)) {
      lines.push(`### ${category}`, ``);
      lines.push(`| Service | Detected In |`);
      lines.push(`|---------|-------------|`);
      for (const api of apis) {
        lines.push(`| ${api.name} | \`${api.detectedIn}\` |`);
      }
      lines.push(``);
    }
  }

  lines.push(
    `---`,
    ``,
    `*HTTP method reference — GET: retrieve data, POST: create, PUT/PATCH: update, DELETE: remove.*`,
    ``
  );

  return lines.join("\n");
}

export function renderRouteMap(cfg, scan) {
  const lines = [
    `# Route Map`,
    ``,
    `> A complete listing of user-facing pages and backend API endpoints. This map shows every URL a user or client can interact with, along with the source file that handles each route.`,
    ``,
    `---`,
    ``
  ];

  if (scan.pages?.length) {
    lines.push(
      `## Application Pages (${scan.pages.length})`,
      ``,
      `These are the user-facing views in the application. Each row maps a URL path to its implementing component.`,
      ``,
      `| Path | Source File |`,
      `|------|------------|`
    );

    for (const page of scan.pages.slice(0, 200)) {
      lines.push(`| \`${page.path}\` | \`${page.file}\` |`);
    }

    lines.push(``);
  }

  if (scan.api?.length) {
    lines.push(
      `## API Endpoints (${scan.api.length})`,
      ``,
      `Backend services that handle data operations and business logic.`,
      ``,
      `| Method | Path | Source File |`,
      `|--------|------|------------|`
    );

    for (const route of scan.api.slice(0, 200)) {
      lines.push(`| ${route.methods.join(", ")} | \`${route.path}\` | \`${route.file}\` |`);
    }

    lines.push(``);
  }

  if (!scan.pages?.length && !scan.api?.length) {
    lines.push(
      `## Route Detection`,
      ``,
      `No routes were auto-detected in this scan. RepoLens currently supports:`,
      ``,
      `| Framework | Pattern | Status |`,
      `|-----------|---------|--------|`,
      `| Next.js | \`pages/\` and \`app/\` directories | Supported |`,
      `| Next.js API | \`pages/api/\` and App Router | Supported |`,
      `| Express.js | \`app.get\`, \`router.post\`, etc. | Supported |`,
      `| React Router | \`<Route>\` components | Supported |`,
      `| Vue Router | \`routes\` array definitions | Supported |`,
      ``,
      `If your project uses a different routing framework, open an issue at [github.com/CHAPIBUNNY/repolens](https://github.com/CHAPIBUNNY/repolens/issues) to request support.`,
      ``
    );
  }

  lines.push(
    `---`,
    ``,
    `*Paths starting with \`/api/\` are backend endpoints; all others are user-facing pages.*`,
    ``
  );

  return lines.join("\n");
}