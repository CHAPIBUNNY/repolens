// Renderers for v0.8.0 Extended Analysis documents:
//   - GraphQL Schema
//   - TypeScript Type Graph
//   - Dependency Graph
//   - Architecture Drift

export function renderGraphQLSchema(graphqlResult) {
  if (!graphqlResult?.detected) {
    return "# GraphQL Schema\n\nNo GraphQL schema detected in this repository.\n\n" +
      "RepoLens looks for `.graphql`/`.gql` files, inline SDL (gql tagged templates), " +
      "resolver patterns, and GraphQL libraries (Apollo, Yoga, Nexus, Pothos, etc.).\n";
  }

  const lines = [];
  lines.push("# GraphQL Schema");
  lines.push("");
  lines.push(`> ${graphqlResult.summary}`);
  lines.push("");

  // Libraries
  if (graphqlResult.libraries.length > 0) {
    lines.push("## Libraries & Frameworks");
    lines.push("");
    for (const lib of graphqlResult.libraries) {
      lines.push(`- ${lib}`);
    }
    lines.push("");
  }

  // Schema files
  if (graphqlResult.schemaFiles.length > 0) {
    lines.push("## Schema Files");
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
    for (const e of graphqlResult.enums) {
      lines.push(`- **${e.name}**: ${e.values.join(", ")}`);
    }
    lines.push("");
  }

  // Input Types
  if (graphqlResult.inputs.length > 0) {
    lines.push("## Input Types");
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
    lines.push("## Unions");
    lines.push("");
    for (const u of graphqlResult.unions) {
      lines.push(`- **${u.name}** = ${u.members.join(" | ")}`);
    }
    lines.push("");
  }

  // Resolver Files
  if (graphqlResult.resolverFiles.length > 0) {
    lines.push("## Resolver Files");
    lines.push("");
    for (const file of graphqlResult.resolverFiles) {
      lines.push(`- \`${file}\``);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function renderTypeGraph(tsResult) {
  if (!tsResult?.detected) {
    return "# TypeScript Type Graph\n\nNo TypeScript type declarations detected in this repository.\n\n" +
      "RepoLens looks for `.ts`/`.tsx` files containing interfaces, type aliases, classes, and enums.\n";
  }

  const lines = [];
  lines.push("# TypeScript Type Graph");
  lines.push("");
  lines.push(`> ${tsResult.summary}`);
  lines.push("");

  // Interfaces
  if (tsResult.interfaces.length > 0) {
    lines.push("## Interfaces");
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
    lines.push("```");
    // Group by source type
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

  return lines.join("\n");
}

export function renderDependencyGraph(depResult) {
  if (!depResult?.nodes?.length) {
    return "# Dependency Graph\n\nNo code files found to analyze for dependencies.\n";
  }

  const lines = [];
  lines.push("# Dependency Graph");
  lines.push("");
  lines.push(`> ${depResult.summary}`);
  lines.push("");

  // Stats overview
  lines.push("## Overview");
  lines.push("");
  const s = depResult.stats;
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Source files | ${s.totalFiles} |`);
  lines.push(`| Import edges | ${s.totalEdges} |`);
  lines.push(`| External packages | ${s.externalDeps} |`);
  lines.push(`| Circular dependencies | ${s.cycles} |`);
  lines.push(`| Orphan files | ${s.orphanFiles} |`);
  lines.push("");

  // Hub modules (most imported)
  if (s.hubs.length > 0) {
    lines.push("## Hub Modules (Most Imported)");
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
    lines.push("## ⚠️ Circular Dependencies");
    lines.push("");
    lines.push("The following circular dependency chains were detected:");
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
    const cols = 3;
    const perCol = Math.ceil(depResult.externalDeps.length / cols);
    for (const dep of depResult.externalDeps) {
      lines.push(`- \`${dep}\``);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function renderArchitectureDrift(driftResult) {
  const lines = [];
  lines.push("# Architecture Drift Report");
  lines.push("");

  if (!driftResult.hasBaseline) {
    lines.push("> " + driftResult.summary);
    lines.push("");
    lines.push("Once a baseline is established, this report will track structural changes including:");
    lines.push("- New/removed modules and API endpoints");
    lines.push("- Dependency shifts and circular dependency trends");
    lines.push("- Framework and technology stack changes");
    lines.push("- GraphQL schema evolution");
    lines.push("- Overall codebase scale changes");
    lines.push("");
    return lines.join("\n");
  }

  lines.push(`> Compared against baseline from **${driftResult.baselineTimestamp}**`);
  lines.push("");
  lines.push(`**${driftResult.summary}**`);
  lines.push("");

  if (driftResult.drifts.length === 0) {
    lines.push("✅ No architecture drift detected. The codebase structure matches the baseline.");
    lines.push("");
    return lines.join("\n");
  }

  // Group drifts by severity
  const critical = driftResult.drifts.filter(d => d.severity === "critical");
  const warnings = driftResult.drifts.filter(d => d.severity === "warning");
  const infos = driftResult.drifts.filter(d => d.severity === "info");

  if (critical.length > 0) {
    lines.push("## 🔴 Critical Changes");
    lines.push("");
    for (const drift of critical) {
      lines.push(`### ${formatCategoryLabel(drift.category)} — ${drift.type}`);
      for (const item of drift.items) {
        lines.push(`- ${item}`);
      }
      lines.push("");
    }
  }

  if (warnings.length > 0) {
    lines.push("## 🟡 Warnings");
    lines.push("");
    for (const drift of warnings) {
      lines.push(`### ${formatCategoryLabel(drift.category)} — ${drift.type}`);
      for (const item of drift.items) {
        lines.push(`- ${item}`);
      }
      lines.push("");
    }
  }

  if (infos.length > 0) {
    lines.push("## 🟢 Informational");
    lines.push("");
    for (const drift of infos) {
      lines.push(`### ${formatCategoryLabel(drift.category)} — ${drift.type}`);
      for (const item of drift.items) {
        lines.push(`- ${item}`);
      }
      lines.push("");
    }
  }

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
