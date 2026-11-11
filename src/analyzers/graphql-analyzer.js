// GraphQL schema detection — discovers schemas, queries, mutations, subscriptions, and resolvers

import fs from "node:fs/promises";
import path from "node:path";
import { info } from "../utils/logger.js";
import { extractJsImports, externalPackageName } from "./import-parsers.js";
import { stripJsComments } from "../utils/js-lexer.js";

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

// Word boundaries matter: `useQuery: {` (a React Query hook map) is not `Query: {`.
const RESOLVER_PATTERNS = [
  /(?:^|[^\w$])(?:Query|Mutation|Subscription)\s*:\s*\{/m,
  /\bresolvers?\s*=\s*\{/,
  /\bcreateResolversMap\b/,
  /\bresolveType\b/,
  /\bfieldResolver\b/,
];

// Libraries count only when a file imports them. A comment that mentions Apollo or urql,
// or a React Query `useQuery` hook, is not GraphQL.
const SCHEMA_LIBRARY_PACKAGES = [
  { name: "Apollo Server", match: (pkg) => pkg === "@apollo/server" || pkg === "@apollo/subgraph" || pkg === "apollo-server" || pkg.startsWith("apollo-server-") },
  { name: "GraphQL Yoga", match: (pkg) => pkg === "graphql-yoga" || pkg.startsWith("@graphql-yoga/") },
  { name: "Mercurius", match: (pkg) => pkg === "mercurius" },
  { name: "graphql-js", match: (pkg) => pkg === "graphql" },
  { name: "type-graphql", match: (pkg) => pkg === "type-graphql" },
  { name: "Nexus", match: (pkg) => pkg === "nexus" || pkg === "@nexus/schema" },
  { name: "Pothos", match: (pkg) => pkg.startsWith("@pothos/") },
  { name: "Relay", match: (pkg) => pkg === "relay-runtime" || pkg === "react-relay" },
  { name: "urql", match: (pkg) => pkg === "urql" || pkg.startsWith("@urql/") },
  { name: "Apollo Client", match: (pkg) => pkg === "@apollo/client" || pkg === "apollo-client" || pkg === "react-apollo" || pkg === "apollo-boost" },
  { name: "graphql-request", match: (pkg) => pkg === "graphql-request" },
  { name: "graphql-tag", match: (pkg) => pkg === "graphql-tag" },
  // Hasura has no server SDK; its client and tooling packages are the grounded signal.
  // A bare "hasura" mention in text is no longer enough (see CHANGELOG).
  { name: "Hasura", match: (pkg) => pkg.startsWith("@hasura/") || pkg.startsWith("hasura-") },
];

export function graphqlLibrariesImported(source) {
  const names = [];
  let imports = [];
  try { imports = extractJsImports(source); } catch { imports = []; }
  for (const imported of imports) {
    const pkg = externalPackageName(imported.specifier);
    if (!pkg) continue;
    for (const { name, match } of SCHEMA_LIBRARY_PACKAGES) {
      if (match(pkg) && !names.includes(name)) names.push(name);
    }
  }
  return names;
}

async function hasHasuraProject(repoRoot) {
  for (const rel of ["hasura/config.yaml", "config.yaml"]) {
    const text = await readFileSafe(path.join(repoRoot, rel));
    if (/^\s*metadata_directory\s*:/m.test(text)) return true;
  }
  return false;
}

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
  const resolverCandidates = [];
  for (const file of codeFiles) {
    const content = await readFileSafe(path.join(repoRoot, file));
    if (!content) continue;

    // Detect GraphQL libraries from real imports
    const fileLibraries = graphqlLibrariesImported(content);
    for (const name of fileLibraries) {
      if (!result.libraries.includes(name)) result.libraries.push(name);
    }

    const code = stripJsComments(content);
    const typesBefore = result.types.length + result.queries.length + result.mutations.length + result.subscriptions.length;

    // Detect inline SDL (template literals with gql tag or type definitions)
    const inlineSdlPattern = /\b(?:gql|graphql)\s*`([^`]+)`/gs;
    let match;
    while ((match = inlineSdlPattern.exec(code)) !== null) {
      extractSchemaTypes(match[1], file, result);
    }

    // Also detect raw type definitions in string literals
    if (/\btype\s+(?:Query|Mutation|Subscription)\s*\{/.test(code)) {
      extractSchemaTypes(code, file, result);
    }
    const hasSdl = result.types.length + result.queries.length + result.mutations.length + result.subscriptions.length > typesBefore;

    // Resolver candidates are confirmed after the whole scan: a resolver map needs
    // GraphQL evidence in the file or somewhere in the repository.
    if (RESOLVER_PATTERNS.some(p => p.test(code))) {
      // `resolvers = { Query: { ... } }` together is a resolver map on its own.
      const resolverMap = RESOLVER_PATTERNS[0].test(code) && RESOLVER_PATTERNS[1].test(code);
      resolverCandidates.push({ file, local: fileLibraries.length > 0 || hasSdl || resolverMap });
    }
  }

  // Hasura projects are recognized by their CLI project file, not by the word "hasura".
  if (!result.libraries.includes("Hasura") && await hasHasuraProject(repoRoot)) {
    result.libraries.push("Hasura");
  }

  const repoHasGraphQL = result.schemaFiles.length > 0 ||
    result.types.length > 0 || result.queries.length > 0 || result.mutations.length > 0 ||
    result.libraries.length > 0;
  for (const candidate of resolverCandidates) {
    if ((candidate.local || repoHasGraphQL) && !result.resolverFiles.includes(candidate.file)) {
      result.resolverFiles.push(candidate.file);
    }
  }

  result.detected = repoHasGraphQL || result.resolverFiles.length > 0;

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
