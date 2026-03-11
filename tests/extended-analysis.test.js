import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import { analyzeGraphQL } from "../src/analyzers/graphql-analyzer.js";
import { analyzeTypeScript } from "../src/analyzers/typescript-analyzer.js";
import { analyzeDependencyGraph } from "../src/analyzers/dependency-graph.js";
import {
  buildSnapshot,
  detectDrift,
  saveBaseline,
  loadBaseline,
} from "../src/analyzers/drift-detector.js";
import {
  renderGraphQLSchema,
  renderTypeGraph,
  renderDependencyGraph,
  renderArchitectureDrift,
} from "../src/renderers/renderAnalysis.js";

describe("GraphQL Analyzer", () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-gql-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("returns not detected when no GraphQL files", async () => {
    await fs.writeFile(path.join(tempDir, "index.js"), "console.log('hello');");
    const result = await analyzeGraphQL(["index.js"], tempDir);
    expect(result.detected).toBe(false);
  });

  it("detects .graphql schema files", async () => {
    await fs.writeFile(
      path.join(tempDir, "schema.graphql"),
      `type Query {
        users: [User]
        user(id: ID!): User
      }
      type User {
        id: ID!
        name: String
        email: String
      }
      type Mutation {
        createUser(name: String!): User
      }`
    );
    const result = await analyzeGraphQL(["schema.graphql"], tempDir);
    expect(result.detected).toBe(true);
    expect(result.schemaFiles).toContain("schema.graphql");
    expect(result.queries.length).toBe(2);
    expect(result.queries.map(q => q.name)).toContain("users");
    expect(result.queries.map(q => q.name)).toContain("user");
    expect(result.mutations.length).toBe(1);
    expect(result.mutations[0].name).toBe("createUser");
    expect(result.types.length).toBe(1);
    expect(result.types[0].name).toBe("User");
    expect(result.summary).toBeTruthy();
  });

  it("detects inline gql tagged templates", async () => {
    await fs.writeFile(
      path.join(tempDir, "schema.js"),
      `import { gql } from 'graphql-tag';
       const typeDefs = gql\`
         type Query {
           products: [Product]
         }
         type Product {
           id: ID!
           title: String
         }
       \`;`
    );
    const result = await analyzeGraphQL(["schema.js"], tempDir);
    expect(result.detected).toBe(true);
    expect(result.queries.length).toBe(1);
    expect(result.types.length).toBe(1);
  });

  it("detects GraphQL libraries", async () => {
    await fs.writeFile(
      path.join(tempDir, "server.js"),
      `import { ApolloServer } from '@apollo/server';
       const server = new ApolloServer({ typeDefs, resolvers });`
    );
    const result = await analyzeGraphQL(["server.js"], tempDir);
    expect(result.detected).toBe(true);
    expect(result.libraries).toContain("Apollo Server");
  });

  it("detects resolver files", async () => {
    await fs.writeFile(
      path.join(tempDir, "resolvers.js"),
      `export const resolvers = {
         Query: {
           users: () => [],
         },
         Mutation: {
           createUser: (_, args) => args,
         }
       };`
    );
    const result = await analyzeGraphQL(["resolvers.js"], tempDir);
    expect(result.detected).toBe(true);
    expect(result.resolverFiles).toContain("resolvers.js");
  });

  it("detects enums, inputs, interfaces, unions", async () => {
    await fs.writeFile(
      path.join(tempDir, "types.graphql"),
      `enum Status { ACTIVE INACTIVE }
       input CreateUserInput { name: String! email: String! }
       interface Node { id: ID! }
       union SearchResult = User | Product`
    );
    const result = await analyzeGraphQL(["types.graphql"], tempDir);
    expect(result.enums.length).toBe(1);
    expect(result.enums[0].name).toBe("Status");
    expect(result.inputs.length).toBe(1);
    expect(result.inputs[0].name).toBe("CreateUserInput");
    expect(result.interfaces.length).toBe(1);
    expect(result.interfaces[0].name).toBe("Node");
    expect(result.unions.length).toBe(1);
    expect(result.unions[0].name).toBe("SearchResult");
  });

  it("renders GraphQL schema document", async () => {
    await fs.writeFile(
      path.join(tempDir, "schema.graphql"),
      `type Query { users: [User] }
       type User { id: ID! name: String }`
    );
    const result = await analyzeGraphQL(["schema.graphql"], tempDir);
    const output = renderGraphQLSchema(result);
    expect(output).toContain("# GraphQL Schema");
    expect(output).toContain("Queries");
    expect(output).toContain("users");
    expect(output).toContain("Object Types");
    expect(output).toContain("User");
  });

  it("renders fallback when no GraphQL detected", () => {
    const output = renderGraphQLSchema({ detected: false });
    expect(output).toContain("No GraphQL schema");
  });
});

describe("TypeScript Analyzer", () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-ts-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("returns not detected when no TS files", async () => {
    await fs.writeFile(path.join(tempDir, "index.js"), "const x = 1;");
    const result = await analyzeTypeScript(["index.js"], tempDir);
    expect(result.detected).toBe(false);
  });

  it("detects interfaces", async () => {
    await fs.writeFile(
      path.join(tempDir, "types.ts"),
      `export interface User {
        id: string;
        name: string;
      }
      export interface AdminUser extends User {
        role: string;
      }`
    );
    const result = await analyzeTypeScript(["types.ts"], tempDir);
    expect(result.detected).toBe(true);
    expect(result.interfaces.length).toBe(2);
    expect(result.interfaces[0].name).toBe("User");
    expect(result.interfaces[1].name).toBe("AdminUser");
    expect(result.interfaces[1].extends).toContain("User");
    expect(result.relationships.some(r => r.from === "AdminUser" && r.to === "User" && r.type === "extends")).toBe(true);
  });

  it("detects type aliases with references", async () => {
    await fs.writeFile(
      path.join(tempDir, "types.ts"),
      `export interface User { id: string; }
       export type UserList = User[];
       export type UserMap = Record<string, User>;`
    );
    const result = await analyzeTypeScript(["types.ts"], tempDir);
    expect(result.typeAliases.length).toBe(2);
    expect(result.typeAliases[0].name).toBe("UserList");
    expect(result.typeAliases[0].refs).toContain("User");
  });

  it("detects classes with extends and implements", async () => {
    await fs.writeFile(
      path.join(tempDir, "service.ts"),
      `interface Logger { log(msg: string): void; }
       class BaseService { protected name: string; }
       export class UserService extends BaseService implements Logger {
         log(msg: string) { console.log(msg); }
       }`
    );
    const result = await analyzeTypeScript(["service.ts"], tempDir);
    expect(result.classes.length).toBe(2);
    const userService = result.classes.find(c => c.name === "UserService");
    expect(userService.extends).toBe("BaseService");
    expect(userService.implements).toContain("Logger");
    expect(result.relationships.some(r => r.from === "UserService" && r.to === "BaseService")).toBe(true);
    expect(result.relationships.some(r => r.from === "UserService" && r.to === "Logger")).toBe(true);
  });

  it("detects enums", async () => {
    await fs.writeFile(
      path.join(tempDir, "enums.ts"),
      `export enum Color { Red, Green, Blue }
       export const enum Direction { Up, Down, Left, Right }`
    );
    const result = await analyzeTypeScript(["enums.ts"], tempDir);
    expect(result.enums.length).toBe(2);
    expect(result.enums.map(e => e.name)).toContain("Color");
    expect(result.enums.map(e => e.name)).toContain("Direction");
  });

  it("renders TypeScript type graph document", async () => {
    await fs.writeFile(
      path.join(tempDir, "types.ts"),
      `export interface User { id: string; }
       export interface AdminUser extends User { role: string; }`
    );
    const result = await analyzeTypeScript(["types.ts"], tempDir);
    const output = renderTypeGraph(result);
    expect(output).toContain("# TypeScript Type Graph");
    expect(output).toContain("Interfaces");
    expect(output).toContain("User");
    expect(output).toContain("AdminUser");
    expect(output).toContain("Type Relationships");
  });

  it("renders fallback when no TS detected", () => {
    const output = renderTypeGraph({ detected: false });
    expect(output).toContain("No TypeScript");
  });
});

describe("Dependency Graph Analyzer", () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-dep-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("returns empty result for no code files", async () => {
    await fs.writeFile(path.join(tempDir, "readme.md"), "# Hello");
    const result = await analyzeDependencyGraph(["readme.md"], tempDir);
    expect(result.nodes.length).toBe(0);
  });

  it("detects ES module imports", async () => {
    await fs.writeFile(path.join(tempDir, "a.js"), `import { foo } from "./b.js";\nfoo();`);
    await fs.writeFile(path.join(tempDir, "b.js"), `export function foo() { return 1; }`);
    const result = await analyzeDependencyGraph(["a.js", "b.js"], tempDir);
    expect(result.nodes.length).toBe(2);
    expect(result.edges.length).toBe(1);
    expect(result.edges[0].from).toBe("a");
    expect(result.edges[0].to).toBe("b");
    expect(result.stats.cycles).toBe(0);
  });

  it("detects circular dependencies", async () => {
    await fs.writeFile(path.join(tempDir, "a.js"), `import { b } from "./b.js";`);
    await fs.writeFile(path.join(tempDir, "b.js"), `import { a } from "./a.js";`);
    const result = await analyzeDependencyGraph(["a.js", "b.js"], tempDir);
    expect(result.cycles.length).toBeGreaterThan(0);
    expect(result.stats.cycles).toBeGreaterThan(0);
    expect(result.summary).toContain("circular");
  });

  it("tracks external dependencies", async () => {
    await fs.writeFile(
      path.join(tempDir, "index.js"),
      `import express from "express";\nimport path from "node:path";\nimport { foo } from "./lib.js";`
    );
    await fs.writeFile(path.join(tempDir, "lib.js"), `export const foo = 1;`);
    const result = await analyzeDependencyGraph(["index.js", "lib.js"], tempDir);
    expect(result.externalDeps).toContain("express");
    // node: built-ins should not be included
    expect(result.externalDeps).not.toContain("path");
    expect(result.externalDeps).not.toContain("node:path");
  });

  it("detects orphan files", async () => {
    await fs.writeFile(path.join(tempDir, "a.js"), `const x = 1;`);
    await fs.writeFile(path.join(tempDir, "b.js"), `const y = 2;`);
    const result = await analyzeDependencyGraph(["a.js", "b.js"], tempDir);
    expect(result.stats.orphanFiles).toBe(2);
  });

  it("renders dependency graph document", async () => {
    await fs.writeFile(path.join(tempDir, "a.js"), `import { b } from "./b.js";`);
    await fs.writeFile(path.join(tempDir, "b.js"), `export const b = 1;`);
    const result = await analyzeDependencyGraph(["a.js", "b.js"], tempDir);
    const output = renderDependencyGraph(result);
    expect(output).toContain("# Dependency Graph");
    expect(output).toContain("Overview");
    expect(output).toContain("Source files");
  });

  it("renders empty fallback for no files", () => {
    const output = renderDependencyGraph({ nodes: [] });
    expect(output).toContain("No source files");
  });
});

describe("Architecture Drift Detector", () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-drift-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("reports no baseline when none exists", () => {
    const result = detectDrift(null, {});
    expect(result.hasBaseline).toBe(false);
    expect(result.summary).toContain("No baseline");
  });

  it("detects no drift when snapshots match", () => {
    const snapshot = buildSnapshot(
      { modules: [{ key: "src/core", fileCount: 5 }], api: [], pages: [], externalApis: [], metadata: {}, filesCount: 10 },
      { edges: [], cycles: [], externalDeps: [] },
      { detected: false },
      { detected: false }
    );
    const result = detectDrift({ ...snapshot, timestamp: "2025-01-01T00:00:00Z" }, snapshot);
    expect(result.hasBaseline).toBe(true);
    expect(result.drifts.length).toBe(0);
    expect(result.summary).toContain("No architecture drift");
  });

  it("detects added modules", () => {
    const baseline = {
      timestamp: "2025-01-01T00:00:00Z",
      modules: ["src/core"],
      moduleFileCounts: { "src/core": 5 },
      apiEndpoints: [],
      pages: [],
      externalDeps: [],
      frameworks: [],
      depGraphCycleCount: 0,
      graphqlTypes: [],
      graphqlQueries: [],
      graphqlMutations: [],
      tsInterfaces: [],
      tsClasses: [],
      filesCount: 10,
    };
    const current = {
      ...baseline,
      modules: ["src/core", "src/new-module"],
      moduleFileCounts: { "src/core": 5, "src/new-module": 3 },
      filesCount: 13,
    };
    const result = detectDrift(baseline, current);
    expect(result.drifts.some(d => d.category === "modules" && d.type === "added")).toBe(true);
    const addedDrift = result.drifts.find(d => d.category === "modules" && d.type === "added");
    expect(addedDrift.items).toContain("src/new-module");
  });

  it("detects removed API endpoints", () => {
    const baseline = {
      timestamp: "2025-01-01T00:00:00Z",
      modules: [],
      moduleFileCounts: {},
      apiEndpoints: ["GET:/api/users", "POST:/api/users"],
      pages: [],
      externalDeps: [],
      frameworks: [],
      depGraphCycleCount: 0,
      graphqlTypes: [],
      graphqlQueries: [],
      graphqlMutations: [],
      tsInterfaces: [],
      tsClasses: [],
      filesCount: 5,
    };
    const current = { ...baseline, apiEndpoints: ["GET:/api/users"] };
    const result = detectDrift(baseline, current);
    expect(result.drifts.some(d => d.category === "api" && d.type === "removed")).toBe(true);
  });

  it("detects framework changes", () => {
    const baseline = {
      timestamp: "2025-01-01T00:00:00Z",
      modules: [],
      moduleFileCounts: {},
      apiEndpoints: [],
      pages: [],
      externalDeps: [],
      frameworks: ["React", "Express"],
      depGraphCycleCount: 0,
      graphqlTypes: [],
      graphqlQueries: [],
      graphqlMutations: [],
      tsInterfaces: [],
      tsClasses: [],
      filesCount: 10,
    };
    const current = { ...baseline, frameworks: ["React"] };
    const result = detectDrift(baseline, current);
    expect(result.drifts.some(d => d.category === "frameworks" && d.type === "removed")).toBe(true);
    const drift = result.drifts.find(d => d.category === "frameworks" && d.type === "removed");
    expect(drift.severity).toBe("critical");
  });

  it("detects increased circular dependencies", () => {
    const baseline = {
      timestamp: "2025-01-01T00:00:00Z",
      modules: [],
      moduleFileCounts: {},
      apiEndpoints: [],
      pages: [],
      externalDeps: [],
      frameworks: [],
      depGraphCycleCount: 0,
      graphqlTypes: [],
      graphqlQueries: [],
      graphqlMutations: [],
      tsInterfaces: [],
      tsClasses: [],
      filesCount: 10,
    };
    const current = { ...baseline, depGraphCycleCount: 3 };
    const result = detectDrift(baseline, current);
    expect(result.drifts.some(d => d.category === "cycles" && d.type === "increased")).toBe(true);
  });

  it("saves and loads baseline", async () => {
    const snapshot = {
      modules: ["src/core"],
      filesCount: 10,
    };
    await saveBaseline(snapshot, tempDir);
    const loaded = await loadBaseline(tempDir);
    expect(loaded).toBeTruthy();
    expect(loaded.modules).toEqual(["src/core"]);
    expect(loaded.filesCount).toBe(10);
    expect(loaded.timestamp).toBeTruthy();
  });

  it("renders drift report", () => {
    const baseline = {
      timestamp: "2025-01-01T00:00:00Z",
      modules: ["src/core"],
      moduleFileCounts: { "src/core": 5 },
      apiEndpoints: [],
      pages: [],
      externalDeps: [],
      frameworks: [],
      depGraphCycleCount: 0,
      graphqlTypes: [],
      graphqlQueries: [],
      graphqlMutations: [],
      tsInterfaces: [],
      tsClasses: [],
      filesCount: 10,
    };
    const current = { ...baseline, modules: ["src/core", "src/new"], moduleFileCounts: { "src/core": 5, "src/new": 2 } };
    const driftResult = detectDrift(baseline, current);
    const output = renderArchitectureDrift(driftResult);
    expect(output).toContain("# Architecture Drift Report");
    expect(output).toContain("drift");
  });

  it("renders no-baseline fallback", () => {
    const driftResult = detectDrift(null, {});
    const output = renderArchitectureDrift(driftResult);
    expect(output).toContain("No baseline");
  });
});
