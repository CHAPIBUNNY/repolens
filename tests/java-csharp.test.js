// Java and C# support (1.17.0): import parsing, type resolution, package/namespace
// cycles, code health, and language coverage.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { analyzeDependencyGraph, classifyPackageCycle } from "../src/analyzers/dependency-graph.js";
import {
  stripCLike,
  parseJavaFile,
  parseCSharpFile,
  parseJavaBuildGroups,
  javaExternalName,
  csharpExternalName,
  parseMsBuildProject,
  isCSharpStdlib,
  isJavaStdlib,
} from "../src/analyzers/java-csharp.js";
import {
  analyzeComplexity,
  computeCodeHealth,
  computeCLikeComplexity,
  extractCLikeFunctions,
} from "../src/analyzers/complexity-analyzer.js";
import { computeLanguageCoverage, ANALYZED_LANGUAGES_TEXT } from "../src/analyzers/language-coverage.js";
import { isTestPath, isNonProductPath } from "../src/utils/path-roles.js";
import { renderDependencyGraph } from "../src/renderers/renderAnalysis.js";
import { cycleConcern, cycleStatusCell, lowCycleLabel } from "../src/analyzers/cycle-priority.js";
import { scoreRepository } from "../src/badge.js";
import { detectJvmDotnetTooling } from "../src/core/scan.js";

let tempDir;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-jcs-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

async function write(rel, content) {
  const file = path.join(tempDir, rel);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content);
  return rel;
}

async function writeAll(map) {
  const files = [];
  for (const [rel, content] of Object.entries(map)) {
    const written = await write(rel, content);
    if (/\.(java|cs|js|ts|kt)$/.test(rel)) files.push(written);
  }
  return files;
}

function importsOf(graph, file) {
  const node = graph.nodes.find((n) => n.file === file);
  if (!node) throw new Error(`no node ${file}`);
  return [...node.imports].sort();
}

const J = "src/main/java";

describe("stripCLike", () => {
  it("blanks comments, strings, text blocks, and char literals, keeping newlines", () => {
    const src = 'a /* Foo */ b // Bar\nString s = "Baz \\" Qux"; char c = \'"\';\nString t = """\n  Hidden\n  """;\nend';
    const out = stripCLike(src, "java");
    expect(out.split("\n").length).toBe(src.split("\n").length);
    for (const word of ["Foo", "Bar", "Baz", "Qux", "Hidden"]) expect(out).not.toContain(word);
    expect(out).toContain("end");
    expect(out).toContain("String s =");
  });

  it("handles C# verbatim, interpolated, and raw strings, and preprocessor lines", () => {
    const src = 'var a = @"C:\\x ""Foo"" ";\nvar b = $"{Bar}";\nvar c = """\nBaz\n""";\n#if DEBUG\nKeep k;\n#endif\n#region Qux\n';
    const out = stripCLike(src, "csharp");
    for (const word of ["Foo", "Baz", "DEBUG", "Qux"]) expect(out).not.toContain(word);
    expect(out).toContain("Keep k;");
  });
});

describe("parseJavaFile", () => {
  it("reads package, single, static, and on-demand imports", () => {
    const facts = parseJavaFile(`package a.b;\nimport java.util.List;\nimport static a.c.Util.max;\nimport static a.c.Util.*;\nimport a.d.*;\nimport a.e.Outer.Inner;\nclass X {}\n`);
    expect(facts.package).toBe("a.b");
    expect(facts.imports).toEqual([
      { name: "java.util.List", static: false, wildcard: false },
      { name: "a.c.Util.max", static: true, wildcard: false },
      { name: "a.c.Util", static: true, wildcard: true },
      { name: "a.d", static: false, wildcard: true },
      { name: "a.e.Outer.Inner", static: false, wildcard: false },
    ]);
  });

  it("finds top-level and nested types, not `Foo.class` or names in comments", () => {
    const facts = parseJavaFile(`package p;\n/** class Fake {} */\npublic class A<T extends Comparable<? super T>> {\n  Object o = B.class;\n  static class Inner {}\n  record R(int x) {}\n  enum E { X }\n}\ninterface I {}\n@interface Ann {}\n`);
    expect(facts.topLevelTypes).toEqual(["A", "I", "Ann"]);
    expect(facts.types).toEqual(expect.arrayContaining(["A", "Inner", "R", "E", "I", "Ann"]));
    expect(facts.types).not.toContain("Fake");
    expect(facts.types).not.toContain("B");
  });

  it("does not count imported names or Javadoc as uses", () => {
    const facts = parseJavaFile(`package p;\nimport q.Used;\nimport q.DocOnly;\n/** {@link DocOnly} */\nclass A { Used u; }\n`);
    expect(facts.identifiers.has("Used")).toBe(true);
    expect(facts.identifiers.has("DocOnly")).toBe(false);
  });
});

describe("Java type resolution", () => {
  it("links single-type imports, same-package types, and on-demand imports by use", async () => {
    const files = await writeAll({
      [`${J}/com/x/api/Client.java`]: `package com.x.api;\nimport com.x.model.User;\nimport com.x.util.*;\npublic class Client { User u; Strings s; Config c; }\n`,
      [`${J}/com/x/api/Config.java`]: `package com.x.api;\npublic class Config {}\n`,
      [`${J}/com/x/api/Unused.java`]: `package com.x.api;\npublic class Unused {}\n`,
      [`${J}/com/x/model/User.java`]: `package com.x.model;\npublic class User {}\n`,
      [`${J}/com/x/util/Strings.java`]: `package com.x.util;\npublic final class Strings {}\n`,
      [`${J}/com/x/util/Numbers.java`]: `package com.x.util;\npublic final class Numbers {}\n`,
    });
    const graph = await analyzeDependencyGraph(files, tempDir);
    expect(importsOf(graph, `${J}/com/x/api/Client.java`)).toEqual([
      `${J}/com/x/api/Config.java`,
      `${J}/com/x/model/User.java`,
      `${J}/com/x/util/Strings.java`,
    ]);
    expect(graph.stats.cycles).toBe(0);
  });

  it("does not make an edge from an import used only in Javadoc, and counts it", async () => {
    const files = await writeAll({
      [`${J}/com/x/a/A.java`]: `package com.x.a;\nimport com.x.b.B;\n/** See {@link B}. */\npublic @interface A {}\n`,
      [`${J}/com/x/b/B.java`]: `package com.x.b;\nimport com.x.a.A;\n@A public class B {}\n`,
    });
    const graph = await analyzeDependencyGraph(files, tempDir);
    expect(importsOf(graph, `${J}/com/x/a/A.java`)).toEqual([]);
    expect(importsOf(graph, `${J}/com/x/b/B.java`)).toEqual([`${J}/com/x/a/A.java`]);
    expect(graph.stats.docOnlyImports).toBe(1);
    expect(graph.stats.cycles).toBe(0);
    expect(renderDependencyGraph(graph)).toContain("Java imports used only in Javadoc or unused (not import edges) | 1");
  });

  it("lets a single-type import shadow a same-package type", async () => {
    const files = await writeAll({
      [`${J}/p/A.java`]: `package p;\nimport q.Node;\nclass A { Node n; }\n`,
      [`${J}/p/Node.java`]: `package p;\nclass Node {}\n`,
      [`${J}/q/Node.java`]: `package q;\npublic class Node {}\n`,
    });
    const graph = await analyzeDependencyGraph(files, tempDir);
    expect(importsOf(graph, `${J}/p/A.java`)).toEqual([`${J}/q/Node.java`]);
  });

  it("resolves static imports, nested-type imports, and fully qualified uses to the declaring file", async () => {
    const files = await writeAll({
      [`${J}/p/A.java`]: `package p;\nimport static q.Util.max;\nimport static r.Consts.*;\nimport s.Outer.Inner;\nclass A { int m = max(1, 2); Inner i; Object o = new t.Fq(); }\n`,
      [`${J}/q/Util.java`]: `package q;\npublic class Util { public static int max(int a, int b) { return a; } }\n`,
      [`${J}/r/Consts.java`]: `package r;\npublic class Consts { public static final int X = 1; }\n`,
      [`${J}/s/Outer.java`]: `package s;\npublic class Outer { public static class Inner {} }\n`,
      [`${J}/t/Fq.java`]: `package t;\npublic class Fq {}\n`,
    });
    const graph = await analyzeDependencyGraph(files, tempDir);
    expect(importsOf(graph, `${J}/p/A.java`)).toEqual([`${J}/q/Util.java`, `${J}/r/Consts.java`, `${J}/s/Outer.java`, `${J}/t/Fq.java`]);
  });

  it("skips the JDK, labels third-party packages by Maven groupId, and ignores unresolved repo packages", async () => {
    const files = await writeAll({
      "pom.xml": `<project><dependencies><dependency><groupId>com.fasterxml.jackson.core</groupId><artifactId>jackson-core</artifactId></dependency></dependencies></project>`,
      [`${J}/p/A.java`]: `package p;\nimport java.util.List;\nimport javax.annotation.Nullable;\nimport com.fasterxml.jackson.core.JsonParser;\nimport org.apache.commons.lang3.StringUtils;\nimport p.gen.Generated;\nclass A { List l; JsonParser j; StringUtils s; Generated g; }\n`,
      [`${J}/p/gen/Other.java`]: `package p.gen;\nclass Other {}\n`,
    });
    const graph = await analyzeDependencyGraph(files, tempDir);
    expect(graph.externalDeps).toEqual(["com.fasterxml.jackson.core", "org.apache.commons.lang3"]);
  });

  it("prefers the importer's own Maven/Gradle module when a type exists in two modules", async () => {
    const files = await writeAll({
      "android/guava/pom.xml": "<project/>",
      "guava/pom.xml": "<project/>",
      "android/guava/src/com/google/common/base/Strings.java": "package com.google.common.base;\npublic class Strings {}\n",
      "android/guava/src/com/google/common/collect/Lists.java": "package com.google.common.collect;\nimport com.google.common.base.Strings;\nclass Lists { Strings s; }\n",
      "guava/src/com/google/common/base/Strings.java": "package com.google.common.base;\npublic class Strings {}\n",
      "guava/src/com/google/common/collect/Lists.java": "package com.google.common.collect;\nimport com.google.common.base.Strings;\nclass Lists { Strings s; }\n",
    });
    const graph = await analyzeDependencyGraph(files, tempDir);
    expect(importsOf(graph, "android/guava/src/com/google/common/collect/Lists.java")).toEqual(["android/guava/src/com/google/common/base/Strings.java"]);
    expect(importsOf(graph, "guava/src/com/google/common/collect/Lists.java")).toEqual(["guava/src/com/google/common/base/Strings.java"]);
  });

  it("links tests to main code in the same package, never main code to a test-only class", async () => {
    const files = await writeAll({
      "src/main/java/p/Parser.java": "package p;\npublic class Parser { Fixture f; }\n",
      "src/test/java/p/ParserTest.java": "package p;\nclass ParserTest { Parser p; Fixture f; }\n",
      "src/test/java/p/Fixture.java": "package p;\nclass Fixture {}\n",
    });
    const graph = await analyzeDependencyGraph(files, tempDir);
    expect(importsOf(graph, "src/main/java/p/Parser.java")).toEqual([]);
    expect(importsOf(graph, "src/test/java/p/ParserTest.java")).toEqual(["src/main/java/p/Parser.java", "src/test/java/p/Fixture.java"]);
  });

  it("does not graph package-info.java or module-info.java", async () => {
    const files = await writeAll({
      [`${J}/p/package-info.java`]: "@Nonnull\npackage p;\nimport javax.annotation.Nonnull;\n",
      [`${J}/module-info.java`]: "module p { requires java.base; }\n",
      [`${J}/p/A.java`]: "package p;\nclass A {}\n",
    });
    const graph = await analyzeDependencyGraph(files, tempDir);
    expect(graph.nodes.map((n) => n.file)).toEqual([`${J}/p/A.java`]);
  });
});

describe("Java package cycles", () => {
  it("does not report classes of one package that refer to each other", async () => {
    const files = await writeAll({
      [`${J}/p/A.java`]: "package p;\nclass A { B b; }\n",
      [`${J}/p/B.java`]: "package p;\nclass B { A a; }\n",
    });
    const graph = await analyzeDependencyGraph(files, tempDir);
    expect(graph.edges.length).toBe(2);
    expect(graph.stats.cycles).toBe(0);
  });

  it("reports a cycle between two sibling packages as Medium, by package name", async () => {
    const files = await writeAll({
      [`${J}/com/x/a/A.java`]: "package com.x.a;\nimport com.x.b.B;\npublic class A { B b; }\n",
      [`${J}/com/x/b/B.java`]: "package com.x.b;\nimport com.x.a.A;\npublic class B { A a; }\n",
    });
    const graph = await analyzeDependencyGraph(files, tempDir);
    expect(graph.stats.cycles).toBe(1);
    expect(graph.stats.packageCycles).toBe(1);
    expect(graph.cycles[0]).toEqual(["com.x.a", "com.x.b", "com.x.a"]);
    expect(graph.cycleReports[0].priority).toBe("medium");
    expect(graph.cycleReports[0].priorityLine).toBe("Priority: Medium — small package cycle; review");
    const md = renderDependencyGraph(graph);
    expect(md).toContain("`com.x.a` → `com.x.b` → `com.x.a`");
    expect(md).toContain("cycles are listed between packages / namespaces, not classes");
  });

  it("treats a package and its own sub-packages as Low, and three unrelated packages as High", async () => {
    const files = await writeAll({
      [`${J}/g/Gson.java`]: "package g;\nimport g.internal.Excluder;\npublic class Gson { Excluder e; }\n",
      [`${J}/g/internal/Excluder.java`]: "package g.internal;\nimport g.Gson;\npublic class Excluder { Gson g; }\n",
      [`${J}/a/A.java`]: "package a;\nimport b.B;\npublic class A { B b; }\n",
      [`${J}/b/B.java`]: "package b;\nimport c.C;\npublic class B { C c; }\n",
      [`${J}/c/C.java`]: "package c;\nimport a.A;\npublic class C { A a; }\n",
    });
    const graph = await analyzeDependencyGraph(files, tempDir);
    const byPath = new Map(graph.cycleReports.map((r) => [r.path.join(">"), r]));
    expect([...byPath.values()].map((r) => r.priority).sort()).toEqual(["high", "low"]);
    const low = graph.cycleReports.find((r) => r.priority === "low");
    expect(low.label).toBe("parent/child package cycle, common in Java; verify");
    expect(graph.stats.highCycles).toBe(1);
    expect(graph.stats.lowCycles).toBe(1);
  });

  it("treats a longer loop through a parent package as Medium", async () => {
    const files = await writeAll({
      [`${J}/g/Gson.java`]: "package g;\nimport g.internal.Excluder;\npublic class Gson { Excluder e; }\n",
      [`${J}/g/internal/Excluder.java`]: "package g.internal;\nimport g.reflect.TypeToken;\npublic class Excluder { TypeToken t; }\n",
      [`${J}/g/reflect/TypeToken.java`]: "package g.reflect;\nimport g.Gson;\npublic class TypeToken { Gson g; }\n",
    });
    const graph = await analyzeDependencyGraph(files, tempDir);
    expect(graph.cycleReports.map((r) => r.priorityLine)).toEqual(["Priority: Medium — cycle through parent package `g`; review"]);
  });

  it("keeps src/main and src/test packages apart and is stable under file order", async () => {
    const map = {
      "src/main/java/a/A.java": "package a;\nimport b.B;\npublic class A { B b; }\n",
      "src/main/java/b/B.java": "package b;\npublic class B {}\n",
      "src/test/java/b/BTest.java": "package b;\nimport a.A;\nclass BTest { A a; B b; }\n",
      "src/test/java/a/ATest.java": "package a;\nimport b.B;\nclass ATest { A a; B b; }\n",
    };
    const files = await writeAll(map);
    const graph = await analyzeDependencyGraph(files, tempDir);
    expect(graph.stats.cycles).toBe(0);
    const reversed = await analyzeDependencyGraph([...files].reverse(), tempDir);
    expect(reversed.edges.length).toBe(graph.edges.length);
  });

  it("labels the test copy of a package name with its source root when it is in a cycle", () => {
    const report = classifyPackageCycle({ path: ["x.a (src/test/java)", "x.b", "x.a (src/test/java)"], lang: "java", links: [1, 1] });
    expect(report.priority).toBe("medium");
  });
});

describe("parseCSharpFile", () => {
  it("reads using directives, not using statements or declarations", () => {
    const facts = parseCSharpFile(`global using Polly.Utils;\nusing System;\nusing static Polly.Guard;\nusing Alias = Polly.Core.Thing<int>;\nusing G = global::Polly.Other;\nnamespace Polly.CircuitBreaker;\nclass A { void M() { using var x = Get(); using (var y = Make()) {} } }\n`);
    expect(facts.usings).toEqual([
      { name: "Polly.Utils", static: false, global: true, alias: null },
      { name: "System", static: false, global: false, alias: null },
      { name: "Polly.Guard", static: true, global: false, alias: null },
      { name: "Polly.Core.Thing", static: false, global: false, alias: "Alias" },
      { name: "Polly.Other", static: false, global: false, alias: "G" },
    ]);
    expect(facts.namespaces).toEqual(["Polly.CircuitBreaker"]);
  });

  it("finds types in file-scoped and nested block namespaces", () => {
    const facts = parseCSharpFile(`namespace A { namespace B { public class X<T> where T : class\n where U : struct { } } public record struct P(int X); public delegate void H(object s); public enum E { One } }\nnamespace C.D { interface I {} sealed partial class Z { class Nested {} } }\n`);
    expect(facts.types.filter((t) => !t.nested).map((t) => `${t.namespace}.${t.name}`)).toEqual(["A.B.X", "A.P", "A.H", "A.E", "C.D.I", "C.D.Z"]);
    expect(facts.types.find((t) => t.name === "Nested").nested).toBe(true);
    expect(facts.types.map((t) => t.name)).not.toContain("where");
  });
});

describe("C# type resolution", () => {
  it("resolves the enclosing namespace, parent namespaces, and using directives", async () => {
    const files = await writeAll({
      "src/App/App.csproj": "<Project Sdk=\"Microsoft.NET.Sdk\"></Project>",
      "src/App/Retry/RetryStrategy.cs": "namespace App.Retry;\nusing App.Telemetry;\npublic class RetryStrategy { RetryOptions o; Outcome r; Listener l; }\n",
      "src/App/Retry/RetryOptions.cs": "namespace App.Retry;\npublic class RetryOptions {}\n",
      "src/App/Outcome.cs": "namespace App;\npublic readonly struct Outcome {}\n",
      "src/App/Telemetry/Listener.cs": "namespace App.Telemetry;\npublic class Listener {}\n",
      "src/App/Telemetry/Unrelated.cs": "namespace App.Telemetry;\npublic class Unrelated {}\n",
    });
    const graph = await analyzeDependencyGraph(files, tempDir);
    expect(importsOf(graph, "src/App/Retry/RetryStrategy.cs")).toEqual([
      "src/App/Outcome.cs",
      "src/App/Retry/RetryOptions.cs",
      "src/App/Telemetry/Listener.cs",
    ]);
  });

  it("resolves a using inside a namespace relative to it (`namespace MediatR.Pipeline; using Internal;`)", async () => {
    const files = await writeAll({
      "src/M/M.csproj": "<Project/>",
      "src/M/Pipeline/Behavior.cs": "namespace M.Pipeline;\nusing Internal;\npublic class Behavior { ObjectDetails d; }\n",
      "src/M/Internal/ObjectDetails.cs": "namespace M.Internal;\ninternal class ObjectDetails {}\n",
    });
    const graph = await analyzeDependencyGraph(files, tempDir);
    expect(importsOf(graph, "src/M/Pipeline/Behavior.cs")).toEqual(["src/M/Internal/ObjectDetails.cs"]);
    expect(graph.externalDeps).toEqual([]);
  });

  it("applies global usings from any file, the csproj, and Directory.Build.props to the whole project", async () => {
    const files = await writeAll({
      "Directory.Build.props": "<Project><ItemGroup><Using Include=\"Shared.Logging\" /></ItemGroup></Project>",
      "src/App/App.csproj": "<Project><ItemGroup><Using Include=\"App.Models\" /><Using Include=\"App.Gone\" Remove=\"true\" /></ItemGroup></Project>",
      "src/App/GlobalUsings.cs": "global using App.Utils;\n",
      "src/App/Service.cs": "namespace App.Services;\npublic class Service { Guard g; User u; Log l; }\n",
      "src/App/Utils/Guard.cs": "namespace App.Utils;\npublic static class Guard {}\n",
      "src/App/Models/User.cs": "namespace App.Models;\npublic class User {}\n",
      "src/App/Logging/Log.cs": "namespace Shared.Logging;\npublic class Log {}\n",
    });
    const graph = await analyzeDependencyGraph(files, tempDir);
    expect(importsOf(graph, "src/App/Service.cs")).toEqual(["src/App/Logging/Log.cs", "src/App/Models/User.cs", "src/App/Utils/Guard.cs"]);
  });

  it("resolves using static, aliases, attributes, and qualified names", async () => {
    const files = await writeAll({
      "src/A/A.csproj": "<Project/>",
      "src/A/Use.cs": "using static A.Util.Guard;\nusing Opt = A.Config.Options;\nnamespace A.Feature;\n[Cached]\npublic class Use { Opt o; object x = A.Data.Store.Instance; void M() { NotNull(o); } }\n",
      "src/A/Util/Guard.cs": "namespace A.Util;\npublic static class Guard { public static void NotNull(object o) {} }\n",
      "src/A/Config/Options.cs": "namespace A.Config;\npublic class Options {}\n",
      "src/A/Feature/CachedAttribute.cs": "namespace A.Feature;\npublic sealed class CachedAttribute : System.Attribute {}\n",
      "src/A/Data/Store.cs": "namespace A.Data;\npublic class Store { public static Store Instance; }\n",
    });
    const graph = await analyzeDependencyGraph(files, tempDir);
    expect(importsOf(graph, "src/A/Use.cs")).toEqual([
      "src/A/Config/Options.cs",
      "src/A/Data/Store.cs",
      "src/A/Feature/CachedAttribute.cs",
      "src/A/Util/Guard.cs",
    ]);
  });

  it("does not link every file to a project-wide alias or static using", async () => {
    const files = await writeAll({
      "src/A/A.csproj": "<Project><ItemGroup><Using Include=\"A.Util.Guard\" Static=\"true\" /></ItemGroup></Project>",
      "src/A/GlobalUsings.cs": "global using Opt = A.Config.Options;\n",
      "src/A/Util/Guard.cs": "namespace A.Util;\npublic static class Guard {}\n",
      "src/A/Config/Options.cs": "namespace A.Config;\npublic class Options {}\n",
      "src/A/Plain.cs": "namespace A;\npublic class Plain {}\n",
      "src/A/UsesAlias.cs": "namespace A;\npublic class UsesAlias { Opt o; }\n",
    });
    const graph = await analyzeDependencyGraph(files, tempDir);
    expect(importsOf(graph, "src/A/Plain.cs")).toEqual([]);
    expect(importsOf(graph, "src/A/UsesAlias.cs")).toEqual(["src/A/Config/Options.cs"]);
  });

  it("sees only its own and referenced projects (transitively)", async () => {
    const files = await writeAll({
      "src/Core/Core.csproj": "<Project/>",
      "src/Legacy/Legacy.csproj": "<Project/>",
      "src/Ext/Ext.csproj": "<Project><ItemGroup><ProjectReference Include=\"..\\Core\\Core.csproj\" /></ItemGroup></Project>",
      "test/Ext.Tests/Ext.Tests.csproj": "<Project><ItemGroup><ProjectReference Include=\"..\\..\\src\\Ext\\Ext.csproj\" /></ItemGroup></Project>",
      "src/Core/Context.cs": "namespace Polly;\npublic class Context {}\n",
      "src/Legacy/Context.cs": "namespace Polly;\npublic class Context {}\n",
      "src/Ext/Telemetry.cs": "namespace Polly.Extensions;\npublic class Telemetry { Context c; }\n",
      "test/Ext.Tests/TelemetryTests.cs": "namespace Polly.Extensions.Tests;\npublic class TelemetryTests { Context c; Telemetry t; }\n",
    });
    const graph = await analyzeDependencyGraph(files, tempDir);
    expect(importsOf(graph, "src/Ext/Telemetry.cs")).toEqual(["src/Core/Context.cs"]);
    expect(importsOf(graph, "test/Ext.Tests/TelemetryTests.cs")).toEqual(["src/Core/Context.cs", "src/Ext/Telemetry.cs"]);
  });

  it("resolves a partial type to the file named after it", async () => {
    const files = await writeAll({
      "src/P/P.csproj": "<Project/>",
      "src/P/ResiliencePipeline.Async.cs": "namespace P;\npublic partial class ResiliencePipeline {}\n",
      "src/P/ResiliencePipeline.cs": "namespace P;\npublic sealed partial class ResiliencePipeline {}\n",
      "src/P/Builder.cs": "namespace P;\npublic class Builder { ResiliencePipeline p; }\n",
    });
    const graph = await analyzeDependencyGraph(files, tempDir);
    expect(importsOf(graph, "src/P/Builder.cs")).toEqual(["src/P/ResiliencePipeline.cs"]);
  });

  it("labels external namespaces by PackageReference and skips the base library", async () => {
    const files = await writeAll({
      "Directory.Packages.props": "<Project><ItemGroup><PackageVersion Include=\"BenchmarkDotNet\" Version=\"1\" /><PackageVersion Include=\"System.Threading.RateLimiting\" Version=\"1\" /><PackageVersion Include=\"Microsoft.Extensions.Logging.Abstractions\" Version=\"1\" /></ItemGroup></Project>",
      "src/A/A.csproj": "<Project/>",
      "src/A/X.cs": "using System;\nusing System.Linq;\nusing System.Threading.RateLimiting;\nusing BenchmarkDotNet.Attributes;\nusing Microsoft.Extensions.Logging;\nusing Newtonsoft.Json.Linq;\nnamespace A;\npublic class X {}\n",
    });
    const graph = await analyzeDependencyGraph(files, tempDir);
    expect(graph.externalDeps).toEqual([
      "BenchmarkDotNet",
      "Microsoft.Extensions.Logging.Abstractions",
      "Newtonsoft.Json",
      "System.Threading.RateLimiting",
    ]);
  });

  it("reports a root namespace and its sub-namespace as a Low parent/child cycle", async () => {
    const files = await writeAll({
      "src/Polly/Polly.csproj": "<Project/>",
      "src/Polly/RetryBuilderExtensions.cs": "namespace Polly;\nusing Polly.Retry;\npublic static class RetryBuilderExtensions { static void AddRetry(RetryOptions o) {} }\n",
      "src/Polly/Retry/RetryOptions.cs": "namespace Polly.Retry;\npublic class RetryOptions { ResilienceContext c; }\n",
      "src/Polly/ResilienceContext.cs": "namespace Polly;\npublic class ResilienceContext {}\n",
    });
    const graph = await analyzeDependencyGraph(files, tempDir);
    expect(graph.cycles).toEqual([["Polly", "Polly.Retry", "Polly"]]);
    expect(graph.cycleReports[0].priority).toBe("low");
    expect(graph.stats.lowCycleLabel).toBe("parent/child namespace cycle, common in C#; verify");
    expect(cycleConcern(graph.stats)).toContain("parent/child namespace cycle, common in C#; verify. Priority: Low.");
    expect(cycleStatusCell(graph.stats).advice).toBe("parent/child namespace cycle, common in C#; verify");
  });

  it("does not link project code to global-namespace types in a script outside every project", async () => {
    const files = await writeAll({
      "src/A/A.csproj": "<Project/>",
      "cake.cs": "class Context {}\nclass BuildTask {}\n",
      "src/A/Use.cs": "namespace A;\npublic class Use { Context c; }\n",
      "src/A/Context.cs": "namespace A.Other;\npublic class Context {}\n",
    });
    const graph = await analyzeDependencyGraph(files, tempDir);
    expect(importsOf(graph, "src/A/Use.cs")).toEqual([]);
  });

  it("skips generated C# under obj/", async () => {
    const files = await writeAll({
      "src/A/A.csproj": "<Project/>",
      "src/A/obj/Debug/A.AssemblyInfo.cs": "namespace A;\nclass Gen {}\n",
      "src/A/Form.Designer.cs": "namespace A;\npartial class Form {}\n",
      "src/A/X.cs": "namespace A;\nclass X {}\n",
    });
    const graph = await analyzeDependencyGraph(files, tempDir);
    expect(graph.nodes.map((n) => n.file)).toEqual(["src/A/X.cs"]);
  });
});

describe("helpers", () => {
  it("reads Maven and Gradle dependency groups", () => {
    const groups = parseJavaBuildGroups(`<dependency><groupId>org.junit.jupiter</groupId></dependency><dependency><groupId>\${project.groupId}</groupId></dependency>\nimplementation("com.google.guava:guava:33.0")\ntestImplementation 'org.mockito:mockito-core:5'\n[libraries]\nbytebuddy = { module = "net.bytebuddy:byte-buddy" }\n`);
    expect([...groups].sort()).toEqual(["com.google.guava", "net.bytebuddy", "org.junit.jupiter", "org.mockito"]);
    expect(javaExternalName("org.junit.jupiter.api", groups)).toBe("org.junit.jupiter");
    expect(javaExternalName("com.google.common.truth", groups)).toBe("com.google.common.truth");
    expect(javaExternalName("a.b.c.d.e", [])).toBe("a.b.c.d");
    expect(isJavaStdlib("java.util")).toBe(true);
    expect(isJavaStdlib("javax.annotation")).toBe(true);
    expect(isJavaStdlib("javafx.scene")).toBe(false);
  });

  it("reads MSBuild items and names C# packages", () => {
    const parsed = parseMsBuildProject(`<Project><!-- <ProjectReference Include="Gone.csproj" /> --><ItemGroup><ProjectReference Include="..\\Core\\Core.csproj" /><PackageReference Include="xunit.v3" /><Using Include="Xunit" /><Using Include="Polly.Guard" Static="true" /><Using Include="X.Y" Alias="Z" /></ItemGroup></Project>`);
    expect(parsed.projectReferences).toEqual(["../Core/Core.csproj"]);
    expect(parsed.packages).toEqual(["xunit.v3"]);
    expect(parsed.usings).toEqual([
      { name: "Xunit", static: false, alias: null, global: true },
      { name: "Polly.Guard", static: true, alias: null, global: true },
      { name: "X.Y", static: false, alias: "Z", global: true },
    ]);
    expect(csharpExternalName("Xunit", ["xunit.v3", "xunit.runner.visualstudio"])).toBe("xunit.v3");
    expect(csharpExternalName("Microsoft.Extensions.Hosting", ["Microsoft.Extensions.Logging"])).toBe("Microsoft.Extensions.Hosting");
    expect(isCSharpStdlib("System.Collections.Generic")).toBe(true);
    expect(isCSharpStdlib("System.Threading.RateLimiting", ["System.Threading.RateLimiting"])).toBe(false);
  });
});

describe("Java and C# code health", () => {
  it("counts decisions but not generic wildcards, nullable types, or null-conditional access", () => {
    expect(computeCLikeComplexity("List<? extends T> a; Map<String, ?> m; Class<?> c;", "java")).toBe(1);
    expect(computeCLikeComplexity("int? x; var y = a?.b; var z = arr?[0];", "csharp")).toBe(1);
    expect(computeCLikeComplexity("if (a && b) {} else if (c || d) {} for (;;) {} while (x) {} x = a ? b : c;", "java")).toBe(8);
    expect(computeCLikeComplexity("foreach (var v in xs) { } var n = a ?? b; switch (k) { case 1: break; case 2: break; } try {} catch (E e) {}", "csharp")).toBe(6);
    expect(computeCLikeComplexity('// if (a) {}\nString s = "if (b) {}";', "java")).toBe(1);
  });

  it("extracts methods and constructors, not calls or control statements", () => {
    const java = "class A {\n  public A(int x) { if (x > 0) {} }\n  @Override\n  public <T extends Comparable<? super T>> List<T> sort(List<? extends T> in) throws IOException {\n    foo(bar);\n    return null;\n  }\n  abstract int nobody();\n}\n";
    expect(extractCLikeFunctions(java, "java").map((f) => f.name)).toEqual(["A", "sort"]);
    const iface = "interface I {\n  default int size() { return 0; }\n  static I of() { return null; }\n  public synchronized void lock() { }\n}\n";
    expect(extractCLikeFunctions(iface, "java").map((f) => f.name)).toEqual(["size", "of", "lock"]);
    const cs = "class B {\n  public B(int x) : base(x) { }\n  public int? Get(string? s) => s?.Length ?? 0;\n  public async Task<int> RunAsync<T>(T x) where T : class\n  {\n    if (x == null) return 1;\n    return await Next(x);\n  }\n  public int Prop { get; set; }\n}\n";
    expect(extractCLikeFunctions(cs, "csharp").map((f) => f.name)).toEqual(["B", "Get", "RunAsync"]);
  });

  it("scores product Java and C#, skipping tests, descriptors, and generated files", async () => {
    const files = await writeAll({
      "src/main/java/p/A.java": "package p;\nclass A { int f(int x) { if (x > 0) return 1; return 0; } }\n",
      "src/main/java/p/package-info.java": "package p;\n",
      "src/test/java/p/ATest.java": "package p;\nclass ATest {}\n",
      "lib/p/BTest.java": "package p;\nclass BTest {}\n",
      "src/App/X.cs": "namespace App;\nclass X {}\n",
      "src/App.Tests/XTests.cs": "namespace App.Tests;\nclass XTests {}\n",
      "src/App/obj/Gen.cs": "namespace App;\nclass Gen {}\n",
    });
    const complexity = await analyzeComplexity(files, tempDir);
    expect(complexity.files.map((f) => f.file).sort()).toEqual(["src/App/X.cs", "src/main/java/p/A.java"]);
    const graph = await analyzeDependencyGraph(files, tempDir);
    const health = computeCodeHealth(complexity, graph, null, null);
    expect(health.stats.totalFiles).toBe(2);
  });

  it("gives a badge score for a C# repository with a docs script", async () => {
    await write("src/Polly/Polly.csproj", "<Project/>");
    for (let i = 0; i < 10; i++) await write(`src/Polly/C${i}.cs`, `namespace Polly;\npublic class C${i} { public int F(int x) { if (x > ${i}) return 1; return 0; } }\n`);
    await write("docs/main.js", "export const a = 1;\n");
    const scored = await scoreRepository(tempDir);
    expect(scored.health.coverage.status).toBe("full");
    expect(scored.health.stats.totalFiles).toBeGreaterThanOrEqual(10);
  });
});

describe("coverage and path roles", () => {
  it("analyzes .java and .cs, labels Kotlin and Scala, and ignores Gradle build scripts", () => {
    expect(ANALYZED_LANGUAGES_TEXT).toBe("JavaScript/TypeScript, Python, Go, Java, and C#");
    expect(computeLanguageCoverage(["src/A.java", "src/B.cs"]).status).toBe("full");
    expect(computeLanguageCoverage(["build.gradle.kts", "settings.gradle.kts", "src/main/java/A.java"]).status).toBe("full");
    const mixed = computeLanguageCoverage(["src/main/java/A.java", "src/main/kotlin/B.kt", "src/main/scala/C.scala"]);
    expect(mixed.status).toBe("partial");
    expect(mixed.unanalyzedLanguages.map((l) => l.label).sort()).toEqual(["Kotlin", "Scala"]);
  });

  it("recognizes .NET test and benchmark projects and Java test classes", () => {
    expect(isTestPath("src/Polly.Core.Tests/A.cs")).toBe(true);
    expect(isTestPath("test/Polly.Specs/A.cs")).toBe(true);
    expect(isTestPath("src/App.UnitTests/A.cs")).toBe(true);
    expect(isTestPath("lib/com/x/GsonTest.java")).toBe(true);
    expect(isTestPath("lib/com/x/ParserTests.cs")).toBe(true);
    expect(isTestPath("lib/com/x/FooIT.java")).toBe(true);
    expect(isTestPath("src/testFixtures/java/a/B.java")).toBe(true);
    expect(isTestPath("lib/com/x/Contest.java")).toBe(false);
    expect(isTestPath("src/Polly.Testing/A.cs")).toBe(false);
    expect(isNonProductPath("src/Polly.Core.Benchmarks/A.cs")).toBe(true);
    expect(isNonProductPath("src/jmh/java/a/B.java")).toBe(true);
  });

  it("keeps JS/TS file cycles next to Java package analysis in one repository", async () => {
    const files = await writeAll({
      "web/a.js": "import { b } from './b.js';\nexport const a = () => b();\n",
      "web/b.js": "import { a } from './a.js';\nexport const b = () => a();\n",
      [`${J}/p/A.java`]: "package p;\nclass A { B b; }\n",
      [`${J}/p/B.java`]: "package p;\nclass B { A a; }\n",
    });
    const graph = await analyzeDependencyGraph(files, tempDir);
    expect(graph.stats.cycles).toBe(1);
    expect(graph.stats.packageCycles).toBe(0);
    expect(graph.cycles[0]).toEqual(["web/a", "web/b", "web/a"]);
  });

  it("lowCycleLabel mixes wording when JS mutual recursion and package cycles are both low", () => {
    expect(lowCycleLabel([{ priority: "low", label: "mutual recursion, probably intentional; verify" }, { priority: "low", label: "parent/child package cycle, common in Java; verify" }])).toBe("probably intentional; verify");
    expect(lowCycleLabel([{ priority: "high", label: "x" }])).toBeNull();
  });
});

describe("Java and C# build and test tooling", () => {
  it("detects Maven/Gradle/MSBuild and JUnit/TestNG/xUnit/NUnit/MSTest from project files", async () => {
    await write("core/pom.xml", "<project><dependencies><dependency><groupId>org.junit.jupiter</groupId><artifactId>junit-jupiter</artifactId></dependency></dependencies></project>");
    await write("app/build.gradle.kts", "dependencies { testImplementation(\"org.testng:testng:7.10.0\") }");
    await write("src/A.Tests/A.Tests.csproj", "<Project><ItemGroup><PackageReference Include=\"xunit.v3\" /><PackageReference Include=\"NUnit\" /><PackageReference Include=\"MSTest.TestFramework\" /></ItemGroup></Project>");
    const metadata = { buildTools: [], testFrameworks: [] };
    await detectJvmDotnetTooling(tempDir, metadata);
    expect([...new Set(metadata.buildTools)].sort()).toEqual(["Gradle", "MSBuild (.NET)", "Maven"]);
    expect([...new Set(metadata.testFrameworks)].sort()).toEqual(["JUnit 5", "MSTest", "NUnit", "TestNG", "xUnit"]);
  });

  it("finds nothing in a JavaScript-only repository", async () => {
    await write("package.json", "{\"name\":\"x\"}");
    const metadata = { buildTools: [], testFrameworks: [] };
    await detectJvmDotnetTooling(tempDir, metadata);
    expect(metadata).toEqual({ buildTools: [], testFrameworks: [] });
  });
});
