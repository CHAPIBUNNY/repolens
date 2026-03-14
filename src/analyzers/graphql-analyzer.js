// GraphQL schema detection — discovers schemas, queries, mutations, subscriptions, and resolvers

import fs from "node:fs/promises";
import path from "node:path";
import { info } from "../utils/logger.js";

const GRAPHQL_EXTENSIONS = [".graphql", ".gql"];

const TYPE_PATTERNS = {
  query: /type\s+Query\s*\{([^}]*)\}/gs,
  mutation: /type\s+Mutation\s*\{([^}]*)\}/gs,
  subscription: /type\s+Subscription\s*\{([^}]*)\}/gs,
  objectType: /type\s+(\w+)(?:\s+implements\s+[\w&\s]+)?\s*\{([^}]*)\}/gs,
  inputType: /input\s+(\w+)\s*\{([^}]*)\}/gs,
  enumType: /enum\s+(\w+)\s*\{([^}]*)\}/gs,
  interfaceType: /interface\s+(\w+)\s*\{([^}]*)\}/gs,
  unionType: /union\s+(\w+)\s*=\s*([^;\n]+)/g,
  scalarType: /scalar\s+(\w+)/g,
  directive: /directive\s+@(\w+)/g,
};

const RESOLVER_PATTERNS = [
  /(?:Query|Mutation|Subscription)\s*:\s*\{/,
  /resolvers?\s*=\s*\{/,
  /createResolversMap/,
  /\bresolveType\b/,
  /fieldResolver/,
];

const SCHEMA_LIBRARY_PATTERNS = [
  { name: "Apollo Server", pattern: /ApolloServer|@apollo\/server|apollo-server/ },
  { name: "GraphQL Yoga", pattern: /graphql-yoga|createYoga/ },
  { name: "Mercurius", pattern: /mercurius/ },
  { name: "graphql-js", pattern: /graphql\b.*\bbuildSchema\b|\bGraphQLSchema\b|\bGraphQLObjectType\b/ },
  { name: "type-graphql", pattern: /type-graphql|@Resolver|@Query|@Mutation/ },
  { name: "Nexus", pattern: /nexus|makeSchema|objectType\(/ },
  { name: "Pothos", pattern: /pothos|SchemaBuilder/ },
  { name: "Hasura", pattern: /hasura/ },
  { name: "Relay", pattern: /relay-runtime|RelayEnvironment/ },
  { name: "urql", pattern: /urql|@urql/ },
  { name: "Apollo Client", pattern: /ApolloClient|@apollo\/client|apollo-client|useQuery|useMutation/ },
];

function parseFieldsFromBlock(block) {
  const fields = [];
  const lines = block.split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("#"));
  for (const line of lines) {
    const match = line.match(/^(\w+)\s*(?:\([^)]*\))?\s*:\s*(.+)/);
    if (match) {
      fields.push({ name: match[1], type: match[2].replace(/\s*#.*/, "").trim() });
    }
  }
  return fields;
}

async function readFileSafe(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

export async function analyzeGraphQL(files, repoRoot) {
  const result = {
    detected: false,
    schemaFiles: [],
    types: [],
    queries: [],
    mutations: [],
    subscriptions: [],
    enums: [],
    inputs: [],
    interfaces: [],
    unions: [],
    scalars: [],
    directives: [],
    resolverFiles: [],
    libraries: [],
    summary: null,
  };

  // Phase 1: Find dedicated .graphql/.gql schema files
  const schemaFiles = files.filter(f => GRAPHQL_EXTENSIONS.some(ext => f.endsWith(ext)));

  // Phase 2: Find JS/TS files with inline schema or resolvers
  // Exclude test files and our own analysis/rendering files (they reference library names as strings, not usage)
  const testPattern = /(?:^|\/)(?:tests?|__tests?__|spec|__spec__)\/|\.(test|spec)\.[jt]sx?$/i;
  const selfPatterns = ["graphql-analyzer.js", "renderAnalysis.js"];
  const codeFiles = files.filter(f =>
    (f.endsWith(".js") || f.endsWith(".ts") || f.endsWith(".jsx") || f.endsWith(".tsx")) &&
    !testPattern.test(f) &&
    !selfPatterns.some(s => f.endsWith(s))
  );

  // Parse .graphql/.gql files
  for (const file of schemaFiles) {
    const content = await readFileSafe(path.join(repoRoot, file));
    if (!content) continue;
    result.schemaFiles.push(file);
    extractSchemaTypes(content, file, result);
  }

  // Scan code files for inline schemas, resolvers, and libraries
  for (const file of codeFiles) {
    const content = await readFileSafe(path.join(repoRoot, file));
    if (!content) continue;

    // Detect GraphQL libraries
    for (const { name, pattern } of SCHEMA_LIBRARY_PATTERNS) {
      if (pattern.test(content) && !result.libraries.includes(name)) {
        result.libraries.push(name);
      }
    }

    // Detect inline SDL (template literals with gql tag or type definitions)
    const inlineSdlPattern = /(?:gql|graphql)\s*`([^`]+)`/gs;
    let match;
    while ((match = inlineSdlPattern.exec(content)) !== null) {
      extractSchemaTypes(match[1], file, result);
    }

    // Also detect raw type definitions in string literals
    if (/type\s+(?:Query|Mutation|Subscription)\s*\{/.test(content)) {
      extractSchemaTypes(content, file, result);
    }

    // Detect resolver files
    const isResolver = RESOLVER_PATTERNS.some(p => p.test(content));
    if (isResolver && !result.resolverFiles.includes(file)) {
      result.resolverFiles.push(file);
    }
  }

  result.detected = result.schemaFiles.length > 0 ||
    result.types.length > 0 ||
    result.resolverFiles.length > 0 ||
    result.libraries.length > 0;

  if (result.detected) {
    result.summary = buildSummary(result);
    info(`GraphQL detected: ${result.types.length} types, ${result.queries.length} queries, ${result.mutations.length} mutations`);
  }

  return result;
}

function extractSchemaTypes(content, sourceFile, result) {
  let match;

  // Object types (skip Query/Mutation/Subscription — handled separately)
  const typeRegex = /type\s+(\w+)(?:\s+implements\s+([\w&\s]+))?\s*\{([^}]*)\}/gs;
  while ((match = typeRegex.exec(content)) !== null) {
    const name = match[1];
    if (["Query", "Mutation", "Subscription"].includes(name)) continue;
    const implements_ = match[2] ? match[2].split("&").map(s => s.trim()) : [];
    const fields = parseFieldsFromBlock(match[3]);
    if (!result.types.some(t => t.name === name)) {
      result.types.push({ name, fields, implements: implements_, source: sourceFile });
    }
  }

  // Query fields
  const queryRegex = /type\s+Query\s*\{([^}]*)\}/gs;
  while ((match = queryRegex.exec(content)) !== null) {
    const fields = parseFieldsFromBlock(match[1]);
    for (const field of fields) {
      if (!result.queries.some(q => q.name === field.name)) {
        result.queries.push({ ...field, source: sourceFile });
      }
    }
  }

  // Mutation fields
  const mutationRegex = /type\s+Mutation\s*\{([^}]*)\}/gs;
  while ((match = mutationRegex.exec(content)) !== null) {
    const fields = parseFieldsFromBlock(match[1]);
    for (const field of fields) {
      if (!result.mutations.some(m => m.name === field.name)) {
        result.mutations.push({ ...field, source: sourceFile });
      }
    }
  }

  // Subscription fields
  const subRegex = /type\s+Subscription\s*\{([^}]*)\}/gs;
  while ((match = subRegex.exec(content)) !== null) {
    const fields = parseFieldsFromBlock(match[1]);
    for (const field of fields) {
      if (!result.subscriptions.some(s => s.name === field.name)) {
        result.subscriptions.push({ ...field, source: sourceFile });
      }
    }
  }

  // Enums
  const enumRegex = /enum\s+(\w+)\s*\{([^}]*)\}/gs;
  while ((match = enumRegex.exec(content)) !== null) {
    const name = match[1];
    const values = match[2].split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("#"));
    if (!result.enums.some(e => e.name === name)) {
      result.enums.push({ name, values, source: sourceFile });
    }
  }

  // Input types
  const inputRegex = /input\s+(\w+)\s*\{([^}]*)\}/gs;
  while ((match = inputRegex.exec(content)) !== null) {
    const name = match[1];
    const fields = parseFieldsFromBlock(match[2]);
    if (!result.inputs.some(i => i.name === name)) {
      result.inputs.push({ name, fields, source: sourceFile });
    }
  }

  // Interfaces
  const ifaceRegex = /interface\s+(\w+)\s*\{([^}]*)\}/gs;
  while ((match = ifaceRegex.exec(content)) !== null) {
    const name = match[1];
    const fields = parseFieldsFromBlock(match[2]);
    if (!result.interfaces.some(i => i.name === name)) {
      result.interfaces.push({ name, fields, source: sourceFile });
    }
  }

  // Unions
  const unionRegex = /union\s+(\w+)\s*=\s*([^;\n]+)/g;
  while ((match = unionRegex.exec(content)) !== null) {
    const name = match[1];
    const members = match[2].split("|").map(s => s.trim());
    if (!result.unions.some(u => u.name === name)) {
      result.unions.push({ name, members, source: sourceFile });
    }
  }

  // Scalars
  const scalarRegex = /scalar\s+(\w+)/g;
  while ((match = scalarRegex.exec(content)) !== null) {
    if (!result.scalars.includes(match[1])) {
      result.scalars.push(match[1]);
    }
  }

  // Directives
  const directiveRegex = /directive\s+@(\w+)/g;
  while ((match = directiveRegex.exec(content)) !== null) {
    if (!result.directives.includes(match[1])) {
      result.directives.push(match[1]);
    }
  }
}

function buildSummary(result) {
  const parts = [];
  if (result.schemaFiles.length) parts.push(`${result.schemaFiles.length} schema file(s)`);
  if (result.types.length) parts.push(`${result.types.length} object type(s)`);
  if (result.queries.length) parts.push(`${result.queries.length} quer${result.queries.length === 1 ? "y" : "ies"}`);
  if (result.mutations.length) parts.push(`${result.mutations.length} mutation(s)`);
  if (result.subscriptions.length) parts.push(`${result.subscriptions.length} subscription(s)`);
  if (result.enums.length) parts.push(`${result.enums.length} enum(s)`);
  if (result.inputs.length) parts.push(`${result.inputs.length} input type(s)`);
  if (result.interfaces.length) parts.push(`${result.interfaces.length} interface(s)`);
  if (result.resolverFiles.length) parts.push(`${result.resolverFiles.length} resolver file(s)`);
  if (result.libraries.length) parts.push(`libraries: ${result.libraries.join(", ")}`);
  return parts.join(" · ");
}
