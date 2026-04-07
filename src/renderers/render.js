import { computeModuleLevelMetrics, describeModuleDepRole } from "../analyzers/context-builder.js";

export function renderSystemOverview(cfg, scan, depGraph = null) {
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
    ...(scan.pages?.length ? [`| Application pages | ${scan.pages.length} |`] : []),
    ...(scan.api.length ? [`| API endpoints | ${scan.api.length} |`] : []),
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
    lines.push(`| Frameworks | ${frameworks.join(", ") || 'N/A'} |`);
    if (languages.length) lines.push(`| Languages | ${languages.join(", ")} |`);
    lines.push(`| Build Tools | ${buildTools.join(", ") || 'N/A'} |`);
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
      + (scan.api.length > 0 ? `It exposes **${scan.api.length} API endpoint${scan.api.length === 1 ? "" : "s"}**. ` : "")
      + (scan.pages?.length > 0 ? `It serves **${scan.pages.length} application page${scan.pages.length === 1 ? "" : "s"}**. ` : "")
      + `The largest modules are listed below, ranked by file count.`,
      ``
    );
  }

  // Largest modules as a table instead of bullets
  const topModules = scan.modules.slice(0, 10);
  const moduleMetrics = computeModuleLevelMetrics(depGraph, scan.modules);
  if (topModules.length > 0) {
    lines.push(
      `## Largest Modules`,
      ``,
      `| Module | Files | Description |`,
      `|--------|-------|-------------|`
    );
    for (const m of topModules) {
      const depRole = describeModuleDepRole(m.key, moduleMetrics);
      const desc = describeModule(m.key, depRole);
      lines.push(`| \`${m.key}\` | ${m.fileCount} | ${desc} |`);
    }
    lines.push(``);
  }

  // Monorepo workspace info
  if (scan.monorepo?.isMonorepo && scan.monorepo.packages.length > 0) {
    lines.push(
      `## Monorepo Workspaces`,
      ``,
      `This repository is organized as a **monorepo** using **${scan.monorepo.tool}** with **${scan.monorepo.packages.length} packages**.`,
      ``,
      `| Package | Path | Version |`,
      `|---------|------|---------|`
    );
    for (const pkg of scan.monorepo.packages.slice(0, 20)) {
      lines.push(`| ${pkg.name} | \`${pkg.path}\` | ${pkg.version || "—"} |`);
    }
    if (scan.monorepo.packages.length > 20) {
      lines.push(`| ... | *${scan.monorepo.packages.length - 20} more packages* | |`);
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

function describeModule(key, depRole = null) {
  const normalized = key.toLowerCase();
  // Base description from path keywords
  let base;
  if (normalized.includes("core")) base = "Core business logic and shared foundations";
  else if (normalized.includes("util")) base = "Shared utilities and helper functions";
  else if (normalized.includes("api")) base = "API route handlers and endpoint definitions";
  else if (normalized.includes("component")) base = "Reusable UI components";
  else if (normalized.includes("hook")) base = "Custom React hooks";
  else if (normalized.includes("page")) base = "Application page components";
  else if (normalized.includes("lib")) base = "Library code and third-party integrations";
  else if (normalized.includes("service")) base = "Service layer and external integrations";
  else if (normalized.includes("model")) base = "Data models and schema definitions";
  else if (normalized.includes("store") || normalized.includes("state")) base = "State management";
  else if (normalized.includes("config")) base = "Configuration and settings";
  else if (normalized.includes("test")) base = "Test suites and fixtures";
  else if (normalized.includes("style") || normalized.includes("css")) base = "Styling and design tokens";
  else if (normalized.includes("type")) base = "Type definitions and interfaces";
  else if (normalized.includes("middleware")) base = "Request middleware and interceptors";
  else if (normalized.includes("auth")) base = "Authentication and authorization";
  else if (normalized.includes("render")) base = "Rendering logic and output formatters";
  else if (normalized.includes("publish")) base = "Publishing and delivery integrations";
  else if (normalized.includes("analyz")) base = "Code analysis and intelligence";
  else if (normalized.includes("delivery")) base = "Content delivery and distribution";
  else if (normalized.includes("integrat")) base = "Third-party service integrations";
  else if (normalized.includes("doc")) base = "Documentation generation";
  else if (normalized.includes("bin") || normalized.includes("cli")) base = "CLI entry point and commands";
  else if (normalized.includes("plugin") || normalized.includes("extension")) base = "Plugin system and extensions";
  else if (normalized.includes("prompt")) base = "Prompt engineering and templates";
  else if (normalized.includes("provider")) base = "Service provider adapters";
  else if (normalized.includes("generate") || normalized.includes("section")) base = "Content generation pipeline";
  else if (normalized.includes("ai") || normalized.includes("ml")) base = "AI and machine learning integration";
  else base = "Application module";

  // Enrich with dependency role if available
  if (depRole) {
    return `${base} · ${depRole}`;
  }
  return base;
}

export function renderModuleCatalog(cfg, scan, ownershipMap = {}, depGraph = null) {
  const hasOwnership = Object.keys(ownershipMap).length > 0;
  const moduleMetrics = computeModuleLevelMetrics(depGraph, scan.modules);
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
    ``
  );

  if (hasOwnership) {
    lines.push(
      `| Module | Files | Role | Owners |`,
      `|--------|-------|------|--------|`
    );
  } else {
    lines.push(
      `| Module | Files | Role |`,
      `|--------|-------|------|`
    );
  }

  for (const module of scan.modules.slice(0, 100)) {
    const depRole = describeModuleDepRole(module.key, moduleMetrics);
    const desc = describeModule(module.key, depRole);
    const owners = ownershipMap[module.key];
    if (hasOwnership) {
      lines.push(`| \`${module.key}\` | ${module.fileCount} | ${desc} | ${owners ? owners.join(", ") : "—"} |`);
    } else {
      lines.push(`| \`${module.key}\` | ${module.fileCount} | ${desc} |`);
    }
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

export function renderApiSurface(cfg, scan, jsdocResult = null) {
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

  // Section 3: Documented Exports (from JSDoc analysis)
  if (jsdocResult && jsdocResult.detected && jsdocResult.exports.length > 0) {
    lines.push(
      `---`,
      ``,
      `## Documented Exports`,
      ``,
      `Exported functions with JSDoc/TSDoc documentation. Documentation coverage: **${jsdocResult.summary?.coverage || "N/A"}**`,
      ``
    );

    // Show deprecated functions first as warnings
    if (jsdocResult.deprecated && jsdocResult.deprecated.length > 0) {
      lines.push(`### ⚠️ Deprecated Functions`, ``);
      for (const dep of jsdocResult.deprecated) {
        lines.push(`- \`${dep.name}\` in \`${dep.source}\`: ${dep.reason}`);
      }
      lines.push(``);
    }

    // Group by file and show documented exports
    const documentedExports = jsdocResult.exports.filter(e => e.jsdoc);
    if (documentedExports.length > 0) {
      lines.push(`### Function Documentation`, ``);
      
      // Group by file for better organization
      const byFile = {};
      for (const exp of documentedExports) {
        if (!byFile[exp.source]) byFile[exp.source] = [];
        byFile[exp.source].push(exp);
      }

      // Show up to 30 documented functions to avoid overwhelming output
      let shown = 0;
      const maxToShow = 30;
      
      for (const [file, exports] of Object.entries(byFile)) {
        if (shown >= maxToShow) break;
        
        lines.push(`#### \`${file}\``, ``);
        
        for (const exp of exports) {
          if (shown >= maxToShow) break;
          shown++;
          
          const jsdoc = exp.jsdoc;
          const isDeprecated = jsdoc.deprecated ? " ⚠️" : "";
          
          lines.push(`**\`${exp.name}()\`**${isDeprecated}`, ``);
          
          if (jsdoc.description) {
            lines.push(jsdoc.description, ``);
          }
          
          if (jsdoc.params.length > 0) {
            lines.push(`**Parameters:**`);
            for (const param of jsdoc.params) {
              const opt = param.optional ? " *(optional)*" : "";
              lines.push(`- \`${param.name}\` (\`${param.type}\`)${opt}${param.description ? `: ${param.description}` : ""}`);
            }
            lines.push(``);
          }
          
          if (jsdoc.returns) {
            lines.push(`**Returns:** \`${jsdoc.returns.type}\`${jsdoc.returns.description ? ` — ${jsdoc.returns.description}` : ""}`, ``);
          }
          
          if (jsdoc.throws.length > 0) {
            lines.push(`**Throws:**`);
            for (const t of jsdoc.throws) {
              lines.push(`- ${t}`);
            }
            lines.push(``);
          }
        }
      }

      if (documentedExports.length > maxToShow) {
        lines.push(``, `> *Showing ${maxToShow} of ${documentedExports.length} documented exports.*`, ``);
      }
    }

    // Summary stats
    lines.push(
      `---`,
      ``,
      `**Documentation Summary:**`,
      `- Total exports: ${jsdocResult.summary?.totalExports || 0}`,
      `- Documented: ${jsdocResult.summary?.documented || 0}`,
      `- Undocumented: ${jsdocResult.summary?.undocumented || 0}`,
      `- Coverage: ${jsdocResult.summary?.coverage || "0%"}`,
      ``
    );
  }

  lines.push(
    `---`,
    ``,
    `*HTTP method reference — GET: retrieve data, POST: create, PUT/PATCH: update, DELETE: remove.*`,
    ``
  );

  return lines.join("\n");
}

export function renderRouteMap(cfg, scan, aiContext = null) {
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

    if (scan.pages.length > 200) {
      lines.push(``, `> **Note:** Showing 200 of ${scan.pages.length} pages. Configure \`scan.include\` to narrow scope.`);
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

    if (scan.api.length > 200) {
      lines.push(``, `> **Note:** Showing 200 of ${scan.api.length} API endpoints.`);
    }

    lines.push(``);
  }

  if (!scan.pages?.length && !scan.api?.length) {
    // Determine project type for context-aware messaging
    const patterns = aiContext?.patterns || [];
    const isCLI = patterns.some(p => p.toLowerCase().includes("cli"));
    const isLibrary = patterns.some(p => p.toLowerCase().includes("library") || p.toLowerCase().includes("shared"));
    const techStack = aiContext?.techStack || {};
    const hasWebFramework = (techStack.frameworks || []).some(f =>
      /next|react|vue|angular|express|fastify|hono|koa|django|flask|rails|spring/i.test(f)
    );

    lines.push(
      `## Route Detection`,
      ``
    );

    if (isCLI) {
      lines.push(
        `This project is a **CLI tool** — it does not expose HTTP routes or serve web pages. This is expected behavior, not a detection failure.`,
        ``,
        `CLI tools interact through terminal commands rather than URLs. See the **System Overview** or **Developer Onboarding** documents for command documentation.`,
        ``
      );
    } else if (isLibrary && !hasWebFramework) {
      lines.push(
        `This project is a **library/package** — it does not define its own routes or pages. Libraries are consumed by other applications that define their own routing.`,
        ``
      );
    } else {
      lines.push(
        `No routes were auto-detected in this scan. RepoLens currently supports:`,
        ``,
        `| Framework | Pattern | Status |`,
        `|-----------|---------|--------|`,
        `| Next.js | \`pages/\` and \`app/\` directories | Supported |`,
        `| Next.js API | \`pages/api/\` and App Router | Supported |`,
        `| Express.js | \`app.get\`, \`router.post\`, etc. | Supported |`,
        `| Fastify | \`fastify.get\`, \`fastify.post\`, etc. | Supported |`,
        `| Hono | \`app.get\`, \`app.post\`, etc. | Supported |`,
        `| React Router | \`<Route>\` components | Supported |`,
        `| Vue Router | \`routes\` array definitions | Supported |`,
        ``,
        `If your project uses a different routing framework, open an issue at [github.com/CHAPIBUNNY/repolens](https://github.com/CHAPIBUNNY/repolens/issues) to request support.`,
        ``
      );
    }
  }

  // Only add the route hint footer for projects that actually have routes
  if (scan.pages?.length || scan.api?.length) {
    lines.push(
      `---`,
      ``,
      `*Paths starting with \`/api/\` are backend endpoints; all others are user-facing pages.*`,
      ``
    );
  }

  return lines.join("\n");
}