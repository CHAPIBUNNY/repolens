export function renderSystemOverview(cfg, scan) {
  const notes = [];
  
  // Generate meaningful notes based on detected metadata
  if (scan.metadata?.frameworks?.length) {
    notes.push(`Tech Stack: ${scan.metadata.frameworks.join(", ")}`);
  }
  
  if (scan.metadata?.languages?.size) {
    notes.push(`Languages: ${[...scan.metadata.languages].join(", ")}`);
  }
  
  if (scan.metadata?.buildTools?.length) {
    notes.push(`Build Tools: ${scan.metadata.buildTools.join(", ")}`);
  }
  
  if (scan.metadata?.testFrameworks?.length) {
    notes.push(`Testing: ${scan.metadata.testFrameworks.join(", ")}`);
  }
  
  // Add architectural insights
  if (scan.modules.length > 50) {
    notes.push(`Architecture: Large modular codebase with ${scan.modules.length} identified modules`);
  } else if (scan.modules.length > 20) {
    notes.push(`Architecture: Medium-sized modular structure with ${scan.modules.length} modules`);
  } else if (scan.modules.length > 0) {
    notes.push(`Architecture: Compact modular design with ${scan.modules.length} modules`);
  }
  
  if (scan.api?.length > 0) {
    notes.push(`API Coverage: ${scan.api.length} API endpoints detected`);
  }
  
  if (scan.pages?.length > 0) {
    notes.push(`UI Pages: ${scan.pages.length} application pages detected`);
  }
  
  // If no meaningful data, show default message
  if (notes.length === 0) {
    notes.push("This is an overview based on filesystem heuristics. Add a package.json to see framework and tooling details.");
  }
  
  return [
    `# ${cfg.project.name} — System Overview`,
    ``,
    `\`\`\``,
    `██████╗ ███████╗██████╗  ██████╗ ██╗     ███████╗███╗   ██╗███████╗`,
    `██╔══██╗██╔════╝██╔══██╗██╔═══██╗██║     ██╔════╝████╗  ██║██╔════╝`,
    `██████╔╝█████╗  ██████╔╝██║   ██║██║     █████╗  ██╔██╗ ██║███████╗`,
    `██╔══██╗██╔══╝  ██╔═══╝ ██║   ██║██║     ██╔══╝  ██║╚██╗██║╚════██║`,
    `██║  ██║███████╗██║     ╚██████╔╝███████╗███████╗██║ ╚████║███████║`,
    `╚═╝  ╚═╝╚══════╝╚═╝      ╚═════╝ ╚══════╝╚══════╝╚═╝  ╚═══╝╚══════╝`,
    `          🔍 Repository Intelligence by RABITAI 🐰`,
    `\`\`\``,
    ``,
    `What is this? This page provides a high-level snapshot of your codebase structure, showing what technologies you're using and how your code is organized.`,
    ``,
    `📊 Last Updated: ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`,
    ``,
    `---`,
    ``,
    `## 📸 Quick Stats`,
    ``,
    `Here's what we found in your repository:`,
    ``,
    `- ${scan.filesCount} files scanned across your codebase`,
    `- ${scan.modules.length} modules (major code sections) detected`,
    `- ${scan.pages?.length || 0} pages in your application`,
    `- ${scan.api.length} API endpoints for backend functionality`,
    ``,
    `## 📦 Largest Modules`,
    ``,
    `These are your biggest code modules (folders with the most files):`,
    ``,
    ...(scan.modules.slice(0, 10).map((m) => `- \`${m.key}\` contains ${m.fileCount} files`)),
    ``,
    `## 🔧 Technology Stack`,
    ``,
    `Your project uses these technologies:`,
    ``,
    ...notes.map(note => note),
    ``,
    `---`,
    ``,
    `💡 Tip: This documentation auto-updates on every push to your main branch!`,
    ``
  ].join("\n");
}

export function renderModuleCatalog(cfg, scan) {
  const lines = [
    `# 📁 Module Catalog`,
    ``,
    `What is this? This is a complete inventory of all code modules (folders) in your project, showing how your codebase is organized.`,
    ``,
    `Total modules found: ${scan.modules.length}`,
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
    lines.push(`- \`${module.key}\` — ${module.fileCount} files`);
  }

  if (scan.modules.length > 100) {
    lines.push(``, `_(Showing top 100 of ${scan.modules.length} modules)_`);
  }

  lines.push(``, `---`, ``, `💡 Tip: Click any module name to see its location in your codebase.`, ``);

  return lines.join("\n");
}

export function renderApiSurface(cfg, scan) {
  const lines = [
    `# 🔌 API Surface`,
    ``,
    `What is this? This page shows both the API endpoints your application provides AND the external APIs it integrates with.`,
    ``,
    `---`,
    ``
  ];

  // Section 1: Internal API Endpoints (what we expose)
  lines.push(
    `## Internal API Endpoints`,
    ``,
    `These are the backend services your application provides to handle requests.`,
    ``,
    `Total endpoints: ${scan.api.length}`,
    ``
  );

  if (!scan.api.length) {
    lines.push(
      `No API routes detected. Your project doesn't appear to have Next.js API routes yet.`,
      ``
    );
  } else {
    lines.push(
      `Each line shows: HTTP Method → API Path → Implementation File`,
      ``
    );

    for (const route of scan.api) {
      lines.push(`- ${route.methods.join(", ")} \`${route.path}\` • \`${route.file}\``);
    }
    
    lines.push(``);
  }

  // Section 2: External API Integrations (what we call)
  lines.push(
    `---`,
    ``,
    `## External API Integrations`,
    ``,
    `These are third-party services your application connects to.`,
    ``
  );

  if (!scan.externalApis || scan.externalApis.length === 0) {
    lines.push(
      `No external API integrations detected.`,
      ``
    );
  } else {
    // Group by category
    const byCategory = {};
    for (const api of scan.externalApis) {
      if (!byCategory[api.category]) {
        byCategory[api.category] = [];
      }
      byCategory[api.category].push(api);
    }

    for (const [category, apis] of Object.entries(byCategory)) {
      lines.push(`### ${category}`, ``);
      for (const api of apis) {
        lines.push(`- **${api.name}** — detected in \`${api.detectedIn}\``);
      }
      lines.push(``);
    }
  }

  lines.push(
    `---`,
    ``,
    `💡 Tips:`,
    `- **Internal endpoints** handle incoming requests from users/clients`,
    `- **External integrations** connect your app to third-party services`,
    `- HTTP methods: GET (retrieve), POST (create), PUT/PATCH (update), DELETE (remove)`,
    ``
  );

  return lines.join("\n");
}

export function renderRouteMap(cfg, scan) {
  const lines = [
    `# 🗺️ Route Map`,
    ``,
    `What is this? This page shows all the pages (URLs) users can visit in your application, plus the backend API endpoints that power them.`,
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
      lines.push(`- \`${page.path}\` • \`${page.file}\``);
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
      lines.push(`- ${route.methods.join(", ")} \`${route.path}\` • \`${route.file}\``);
    }

    lines.push(``);
  }

  if (!scan.pages?.length && !scan.api?.length) {
    lines.push(
      `## 🔍 Route Detection Status`,
      ``,
      `No routes were auto-detected in this scan. RABITAI currently supports:`,
      ``,
      `✅ **Fully Supported:**`,
      `- Next.js pages (\`pages/\` and \`app/\` directories)`,
      `- Next.js API routes (\`pages/api/\` and App Router)`,
      `- Express.js routes (\`app.get\`, \`router.post\`, etc.)`,
      `- React Router (\`<Route>\` components)`,
      `- Vue Router (\`routes\` array definitions)`,
      ``,
      `⏳ **Coming Soon:**`,
      `- Fastify routes`,
      `- NestJS controllers`,
      `- GraphQL endpoints`,
      `- tRPC procedures`,
      ``,
      `💡 **Your project may:**`,
      `- Use a different routing framework (let us know!)`,
      `- Have routes outside the scanned directories`,
      `- Use dynamic routing patterns we haven't detected yet`,
      ``,
      `📬 **Request Support:** Open an issue at [github.com/CHAPIBUNNY/repolens](https://github.com/CHAPIBUNNY/repolens/issues) to request your framework!`,
      ``
    );
  }

  lines.push(
    `---`,
    ``,
    `💡 Tip: URL paths starting with \`/api/\` are backend endpoints, others are user-facing pages.`,
    ``
  );

  return lines.join("\n");
}