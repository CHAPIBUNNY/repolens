// Renderers for v0.8.0 Extended Analysis documents:
//   - GraphQL Schema
//   - TypeScript Type Graph
//   - Dependency Graph
//   - Architecture Drift

export function renderGraphQLSchema(graphqlResult) {
  if (!graphqlResult?.detected) {
    return [
      "# GraphQL Schema",
      "",
      "> No GraphQL schema was detected in this repository.",
      "",
      "RepoLens scans for `.graphql` and `.gql` schema files, inline SDL via tagged template literals (e.g. `gql\\`...\\``), resolver patterns, and popular GraphQL libraries including Apollo, Yoga, Nexus, Pothos, Mercurius, type-graphql, Relay, and urql.",
      "",
      "If your project uses GraphQL, ensure the relevant source directories are included in your `scan.include` configuration.",
      ""
    ].join("\n");
  }

  const lines = [];
  lines.push("# GraphQL Schema");
  lines.push("");
  lines.push(`> ${graphqlResult.summary}`);
  lines.push("");

  // Libraries
  if (graphqlResult.libraries.length > 0) {
    lines.push("## Libraries and Frameworks");
    lines.push("");
    lines.push("The following GraphQL libraries and frameworks were detected in the project dependencies:");
    lines.push("");
    lines.push("| Library | Status |");
    lines.push("|---------|--------|");
    for (const lib of graphqlResult.libraries) {
      lines.push(`| ${lib} | Detected |`);
    }
    lines.push("");
  }

  // Schema files
  if (graphqlResult.schemaFiles.length > 0) {
    lines.push("## Schema Files");
    lines.push("");
    lines.push(`${graphqlResult.schemaFiles.length} schema file${graphqlResult.schemaFiles.length === 1 ? " was" : "s were"} found containing GraphQL type definitions:`);
    lines.push("");
    for (const file of graphqlResult.schemaFiles) {
      lines.push(`- \`${file}\``);
    }
    lines.push("");
  }

  // Queries
  if (graphqlResult.queries.length > 0) {
    lines.push("## Queries");
    lines.push("");
    lines.push(`The schema defines **${graphqlResult.queries.length}** read operation${graphqlResult.queries.length === 1 ? "" : "s"} for fetching data:`);
    lines.push("");
    lines.push("| Query | Return Type | Source |");
    lines.push("|-------|-------------|--------|");
    for (const q of graphqlResult.queries) {
      lines.push(`| \`${q.name}\` | \`${q.type}\` | \`${q.source}\` |`);
    }
    lines.push("");
  }

  // Mutations
  if (graphqlResult.mutations.length > 0) {
    lines.push("## Mutations");
    lines.push("");
    lines.push(`The schema defines **${graphqlResult.mutations.length}** write operation${graphqlResult.mutations.length === 1 ? "" : "s"} for modifying data:`);
    lines.push("");
    lines.push("| Mutation | Return Type | Source |");
    lines.push("|----------|-------------|--------|");
    for (const m of graphqlResult.mutations) {
      lines.push(`| \`${m.name}\` | \`${m.type}\` | \`${m.source}\` |`);
    }
    lines.push("");
  }

  // Subscriptions
  if (graphqlResult.subscriptions.length > 0) {
    lines.push("## Subscriptions");
    lines.push("");
    lines.push(`**${graphqlResult.subscriptions.length}** real-time subscription${graphqlResult.subscriptions.length === 1 ? "" : "s"} for streaming data:`);
    lines.push("");
    lines.push("| Subscription | Return Type | Source |");
    lines.push("|--------------|-------------|--------|");
    for (const s of graphqlResult.subscriptions) {
      lines.push(`| \`${s.name}\` | \`${s.type}\` | \`${s.source}\` |`);
    }
    lines.push("");
  }

  // Object Types
  if (graphqlResult.types.length > 0) {
    lines.push("## Object Types");
    lines.push("");
    lines.push(`The schema defines **${graphqlResult.types.length}** object type${graphqlResult.types.length === 1 ? "" : "s"}, each representing a structured data entity:`);
    lines.push("");
    for (const t of graphqlResult.types) {
      const impl = t.implements?.length ? ` (implements ${t.implements.join(", ")})` : "";
      lines.push(`### \`${t.name}\`${impl}`);
      lines.push("");
      if (t.fields.length > 0) {
        lines.push("| Field | Type |");
        lines.push("|-------|------|");
        for (const f of t.fields) {
          lines.push(`| \`${f.name}\` | \`${f.type}\` |`);
        }
      }
      lines.push(`\n*Source: \`${t.source}\`*\n`);
    }
  }

  // Enums
  if (graphqlResult.enums.length > 0) {
    lines.push("## Enums");
    lines.push("");
    lines.push("Enumeration types constrain a field to a predefined set of values:");
    lines.push("");
    lines.push("| Enum | Values |");
    lines.push("|------|--------|");
    for (const e of graphqlResult.enums) {
      lines.push(`| \`${e.name}\` | ${e.values.map(v => `\`${v}\``).join(", ")} |`);
    }
    lines.push("");
  }

  // Input Types
  if (graphqlResult.inputs.length > 0) {
    lines.push("## Input Types");
    lines.push("");
    lines.push("Input types define the shape of arguments passed to mutations and queries:");
    lines.push("");
    for (const i of graphqlResult.inputs) {
      lines.push(`### \`${i.name}\``);
      lines.push("");
      if (i.fields.length > 0) {
        lines.push("| Field | Type |");
        lines.push("|-------|------|");
        for (const f of i.fields) {
          lines.push(`| \`${f.name}\` | \`${f.type}\` |`);
        }
      }
      lines.push("");
    }
  }

  // Interfaces
  if (graphqlResult.interfaces.length > 0) {
    lines.push("## Interfaces");
    lines.push("");
    lines.push("Interfaces define shared field contracts that object types must implement:");
    lines.push("");
    for (const iface of graphqlResult.interfaces) {
      lines.push(`### \`${iface.name}\``);
      lines.push("");
      if (iface.fields.length > 0) {
        lines.push("| Field | Type |");
        lines.push("|-------|------|");
        for (const f of iface.fields) {
          lines.push(`| \`${f.name}\` | \`${f.type}\` |`);
        }
      }
      lines.push("");
    }
  }

  // Unions
  if (graphqlResult.unions.length > 0) {
    lines.push("## Union Types");
    lines.push("");
    lines.push("Union types represent values that could be one of several object types:");
    lines.push("");
    lines.push("| Union | Possible Types |");
    lines.push("|-------|---------------|");
    for (const u of graphqlResult.unions) {
      lines.push(`| \`${u.name}\` | ${u.members.map(m => `\`${m}\``).join(", ")} |`);
    }
    lines.push("");
  }

  // Resolver Files
  if (graphqlResult.resolverFiles.length > 0) {
    lines.push("## Resolver Files");
    lines.push("");
    lines.push("These files contain resolver implementations that connect schema operations to data sources:");
    lines.push("");
    for (const file of graphqlResult.resolverFiles) {
      lines.push(`- \`${file}\``);
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push("*Generated by RepoLens extended analysis. Schema detection is based on static analysis of source files and may not capture runtime-only definitions.*");
  lines.push("");

  return lines.join("\n");
}

export function renderTypeGraph(tsResult) {
  if (!tsResult?.detected) {
    return [
      "# TypeScript Type Graph",
      "",
      "> No TypeScript type declarations were detected in this repository.",
      "",
      "RepoLens analyzes `.ts` and `.tsx` files for interface declarations, type aliases, classes, and enums. Ensure your TypeScript source directories are included in the `scan.include` configuration.",
      ""
    ].join("\n");
  }

  const lines = [];
  lines.push("# TypeScript Type Graph");
  lines.push("");
  lines.push(`> ${tsResult.summary}`);
  lines.push("");
  lines.push("This document maps the type system of the project, showing how interfaces, classes, and type aliases relate to one another. Understanding these relationships helps navigate the codebase and identify coupling between modules.");
  lines.push("");

  // Interfaces
  if (tsResult.interfaces.length > 0) {
    lines.push("## Interfaces");
    lines.push("");
    lines.push(`**${tsResult.interfaces.length}** interface${tsResult.interfaces.length === 1 ? "" : "s"} define the data contracts used across the application:`);
    lines.push("");
    lines.push("| Interface | Extends | Source |");
    lines.push("|-----------|---------|--------|");
    for (const iface of tsResult.interfaces) {
      const ext = iface.extends.length > 0 ? iface.extends.join(", ") : "—";
      lines.push(`| \`${iface.name}\` | ${ext} | \`${iface.source}\` |`);
    }
    lines.push("");
  }

  // Classes
  if (tsResult.classes.length > 0) {
    lines.push("## Classes");
    lines.push("");
    lines.push(`**${tsResult.classes.length}** class${tsResult.classes.length === 1 ? "" : "es"} provide concrete implementations:`);
    lines.push("");
    lines.push("| Class | Extends | Implements | Source |");
    lines.push("|-------|---------|------------|--------|");
    for (const cls of tsResult.classes) {
      const ext = cls.extends || "—";
      const impl = cls.implements.length > 0 ? cls.implements.join(", ") : "—";
      lines.push(`| \`${cls.name}\` | ${ext} | ${impl} | \`${cls.source}\` |`);
    }
    lines.push("");
  }

  // Type Aliases
  if (tsResult.typeAliases.length > 0) {
    lines.push("## Type Aliases");
    lines.push("");
    lines.push(`**${tsResult.typeAliases.length}** type alias${tsResult.typeAliases.length === 1 ? "" : "es"} define computed or composite types:`);
    lines.push("");
    lines.push("| Type | References | Source |");
    lines.push("|------|------------|--------|");
    for (const t of tsResult.typeAliases) {
      const refs = t.refs.length > 0 ? t.refs.join(", ") : "—";
      lines.push(`| \`${t.name}\` | ${refs} | \`${t.source}\` |`);
    }
    lines.push("");
  }

  // Enums
  if (tsResult.enums.length > 0) {
    lines.push("## Enums");
    lines.push("");
    lines.push(`**${tsResult.enums.length}** enum${tsResult.enums.length === 1 ? "" : "s"} define named constant sets:`);
    lines.push("");
    lines.push("| Enum | Source |");
    lines.push("|------|--------|");
    for (const e of tsResult.enums) {
      lines.push(`| \`${e.name}\` | \`${e.source}\` |`);
    }
    lines.push("");
  }

  // Relationship Graph (Unicode)
  if (tsResult.relationships.length > 0) {
    lines.push("## Type Relationships");
    lines.push("");
    lines.push("The following diagram shows inheritance, implementation, and reference relationships between types:");
    lines.push("");
    lines.push("```");
    const byFrom = new Map();
    for (const rel of tsResult.relationships) {
      if (!byFrom.has(rel.from)) byFrom.set(rel.from, []);
      byFrom.get(rel.from).push(rel);
    }
    for (const [from, rels] of byFrom) {
      lines.push(`${from}`);
      for (let i = 0; i < rels.length; i++) {
        const connector = i === rels.length - 1 ? "└──" : "├──";
        const arrow = rels[i].type === "extends" ? "extends" :
                      rels[i].type === "implements" ? "implements" :
                      rels[i].type === "references" ? "uses" : rels[i].type;
        lines.push(`  ${connector} ${arrow} → ${rels[i].to}`);
      }
    }
    lines.push("```");
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push("*Generated by RepoLens static analysis. Type detection uses regex-based parsing and may not capture all advanced TypeScript patterns.*");
  lines.push("");

  return lines.join("\n");
}

export function renderDependencyGraph(depResult) {
  if (!depResult?.nodes?.length) {
    return [
      "# Dependency Graph",
      "",
      "> No source files were found to analyze for import dependencies.",
      "",
      "Ensure your `scan.include` patterns cover the relevant source directories.",
      ""
    ].join("\n");
  }

  const lines = [];
  lines.push("# Dependency Graph");
  lines.push("");
  lines.push(`> ${depResult.summary}`);
  lines.push("");
  lines.push("This document maps every import relationship in the codebase, identifies the most-connected modules, and flags circular dependencies that may complicate refactoring or increase build times.");
  lines.push("");

  // Stats overview
  const s = depResult.stats;
  lines.push("## Overview");
  lines.push("");
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Source files | ${s.totalFiles} |`);
  lines.push(`| Import edges | ${s.totalEdges} |`);
  lines.push(`| External packages | ${s.externalDeps} |`);
  lines.push(`| Circular dependencies | ${s.cycles} |`);
  lines.push(`| Orphan files (no imports or importers) | ${s.orphanFiles} |`);
  lines.push("");

  // Hub modules (most imported)
  if (s.hubs.length > 0) {
    lines.push("## Hub Modules");
    lines.push("");
    lines.push("These are the most-imported modules in the codebase. Changes to hub modules have the widest blast radius and should be reviewed carefully:");
    lines.push("");
    lines.push("| Module | Imported By |");
    lines.push("|--------|-------------|");
    for (const hub of s.hubs) {
      lines.push(`| \`${hub.key}\` | ${hub.importedBy} files |`);
    }
    lines.push("");
  }

  // Circular dependencies
  if (depResult.cycles.length > 0) {
    lines.push("## Circular Dependencies");
    lines.push("");
    lines.push(`**${depResult.cycles.length}** circular dependency chain${depResult.cycles.length === 1 ? " was" : "s were"} detected. Circular imports can cause initialization errors, increase bundle sizes, and make modules harder to test in isolation. Consider refactoring shared logic into a separate module.`);
    lines.push("");
    for (let i = 0; i < Math.min(depResult.cycles.length, 20); i++) {
      const cycle = depResult.cycles[i];
      lines.push(`${i + 1}. \`${cycle.join("` → `")}\``);
    }
    if (depResult.cycles.length > 20) {
      lines.push(`\n*...and ${depResult.cycles.length - 20} more cycles*`);
    }
    lines.push("");
  }

  // External dependencies
  if (depResult.externalDeps.length > 0) {
    lines.push("## External Dependencies");
    lines.push("");
    lines.push(`The codebase imports **${depResult.externalDeps.length}** external package${depResult.externalDeps.length === 1 ? "" : "s"}. These are third-party modules resolved from \`node_modules\`:`);
    lines.push("");
    // Render as a compact table for cleaner output
    const sorted = [...depResult.externalDeps].sort();
    lines.push("| Package |");
    lines.push("|---------|");
    for (const dep of sorted) {
      lines.push(`| \`${dep}\` |`);
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push("*Generated by RepoLens import analysis. Dependency detection covers ES module imports, dynamic imports, CommonJS require, and re-exports.*");
  lines.push("");

  return lines.join("\n");
}

export function renderArchitectureDrift(driftResult) {
  const lines = [];
  lines.push("# Architecture Drift Report");
  lines.push("");

  if (!driftResult.hasBaseline) {
    lines.push(`> ${driftResult.summary}`);
    lines.push("");
    lines.push("A baseline snapshot of the current architecture has been saved. On subsequent runs, this report will track structural changes across the following dimensions:");
    lines.push("");
    lines.push("| Dimension | What is Tracked |");
    lines.push("|-----------|----------------|");
    lines.push("| Modules | New, removed, or significantly resized modules |");
    lines.push("| API Endpoints | Added or removed backend routes |");
    lines.push("| Dependencies | Changes to external package imports |");
    lines.push("| Frameworks | Technology stack additions or removals |");
    lines.push("| Circular Dependencies | Increases in dependency cycles |");
    lines.push("| GraphQL Schema | Type additions or removals |");
    lines.push("| Codebase Scale | Overall file count changes |");
    lines.push("");
    return lines.join("\n");
  }

  lines.push(`> Compared against baseline from **${driftResult.baselineTimestamp}**`);
  lines.push("");
  lines.push(`**${driftResult.summary}**`);
  lines.push("");

  if (driftResult.drifts.length === 0) {
    lines.push("No architecture drift detected. The codebase structure matches the stored baseline across all tracked dimensions.");
    lines.push("");
    return lines.join("\n");
  }

  // Group drifts by severity
  const critical = driftResult.drifts.filter(d => d.severity === "critical");
  const warnings = driftResult.drifts.filter(d => d.severity === "warning");
  const infos = driftResult.drifts.filter(d => d.severity === "info");

  if (critical.length > 0) {
    lines.push("## Critical Changes");
    lines.push("");
    lines.push("These changes may indicate significant architectural shifts that warrant team discussion:");
    lines.push("");
    for (const drift of critical) {
      lines.push(`### ${formatCategoryLabel(drift.category)} — ${drift.type}`);
      lines.push("");
      for (const item of drift.items) {
        lines.push(`- ${item}`);
      }
      lines.push("");
    }
  }

  if (warnings.length > 0) {
    lines.push("## Warnings");
    lines.push("");
    lines.push("These changes are notable and should be reviewed to ensure they are intentional:");
    lines.push("");
    for (const drift of warnings) {
      lines.push(`### ${formatCategoryLabel(drift.category)} — ${drift.type}`);
      lines.push("");
      for (const item of drift.items) {
        lines.push(`- ${item}`);
      }
      lines.push("");
    }
  }

  if (infos.length > 0) {
    lines.push("## Informational");
    lines.push("");
    lines.push("Routine changes that reflect normal development activity:");
    lines.push("");
    for (const drift of infos) {
      lines.push(`### ${formatCategoryLabel(drift.category)} — ${drift.type}`);
      lines.push("");
      for (const item of drift.items) {
        lines.push(`- ${item}`);
      }
      lines.push("");
    }
  }

  lines.push("---");
  lines.push("");
  lines.push("*Generated by RepoLens drift detection. The baseline is updated automatically after each publish.*");
  lines.push("");

  return lines.join("\n");
}

export function renderSecurityHotspots(secResult) {
  if (!secResult?.detected) {
    return [
      "# Security Hotspots",
      "",
      "> No security anti-patterns were detected in the scanned source files.",
      "",
      "RepoLens scans JavaScript and TypeScript source files for common security risks including code injection (`eval`), XSS (`innerHTML`), SQL injection, command injection, prototype pollution, hardcoded credentials, and insecure randomness.",
      "",
      "Test files, configs, and build outputs are excluded from analysis to reduce false positives.",
      ""
    ].join("\n");
  }

  const lines = [];
  lines.push("# Security Hotspots");
  lines.push("");
  lines.push(`> ${secResult.summary}`);
  lines.push("");
  lines.push("This report identifies code patterns that are commonly associated with security vulnerabilities. Each finding includes the relevant CWE classification and a recommended remediation.");
  lines.push("");

  // Severity summary
  lines.push("## Severity Overview");
  lines.push("");
  lines.push("| Severity | Count |");
  lines.push("|----------|-------|");
  if (secResult.bySeverity.high > 0) lines.push(`| 🔴 High | ${secResult.bySeverity.high} |`);
  if (secResult.bySeverity.medium > 0) lines.push(`| 🟡 Medium | ${secResult.bySeverity.medium} |`);
  if (secResult.bySeverity.low > 0) lines.push(`| 🔵 Low | ${secResult.bySeverity.low} |`);
  lines.push("");
  lines.push(`**${secResult.filesScanned}** source files scanned · **${secResult.filesWithFindingsCount || secResult.filesWithFindings?.length || 0}** files with findings`);
  lines.push("");

  // Findings by category
  const categories = Object.keys(secResult.byCategory);
  for (const category of categories) {
    const findings = secResult.byCategory[category];
    lines.push(`## ${category}`);
    lines.push("");
    // Use description from first finding as category overview
    lines.push(`> ${findings[0].description}`);
    lines.push("");
    lines.push("| File | Line | Pattern | Severity | CWE |");
    lines.push("|------|------|---------|----------|-----|");
    for (const f of findings) {
      const sev = f.severity === "high" ? "🔴 High" : f.severity === "medium" ? "🟡 Medium" : "🔵 Low";
      lines.push(`| \`${f.file}\` | ${f.line} | ${f.name} | ${sev} | ${f.cwe} |`);
    }
    lines.push("");
  }

  // Affected files list
  if (secResult.filesWithFindings?.length > 0) {
    lines.push("## Affected Files");
    lines.push("");
    for (const file of secResult.filesWithFindings) {
      lines.push(`- \`${file}\``);
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push("*Generated by RepoLens security pattern analysis. Detection is regex-based and may produce false positives. Findings should be triaged by a security-aware engineer.*");
  lines.push("");

  return lines.join("\n");
}

function formatCategoryLabel(category) {
  const labels = {
    modules: "Modules",
    api: "API Endpoints",
    pages: "Pages",
    dependencies: "Dependencies",
    frameworks: "Frameworks",
    cycles: "Circular Dependencies",
    graphql: "GraphQL Schema",
    scale: "Codebase Scale",
  };
  return labels[category] || category;
}
