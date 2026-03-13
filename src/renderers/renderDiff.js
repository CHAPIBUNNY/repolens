function isRouteFile(file) {
  return (
    file.includes("/pages/api/") ||
    file.endsWith("/route.ts") ||
    file.endsWith("/route.js") ||
    file.endsWith("/page.tsx") ||
    file.endsWith("/page.jsx") ||
    file.endsWith("/page.ts") ||
    file.endsWith("/page.js")
  );
}

function routePathFromFile(file) {
  if (file.includes("/app/")) {
    const appIndex = file.indexOf("/app/");
    const relative = file.slice(appIndex + 5);

    return "/" + relative
      .replace(/\/page\.(ts|tsx|js|jsx)$/, "")
      .replace(/\/route\.(ts|tsx|js|jsx)$/, "")
      .replace(/\[(.*?)\]/g, ":$1");
  }

  if (file.includes("/pages/api/")) {
    const apiIndex = file.indexOf("/pages/api/");
    const relative = file.slice(apiIndex + 11);

    return "/api/" + relative.replace(/\.(ts|tsx|js|jsx)$/, "");
  }

  return file;
}

function moduleFromFile(file) {
  const normalized = file.replace(/\\/g, "/");
  const parts = normalized.split("/");

  const roots = ["app", "components", "lib", "hooks", "store", "services", "packages", "src"];

  for (let i = 0; i < parts.length - 1; i++) {
    if (roots.includes(parts[i])) {
      return parts[i + 1] ? `${parts[i]}/${parts[i + 1]}` : parts[i];
    }
  }

  return parts[0] || "root";
}

export function buildArchitectureDiffData(diff) {
  const addedRoutes = diff.added.filter(isRouteFile).map(routePathFromFile);
  const removedRoutes = diff.removed.filter(isRouteFile).map(routePathFromFile);

  const impactedModules = [
    ...new Set(
      [...diff.added, ...diff.removed, ...diff.modified].map(moduleFromFile)
    )
  ].sort();

  return {
    ...diff,
    addedRoutes,
    removedRoutes,
    impactedModules
  };
}

export function renderArchitectureDiff(diff) {
  const data = buildArchitectureDiffData(diff);

  const lines = [
    "# Architecture Diff",
    "",
    "RepoLens generated this from the current git diff versus the base branch.",
    "",
    "## Summary",
    "",
    `Added files: ${data.added.length}`,
    `Removed files: ${data.removed.length}`,
    `Modified files: ${data.modified.length}`,
    `Added routes: ${data.addedRoutes.length}`,
    `Removed routes: ${data.removedRoutes.length}`,
    `Impacted modules: ${data.impactedModules.length}`,
    ""
  ];

  if (data.addedRoutes.length) {
    lines.push("## Added Routes", "");
    for (const route of data.addedRoutes.slice(0, 25)) {
      lines.push(`- \`${route}\``);
    }
    if (data.addedRoutes.length > 25) {
      lines.push(``, `> Showing 25 of ${data.addedRoutes.length} added routes.`);
    }
    lines.push("");
  }

  if (data.removedRoutes.length) {
    lines.push("## Removed Routes", "");
    for (const route of data.removedRoutes.slice(0, 25)) {
      lines.push(`- \`${route}\``);
    }
    if (data.removedRoutes.length > 25) {
      lines.push(``, `> Showing 25 of ${data.removedRoutes.length} removed routes.`);
    }
    lines.push("");
  }

  if (data.impactedModules.length) {
    lines.push("## Impacted Modules", "");
    for (const module of data.impactedModules.slice(0, 40)) {
      lines.push(`- \`${module}\``);
    }
    if (data.impactedModules.length > 40) {
      lines.push(``, `> Showing 40 of ${data.impactedModules.length} impacted modules.`);
    }
    lines.push("");
  }

  if (data.added.length) {
    lines.push("## Added Files", "");
    for (const file of data.added.slice(0, 25)) {
      lines.push(`- \`${file}\``);
    }
    if (data.added.length > 25) {
      lines.push(``, `> Showing 25 of ${data.added.length} added files.`);
    }
    lines.push("");
  }

  if (data.removed.length) {
    lines.push("## Removed Files", "");
    for (const file of data.removed.slice(0, 25)) {
      lines.push(`- \`${file}\``);
    }
    if (data.removed.length > 25) {
      lines.push(``, `> Showing 25 of ${data.removed.length} removed files.`);
    }
    lines.push("");
  }

  if (data.modified.length) {
    lines.push("## Modified Files", "");
    for (const file of data.modified.slice(0, 25)) {
      lines.push(`- \`${file}\``);
    }
    if (data.modified.length > 25) {
      lines.push(``, `> Showing 25 of ${data.modified.length} modified files.`);
    }
    lines.push("");
  }

  if (!data.added.length && !data.removed.length && !data.modified.length) {
    lines.push("No architecture-relevant changes detected.", "");
  }

  return lines.join("\n");
}