// Java and C# import graphs.
//
// Java and C# name types, not files. A file depends on another file when it uses a type
// declared there. RepoLens finds those uses without a compiler:
//
// Java
// - `package a.b;` puts every top-level type of the file in package `a.b`.
// - `import a.b.C;` (single type) is an edge to the file that declares C when the file
//   uses the name C in code. An import used only in Javadoc (`{@link C}`) or unused
//   leaves no class-file dependency and is not an edge. Nested types
//   (`import a.b.Outer.Inner;`) resolve to Outer's file.
// - `import a.b.*;` (on demand) and same-package types are edges only for type names the
//   file actually uses. Single-type imports shadow same-package types, which shadow
//   on-demand imports, as in the Java language spec.
// - `import static a.b.C.m;` and `import static a.b.C.*;` are edges to C's file.
// - Fully qualified uses (`a.b.C.method()`) are edges too.
// - Source roots come from the package declaration (`src/main/java`, `src/test/java`,
//   any layout), and build modules from the nearest `pom.xml` / `build.gradle(.kts)`.
//   When the same type exists in several modules (guava's `android/` flavor), the
//   importer's own module wins, then the closest path.
//
// C#
// - `namespace A.B;` and `namespace A.B { }` (nested blocks combine) declare types.
// - A simple type name resolves in the file's namespace and its parents, then through
//   `using` directives, `global using` directives in the same project (and
//   `<Using Include>` items in the csproj or Directory.Build.props), `using static`, and
//   `using Alias = A.B.Type;`. `[Foo]` also looks for `FooAttribute`.
// - Projects are the nearest `*.csproj`. A file sees types in its own project and in
//   projects it references (`<ProjectReference>`, transitively). Files outside any project
//   see everything.
// - Partial types declared across several files resolve to the file named after the type.
//
// Comments, strings, and C# preprocessor lines are ignored. This is a name-based
// approximation: a local variable named like a type can add an edge, and types brought in
// by inheritance from another package are seen only when the name appears.
//
// Cycles: classes in one Java package or C# namespace referring to each other is normal
// and not reported. Cycles are reported between packages / namespaces (see
// dependency-graph.js), which is what ArchUnit and NDepend check.

import fs from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";

export const JAVA_EXTENSIONS = new Set([".java"]);
export const CSHARP_EXTENSIONS = new Set([".cs"]);

const JAVA_KEYWORDS = new Set([
  "abstract", "assert", "boolean", "break", "byte", "case", "catch", "char", "class", "const",
  "continue", "default", "do", "double", "else", "enum", "extends", "final", "finally", "float",
  "for", "goto", "if", "implements", "import", "instanceof", "int", "interface", "long", "native",
  "new", "package", "private", "protected", "public", "return", "short", "static", "strictfp",
  "super", "switch", "synchronized", "this", "throw", "throws", "transient", "try", "void",
  "volatile", "while", "var", "yield", "record", "sealed", "permits", "non", "true", "false", "null",
]);

const CSHARP_KEYWORDS = new Set([
  "abstract", "as", "base", "bool", "break", "byte", "case", "catch", "char", "checked", "class",
  "const", "continue", "decimal", "default", "delegate", "do", "double", "else", "enum", "event",
  "explicit", "extern", "false", "finally", "fixed", "float", "for", "foreach", "goto", "if",
  "implicit", "in", "int", "interface", "internal", "is", "lock", "long", "namespace", "new", "null",
  "object", "operator", "out", "override", "params", "private", "protected", "public", "readonly",
  "ref", "return", "sbyte", "sealed", "short", "sizeof", "stackalloc", "static", "string", "struct",
  "switch", "this", "throw", "true", "try", "typeof", "uint", "ulong", "unchecked", "unsafe",
  "ushort", "using", "virtual", "void", "volatile", "while", "var", "where", "record", "global",
  "async", "await", "dynamic", "nameof", "when", "yield", "get", "set", "init", "value", "partial",
  "file", "required", "scoped", "notnull", "unmanaged", "nint", "nuint",
]);

export function isJavaFile(file) {
  return JAVA_EXTENSIONS.has(path.extname(String(file)).toLowerCase());
}

export function isCSharpFile(file) {
  return CSHARP_EXTENSIONS.has(path.extname(String(file)).toLowerCase());
}

/** package-info.java and module-info.java declare no types; they are not graph nodes. */
export function isJavaMetadataFile(file) {
  return /(^|\/)(package|module)-info\.java$/.test(String(file).replace(/\\/g, "/"));
}

/** Generated C# (`obj/`, `*.g.cs`, `*.Designer.cs`) is build output, not source. */
export function isGeneratedCSharpFile(file) {
  const norm = String(file).replace(/\\/g, "/");
  return /(^|\/)(obj|bin)\//.test(norm) || /\.(g|g\.i|designer|generated)\.cs$/i.test(norm);
}

function blank(text) {
  return text.replace(/[^\n]/g, " ");
}

/**
 * Comments and string/char literals replaced with spaces (newlines kept, so line numbers
 * and `^` anchors still work). `lang` is "java" or "csharp". C# preprocessor lines go too.
 */
export function stripCLike(source, lang = "java") {
  const src = String(source || "");
  const n = src.length;
  let out = "";
  let i = 0;
  const csharp = lang === "csharp";
  let lineStart = true;
  while (i < n) {
    const ch = src[i];
    if (csharp && lineStart) {
      // Preprocessor directive: whole line.
      let j = i;
      while (j < n && (src[j] === " " || src[j] === "\t")) j += 1;
      if (src[j] === "#") {
        let k = j;
        while (k < n && src[k] !== "\n") k += 1;
        out += blank(src.slice(i, k));
        i = k;
        continue;
      }
    }
    if (ch === "\n") {
      out += ch;
      i += 1;
      lineStart = true;
      continue;
    }
    if (ch !== " " && ch !== "\t" && ch !== "\r") lineStart = false;
    if (ch === "/" && src[i + 1] === "/") {
      let k = i;
      while (k < n && src[k] !== "\n") k += 1;
      out += blank(src.slice(i, k));
      i = k;
      continue;
    }
    if (ch === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      const k = end === -1 ? n : end + 2;
      out += blank(src.slice(i, k));
      i = k;
      continue;
    }
    if (ch === "'") {
      // Char literal: 'a', '\n', '\u0041', '\''.
      let k = i + 1;
      while (k < n && k < i + 12 && src[k] !== "'" && src[k] !== "\n") k += src[k] === "\\" ? 2 : 1;
      if (src[k] === "'") {
        out += blank(src.slice(i, k + 1));
        i = k + 1;
        continue;
      }
      out += ch;
      i += 1;
      continue;
    }
    // C# string prefixes: $, @, $@, @$, $$ (raw interpolated), u8 suffix is harmless.
    let prefixLen = 0;
    let verbatim = false;
    if (csharp) {
      let k = i;
      while (k < n && (src[k] === "$" || src[k] === "@") && k - i < 4) {
        if (src[k] === "@") verbatim = true;
        k += 1;
      }
      if (k > i && src[k] === '"' && !/[\w$]/.test(src[i - 1] || "")) prefixLen = k - i;
      else verbatim = false;
    }
    const q = i + prefixLen;
    if (src[q] === '"') {
      // Text block (Java) or raw string literal (C#): three or more quotes.
      let quotes = 0;
      while (src[q + quotes] === '"') quotes += 1;
      if (quotes >= 3) {
        const fence = '"'.repeat(quotes);
        const end = src.indexOf(fence, q + quotes);
        const k = end === -1 ? n : end + quotes;
        out += blank(src.slice(i, k));
        i = k;
        continue;
      }
      let k = q + 1;
      if (verbatim) {
        while (k < n) {
          if (src[k] === '"' && src[k + 1] === '"') {
            k += 2;
            continue;
          }
          if (src[k] === '"') break;
          k += 1;
        }
      } else {
        while (k < n && src[k] !== '"' && src[k] !== "\n") k += src[k] === "\\" ? 2 : 1;
      }
      k = Math.min(n, k + 1);
      out += blank(src.slice(i, k));
      i = k;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

const IDENT = /[A-Za-z_$][\w$]*/g;

function identifiersOf(code) {
  const names = new Set();
  for (const match of code.matchAll(IDENT)) names.add(match[0]);
  return names;
}

// Dotted chains such as `com.google.gson.Gson` or `Polly.Utils.Guard`.
function dottedChains(code) {
  const chains = new Set();
  const re = /(?:global\s*::\s*)?[A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)+/g;
  for (const match of code.matchAll(re)) {
    const text = match[0].replace(/^global\s*::\s*/, "").replace(/\s+/g, "");
    if (text.split(".").length <= 12) chains.add(text);
  }
  return chains;
}

// Brace-depth aware type declaration scanner shared by both languages.
// Returns [{ name, depth, namespace, nested: boolean }].
function scanTypeDeclarations(code, lang) {
  const types = [];
  const keywords = lang === "csharp"
    ? /\b(?:(record)\s+(?:struct\s+|class\s+)?|(class|interface|struct|enum)\s+|(delegate)\s+[\w<>[\],.?\s]+?\s+(?=[A-Za-z_]\w*\s*[<(])|(namespace)\s+)([A-Za-z_][\w.]*)/g
    : /(?:\b(class|interface|enum|record)|(@)\s*interface)\s+([A-Za-z_$][\w$]*)/g;
  const events = [];
  for (const match of code.matchAll(keywords)) {
    const before = code.slice(Math.max(0, match.index - 40), match.index);
    if (/\.\s*$/.test(before)) continue; // Foo.class, typeof(x).Namespace
    if (lang === "csharp") {
      const isNamespace = Boolean(match[4]);
      const name = match[5];
      if (!isNamespace && (CSHARP_KEYWORDS.has(name) || name.includes("."))) continue;
      events.push({ index: match.index, kind: isNamespace ? "namespace" : "type", name, end: match.index + match[0].length });
    } else {
      const name = match[3];
      if (JAVA_KEYWORDS.has(name)) continue;
      events.push({ index: match.index, kind: "type", name, end: match.index + match[0].length });
    }
  }
  // Walk braces; attach each declaration to the next `{` (or `;` for file-scoped namespaces).
  const stack = []; // { kind, name, depth }
  let depth = 0;
  let e = 0;
  let pending = [];
  let fileNamespace = null;
  for (let i = 0; i < code.length; i += 1) {
    while (e < events.length && events[e].index === i) {
      const ev = events[e];
      const scopeNs = currentNamespace();
      const enclosingType = stack.some((s) => s.kind === "type");
      if (ev.kind === "type") {
        types.push({ name: ev.name, namespace: scopeNs, nested: enclosingType });
      }
      pending.push(ev);
      e += 1;
    }
    const ch = code[i];
    if (ch === "{") {
      depth += 1;
      const ev = pending.length > 0 ? pending[pending.length - 1] : null;
      if (ev && i >= ev.end) {
        stack.push({ kind: ev.kind, name: ev.name, depth });
        pending = [];
      }
    } else if (ch === "}") {
      while (stack.length > 0 && stack[stack.length - 1].depth >= depth) stack.pop();
      depth = Math.max(0, depth - 1);
      pending = [];
    } else if (ch === ";") {
      const ev = pending.length > 0 ? pending[pending.length - 1] : null;
      if (ev && ev.kind === "namespace" && i >= ev.end && depth === 0) fileNamespace = ev.name;
      // `record Point(int X, int Y);`, `delegate void D();`, `enum` never ends with `;` first.
      pending = pending.filter((p) => p.kind !== "namespace");
      if (pending.length > 0 && i >= pending[pending.length - 1].end) pending = [];
    }
  }
  function currentNamespace() {
    const parts = [];
    if (fileNamespace) parts.push(fileNamespace);
    for (const s of stack) if (s.kind === "namespace") parts.push(s.name);
    return parts.join(".");
  }
  return types;
}

/**
 * Java file facts.
 * @returns {{ package: string, imports: {name: string, static: boolean, wildcard: boolean}[],
 *   types: string[], topLevelTypes: string[], identifiers: Set<string>, chains: Set<string> }}
 */
export function parseJavaFile(source) {
  const code = stripCLike(source, "java");
  const pkgMatch = code.match(/^\s*package\s+([A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*)\s*;/m);
  const pkg = pkgMatch ? pkgMatch[1].replace(/\s+/g, "") : "";
  const imports = [];
  const importRe = /\bimport\s+(static\s+)?([A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*)(\s*\.\s*\*)?\s*;/g;
  for (const match of code.matchAll(importRe)) {
    imports.push({ name: match[2].replace(/\s+/g, ""), static: Boolean(match[1]), wildcard: Boolean(match[3]) });
  }
  // Body without the package and import declarations: those names are not uses.
  const body = code.replace(/\bpackage\s+[\w$.\s]+;/, " ").replace(importRe, " ");
  const declared = scanTypeDeclarations(body, "java");
  return {
    package: pkg,
    imports,
    types: declared.map((t) => t.name),
    topLevelTypes: declared.filter((t) => !t.nested).map((t) => t.name),
    identifiers: identifiersOf(body),
    chains: dottedChains(body),
  };
}

/**
 * C# file facts.
 * @returns {{ namespaces: string[], usings: {name: string, static: boolean, global: boolean, alias: string|null}[],
 *   types: {name: string, namespace: string, nested: boolean}[], identifiers: Set<string>, chains: Set<string> }}
 */
export function parseCSharpFile(source) {
  const code = stripCLike(source, "csharp");
  const usings = [];
  const usingRe = /(^|[;{}\n])[ \t]*(global[ \t]+)?using[ \t]+(static[ \t]+)?(?:([A-Za-z_]\w*)[ \t]*=[ \t]*)?((?:global[ \t]*::[ \t]*)?[A-Za-z_][\w]*(?:[ \t]*\.[ \t]*[A-Za-z_]\w*)*)[ \t]*(<[^;{}()]*>)?[ \t]*;/g;
  for (const match of code.matchAll(usingRe)) {
    const name = match[5].replace(/\s+/g, "").replace(/^global::/, "");
    if (!match[4] && (name === "var" || CSHARP_KEYWORDS.has(name))) continue;
    usings.push({ name, static: Boolean(match[3]), global: Boolean(match[2]), alias: match[4] || null });
  }
  const body = code.replace(usingRe, (m, lead) => `${lead}${blank(m.slice(lead.length))}`);
  const declared = scanTypeDeclarations(body, "csharp");
  const namespaces = [...new Set(declared.map((t) => t.namespace))];
  // Namespace-only files (no types) still have a namespace for resolving.
  const nsRe = /\bnamespace\s+([A-Za-z_][\w.]*)/g;
  for (const match of body.matchAll(nsRe)) {
    if (!namespaces.includes(match[1]) && declared.length === 0) namespaces.push(match[1]);
  }
  return {
    namespaces: namespaces.length > 0 ? namespaces : [""],
    usings,
    types: declared,
    identifiers: identifiersOf(body.replace(/\bnamespace\s+[A-Za-z_][\w.]*/g, " ")),
    chains: dottedChains(body.replace(/\bnamespace\s+[A-Za-z_][\w.]*/g, " ")),
  };
}

// ---------------------------------------------------------------------------
// Shared helpers

function dirOf(file) {
  const d = path.posix.dirname(String(file).replace(/\\/g, "/"));
  return d === "." ? "" : d;
}

function commonPrefixLength(a, b) {
  const pa = a.split("/");
  const pb = b.split("/");
  let n = 0;
  while (n < pa.length && n < pb.length && pa[n] === pb[n]) n += 1;
  return n;
}

function isUnder(file, dir) {
  if (!dir) return true;
  return file === dir || file.startsWith(`${dir}/`);
}

function nearestDir(file, dirs) {
  let best = null;
  for (const dir of dirs) {
    if (isUnder(file, dir) && (best === null || dir.length > best.length)) best = dir;
  }
  return best;
}

async function readText(file) {
  try {
    return await fs.readFile(file, "utf8");
  } catch {
    return "";
  }
}

const BUILD_IGNORE = ["**/node_modules/**", "**/.git/**", "**/target/**", "**/build/**", "**/bin/**", "**/obj/**", "**/.repolens/**"];

async function globRepo(repoRoot, patterns) {
  try {
    return await fg(patterns, { cwd: repoRoot, ignore: BUILD_IGNORE, onlyFiles: true, deep: 8, followSymbolicLinks: false });
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Java

const JAVA_STDLIB_PREFIXES = ["java.", "javax.", "jdk.", "sun.", "com.sun.", "org.w3c.dom", "org.xml.sax", "org.ietf.jgss", "org.omg."];

export function isJavaStdlib(name) {
  return JAVA_STDLIB_PREFIXES.some((prefix) => name === prefix.replace(/\.$/, "") || name.startsWith(prefix.endsWith(".") ? prefix : `${prefix}.`));
}

/** The package part of an import (`a.b.C.Inner` → `a.b`): segments before the first capitalized one. */
export function javaPackageOf(name) {
  const segs = String(name).split(".");
  const out = [];
  for (const seg of segs) {
    if (/^[A-Z]/.test(seg)) break;
    out.push(seg);
  }
  return out.join(".");
}

/** Maven `<groupId>` values of dependencies and Gradle `"group:artifact:version"` strings. */
export function parseJavaBuildGroups(text) {
  const groups = new Set();
  const src = String(text || "");
  for (const block of src.matchAll(/<dependency>([\s\S]*?)<\/dependency>/g)) {
    const g = block[1].match(/<groupId>\s*([\w.-]+)\s*<\/groupId>/);
    if (g && !g[1].includes("${")) groups.add(g[1]);
  }
  for (const m of src.matchAll(/["']([A-Za-z][\w.-]*\.[\w.-]+):[\w.-]+(?::[^"'\s]*)?["']/g)) groups.add(m[1]);
  for (const m of src.matchAll(/\bgroup\s*=\s*["']([\w.-]+)["']/g)) groups.add(m[1]);
  for (const m of src.matchAll(/\bmodule\s*=\s*["']([\w.-]+):[\w.-]+["']/g)) groups.add(m[1]);
  return groups;
}

/** External dependency label for an unresolved Java import package. */
export function javaExternalName(pkg, groups) {
  let best = null;
  for (const group of groups || []) {
    if ((pkg === group || pkg.startsWith(`${group}.`)) && (!best || group.length > best.length)) best = group;
  }
  if (best && best.split(".").length >= 2) return best;
  const segs = pkg.split(".").filter(Boolean);
  return segs.slice(0, Math.min(segs.length, 4)).join(".") || null;
}

/**
 * Build the Java resolver.
 * @param {{file: string, facts: ReturnType<typeof parseJavaFile>}[]} entries
 */
export async function buildJavaIndex(entries, repoRoot) {
  const byFqn = new Map(); // a.b.C -> [file]
  const byPackage = new Map(); // a.b -> Map(name -> [file])
  const packages = new Set();
  const rootOf = new Map();
  for (const { file, facts } of entries) {
    const pkg = facts.package;
    packages.add(pkg);
    const dir = dirOf(file);
    const pkgPath = pkg.replace(/\./g, "/");
    const root = pkg && (dir === pkgPath || dir.endsWith(`/${pkgPath}`)) ? dir.slice(0, dir.length - pkgPath.length).replace(/\/$/, "") : dir;
    rootOf.set(file, root);
    if (!byPackage.has(pkg)) byPackage.set(pkg, new Map());
    const names = new Set(facts.topLevelTypes);
    // A file with no parsed declaration still owns its file-name type.
    if (names.size === 0) names.add(path.posix.basename(file, ".java"));
    for (const name of names) {
      const fqn = pkg ? `${pkg}.${name}` : name;
      if (!byFqn.has(fqn)) byFqn.set(fqn, []);
      byFqn.get(fqn).push(file);
      const local = byPackage.get(pkg);
      if (!local.has(name)) local.set(name, []);
      local.get(name).push(file);
    }
  }
  const buildFiles = await globRepo(repoRoot, ["**/pom.xml", "**/build.gradle", "**/build.gradle.kts", "**/libs.versions.toml"]);
  const moduleDirs = new Set();
  const groups = new Set();
  for (const buildFile of buildFiles) {
    if (!buildFile.endsWith(".toml")) moduleDirs.add(dirOf(buildFile));
    for (const g of parseJavaBuildGroups(await readText(path.join(repoRoot, buildFile)))) groups.add(g);
  }
  const moduleOf = new Map();
  for (const { file } of entries) moduleOf.set(file, nearestDir(file, moduleDirs) ?? "");
  // Packages declared in the repository, and their parents, are internal.
  const internalPrefixes = new Set();
  for (const pkg of packages) {
    const segs = pkg.split(".");
    for (let i = 1; i <= segs.length; i += 1) internalPrefixes.add(segs.slice(0, i).join("."));
  }
  return { byFqn, byPackage, packages, internalPrefixes, rootOf, moduleOf, groups, moduleDirs };
}

function pickCandidate(candidates, importer, index, testPathFn) {
  if (!candidates || candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  const module = index.moduleOf.get(importer);
  const root = index.rootOf?.get(importer);
  const importerTest = testPathFn ? testPathFn(importer) : false;
  let best = null;
  let bestScore = -Infinity;
  for (const candidate of candidates) {
    let score = commonPrefixLength(importer, candidate);
    if (index.moduleOf.get(candidate) === module) score += 1000;
    if (root !== undefined && index.rootOf?.get(candidate) === root) score += 500;
    if (testPathFn && !importerTest && testPathFn(candidate)) score -= 2000;
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

/**
 * Resolve one Java file to target files and external package names.
 * @returns {{ targets: Set<string>, externals: Set<string> }}
 */
export function resolveJavaFile(file, facts, index, { isTestPath } = {}) {
  const targets = new Set();
  const externals = new Set();
  const add = (candidates) => {
    const picked = pickCandidate(candidates, file, index, isTestPath);
    if (picked && picked !== file) targets.add(picked);
    return Boolean(picked);
  };
  const lookupFqn = (name) => {
    // Longest known type prefix: a.b.Outer.Inner -> a.b.Outer.
    const segs = name.split(".");
    for (let i = segs.length; i >= 1; i -= 1) {
      const fqn = segs.slice(0, i).join(".");
      if (index.byFqn.has(fqn)) return index.byFqn.get(fqn);
    }
    return null;
  };

  const shadowed = new Set(facts.types); // types declared in this file
  const wildcardPackages = [];
  const docOnly = [];
  for (const imp of facts.imports) {
    if (imp.wildcard) {
      // `import a.b.*` (package) or `import a.b.C.*` / `import static a.b.C.*` (members of C).
      const owner = index.byFqn.get(imp.name) ? index.byFqn.get(imp.name) : (imp.static ? lookupFqn(imp.name) : null);
      if (owner) {
        add(owner);
        continue;
      }
      if (index.byPackage.has(imp.name)) {
        wildcardPackages.push(imp.name);
        continue;
      }
    } else {
      const candidates = lookupFqn(imp.name);
      if (candidates) {
        const simple = imp.name.split(".").pop();
        if (!imp.static) shadowed.add(simple);
        // An import used only in Javadoc (`{@link GsonBuilder}`) or not at all leaves no
        // class-file dependency: not an edge.
        if (facts.identifiers.has(simple)) add(candidates);
        else docOnly.push(imp.name);
        continue;
      }
    }
    const pkg = imp.wildcard && !imp.static ? imp.name : javaPackageOf(imp.name);
    if (!pkg || isJavaStdlib(pkg) || isJavaStdlib(imp.name)) continue;
    if (index.internalPrefixes.has(pkg)) continue; // generated or non-Java (Kotlin) type in a repo package
    const external = javaExternalName(pkg, index.groups);
    if (external) externals.add(external);
  }

  // Same package, then on-demand imports, by simple name.
  const samePackage = index.byPackage.get(facts.package) || new Map();
  for (const name of facts.identifiers) {
    if (shadowed.has(name)) continue;
    if (samePackage.has(name)) {
      // Main code never sees a test class of the same package (separate source sets).
      add(samePackage.get(name).filter((candidate) => !isTestPath || isTestPath(file) || !isTestPath(candidate)));
      continue;
    }
    for (const pkg of wildcardPackages) {
      const local = index.byPackage.get(pkg);
      if (local && local.has(name)) {
        add(local.get(name));
        break;
      }
    }
  }

  // Fully qualified uses.
  for (const chain of facts.chains) {
    const first = chain.split(".")[0];
    if (!index.internalPrefixes.has(first)) continue;
    const candidates = lookupFqn(chain);
    if (candidates && chain.split(".").length > 1) {
      const segs = chain.split(".");
      // Only a real qualified name: the matched prefix must include a package part.
      const typeSeg = segs.findIndex((s) => /^[A-Z]/.test(s));
      if (typeSeg > 0) add(candidates);
    }
  }
  targets.delete(file);
  return { targets, externals, docOnly };
}

// ---------------------------------------------------------------------------
// C#

const CSHARP_STDLIB = /^(System|Microsoft\.CSharp|Microsoft\.VisualBasic|Microsoft\.Win32|Windows)(\.|$)/;

export function isCSharpStdlib(ns, packages = []) {
  if (!CSHARP_STDLIB.test(ns)) return false;
  // `System.Threading.RateLimiting` is a NuGet package, not the base library. A longer
  // package (`System.Threading.Tasks.Extensions`) does not take over the base namespace
  // `System.Threading` unless it is the contract half (`...Abstractions`) of that namespace.
  return !packages.some((pkg) => ns === pkg || ns.startsWith(`${pkg}.`)
    || (pkg.startsWith(`${ns}.`) && isSplitPackageSuffix(pkg.slice(ns.length + 1).split("."))));
}

// Package-name endings that keep the namespace: contract/implementation splits and
// strong-name-signed variants (`Flurl.Http.Signed` ships `Flurl.Http`).
const SPLIT_PACKAGE_SUFFIXES = new Set(["abstractions", "core", "contracts", "primitives", "common", "runtime", "signed", "strongname", "strongnamed"]);

function isSplitPackageSuffix(rest) {
  return rest.length > 0 && rest.every((segment) => SPLIT_PACKAGE_SUFFIXES.has(segment.toLowerCase()));
}

/** External dependency label for an unresolved `using`: the matching PackageReference when there is one. */
export function csharpExternalName(ns, packages = []) {
  // A PackageReference whose name is a prefix of the namespace (`BenchmarkDotNet` for
  // `BenchmarkDotNet.Attributes`), or a namespace that is a prefix of the package name
  // (`Microsoft.Extensions.Logging` for `Microsoft.Extensions.Logging.Abstractions`).
  const segs = ns.split(".");
  let best = null;
  let bestRank = null;
  for (const pkg of packages) {
    const ps = pkg.split(".");
    let n = 0;
    while (n < ps.length && n < segs.length && ps[n].toLowerCase() === segs[n].toLowerCase()) n += 1;
    if (n === 0) continue;
    const pkgPrefix = n === ps.length;
    // The namespace is a prefix of the package name. For a multi-part namespace that is
    // only the contract/implementation split (`Microsoft.Extensions.Logging` lives in
    // `Microsoft.Extensions.Logging.Abstractions`). `Microsoft.AspNetCore.Mvc` is not in
    // `Microsoft.AspNetCore.Mvc.Testing`: that package adds its own namespace.
    const nsPrefix = n === segs.length && (segs.length === 1 || (n >= 2 && isSplitPackageSuffix(ps.slice(n))));
    if (!pkgPrefix && !nsPrefix) continue;
    const rank = [n, pkgPrefix ? 1 : 0, -pkg.length];
    if (!bestRank || rank[0] > bestRank[0] || (rank[0] === bestRank[0] && (rank[1] > bestRank[1] || (rank[1] === bestRank[1] && rank[2] > bestRank[2])))) {
      best = pkg;
      bestRank = rank;
    }
  }
  if (best) return best;
  // A declared package extends this namespace with its own (`...HealthChecks.EntityFrameworkCore`
  // for `Microsoft.Extensions.Diagnostics.HealthChecks`): name the namespace itself rather
  // than a shortened prefix of it.
  const lowerNs = `${ns.toLowerCase()}.`;
  if (packages.some((pkg) => pkg.toLowerCase().startsWith(lowerNs))) return ns;
  const take = /^(Microsoft|System)$/.test(segs[0]) ? 3 : 2;
  return segs.slice(0, Math.min(segs.length, take)).join(".");
}

/** `<ProjectReference Include>`, `<PackageReference Include>`, `<PackageVersion Include>`, `<Using Include>`. */
export function parseMsBuildProject(text) {
  const src = String(text || "").replace(/<!--[\s\S]*?-->/g, " ");
  const attr = (tag, name) => {
    const re = new RegExp(`<${tag}\\b([^>]*?)\\/?>`, "g");
    const out = [];
    for (const m of src.matchAll(re)) {
      const a = m[1].match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`));
      if (a) out.push({ value: a[1], attrs: m[1] });
    }
    return out;
  };
  const usings = [];
  for (const { value, attrs } of attr("Using", "Include")) {
    if (/\bRemove\s*=/.test(attrs)) continue;
    const alias = attrs.match(/\bAlias\s*=\s*"([^"]*)"/);
    usings.push({ name: value.trim(), static: /\bStatic\s*=\s*"true"/i.test(attrs), alias: alias ? alias[1] : null, global: true });
  }
  return {
    projectReferences: attr("ProjectReference", "Include").map((x) => x.value.replace(/\\/g, "/").trim()),
    packages: [...attr("PackageReference", "Include"), ...attr("PackageVersion", "Include")].map((x) => x.value.trim()),
    usings,
  };
}

/**
 * Build the C# resolver.
 * @param {{file: string, facts: ReturnType<typeof parseCSharpFile>}[]} entries
 */
export async function buildCSharpIndex(entries, repoRoot) {
  const byNamespace = new Map(); // ns -> Map(name -> [file])
  const namespaces = new Set();
  for (const { file, facts } of entries) {
    for (const ns of facts.namespaces) namespaces.add(ns);
    for (const type of facts.types) {
      if (type.nested) continue;
      namespaces.add(type.namespace);
      if (!byNamespace.has(type.namespace)) byNamespace.set(type.namespace, new Map());
      const local = byNamespace.get(type.namespace);
      if (!local.has(type.name)) local.set(type.name, []);
      const list = local.get(type.name);
      if (!list.includes(file)) list.push(file);
    }
  }
  // Partial types: the file named after the type first (`Foo.cs`, then `Foo.Bar.cs`).
  for (const local of byNamespace.values()) {
    for (const [name, list] of local) {
      if (list.length < 2) continue;
      const rank = (f) => {
        const base = path.posix.basename(f, ".cs");
        if (base === name) return 0;
        if (base.startsWith(`${name}.`)) return 1;
        return 2;
      };
      list.sort((a, b) => rank(a) - rank(b) || a.length - b.length || a.localeCompare(b));
    }
  }

  const projectFiles = await globRepo(repoRoot, ["**/*.csproj", "**/Directory.Build.props", "**/Directory.Build.targets", "**/Directory.Packages.props"]);
  const projects = new Map(); // dir -> { refs: Set<dir>, usings: [] }
  const propsUsings = []; // { dir, usings }
  const packages = new Set();
  for (const projFile of projectFiles) {
    const parsed = parseMsBuildProject(await readText(path.join(repoRoot, projFile)));
    for (const pkg of parsed.packages) packages.add(pkg);
    const dir = dirOf(projFile);
    if (projFile.endsWith(".csproj")) {
      const refs = new Set();
      for (const ref of parsed.projectReferences) refs.add(dirOf(path.posix.normalize(path.posix.join(dir || ".", ref))));
      projects.set(dir, { refs, usings: parsed.usings });
    } else if (parsed.usings.length > 0) {
      propsUsings.push({ dir, usings: parsed.usings });
    }
  }
  const projectDirs = new Set(projects.keys());
  const projectOf = new Map();
  for (const { file } of entries) projectOf.set(file, nearestDir(file, projectDirs));

  // Transitive project references.
  const visible = new Map();
  function reach(dir) {
    if (visible.has(dir)) return visible.get(dir);
    const seen = new Set([dir]);
    visible.set(dir, seen);
    const stack = [dir];
    while (stack.length) {
      const cur = stack.pop();
      for (const ref of projects.get(cur)?.refs || []) {
        if (!seen.has(ref)) {
          seen.add(ref);
          stack.push(ref);
        }
      }
    }
    return seen;
  }

  // Global usings per project: `global using` in any of its files, csproj and props items.
  const globalUsings = new Map(); // project dir (or null) -> usings[]
  for (const { file, facts } of entries) {
    const proj = projectOf.get(file) ?? null;
    if (!globalUsings.has(proj)) globalUsings.set(proj, []);
    for (const u of facts.usings) if (u.global) globalUsings.get(proj).push(u);
  }
  for (const [dir, info] of projects) {
    if (!globalUsings.has(dir)) globalUsings.set(dir, []);
    globalUsings.get(dir).push(...info.usings);
    for (const props of propsUsings) if (isUnder(dir, props.dir)) globalUsings.get(dir).push(...props.usings);
  }

  const internalPrefixes = new Set();
  for (const ns of namespaces) {
    const segs = ns.split(".").filter(Boolean);
    for (let i = 1; i <= segs.length; i += 1) internalPrefixes.add(segs.slice(0, i).join("."));
  }
  return {
    byNamespace,
    namespaces,
    internalPrefixes,
    projectOf,
    moduleOf: projectOf,
    canSee(importer, candidate) {
      const a = projectOf.get(importer);
      const b = projectOf.get(candidate);
      if (a == null || b == null || a === b) return true;
      return reach(a).has(b);
    },
    globalUsingsFor(file) {
      return globalUsings.get(projectOf.get(file) ?? null) || [];
    },
    packages: [...packages],
  };
}

function namespaceChain(ns) {
  const segs = String(ns || "").split(".").filter(Boolean);
  const out = [];
  for (let i = segs.length; i >= 0; i -= 1) out.push(segs.slice(0, i).join("."));
  return out;
}

/**
 * Resolve one C# file to target files and external package names.
 * @returns {{ targets: Set<string>, externals: Set<string> }}
 */
export function resolveCSharpFile(file, facts, index, { isTestPath } = {}) {
  const targets = new Set();
  const externals = new Set();
  const visibleList = (list) => (list || []).filter((candidate) => index.canSee(file, candidate));
  const pick = (list) => pickCandidate(visibleList(list), file, index, isTestPath);
  const typeIn = (ns, name) => index.byNamespace.get(ns)?.get(name) || null;
  const lookupQualified = (fqn) => {
    const segs = fqn.split(".");
    // Longest namespace + type: A.B.Type.Member -> A.B / Type.
    for (let i = segs.length - 1; i >= 1; i -= 1) {
      const ns = segs.slice(0, i).join(".");
      const found = typeIn(ns, segs[i]);
      if (found) return found;
    }
    return typeIn("", segs[0]);
  };

  const contexts = facts.namespaces.length > 0 ? facts.namespaces : [""];
  // A `using` inside a namespace (`namespace A.B; using Internal;`) is relative to the
  // enclosing namespaces first: A.B.Internal, A.Internal, then Internal.
  const absoluteNamespace = (name) => {
    for (const ctx of contexts) {
      for (const ns of namespaceChain(ctx)) {
        if (ns && index.namespaces.has(`${ns}.${name}`)) return `${ns}.${name}`;
      }
    }
    return name;
  };
  const absoluteType = (name) => {
    for (const ctx of contexts) {
      for (const ns of namespaceChain(ctx)) {
        const full = ns ? `${ns}.${name}` : name;
        if (lookupQualified(full)) return full;
      }
    }
    return name;
  };
  const localUsings = new Set(facts.usings);
  const usings = [...facts.usings, ...index.globalUsingsFor(file)];
  const usingNamespaces = [];
  const aliases = new Map();
  const staticTypes = [];
  for (const u of usings) {
    if (u.alias) {
      aliases.set(u.alias, index.namespaces.has(absoluteNamespace(u.name)) ? absoluteNamespace(u.name) : absoluteType(u.name));
      continue;
    }
    if (u.static) {
      // A `using static` in this file is an edge. A project-wide one (`global using
      // static`, `<Using Static="true">`) would make every file depend on the type, so it
      // is not: member names are not indexed.
      if (localUsings.has(u)) staticTypes.push(absoluteType(u.name));
      continue;
    }
    usingNamespaces.push(absoluteNamespace(u.name));
  }

  for (const name of staticTypes) {
    const found = lookupQualified(name);
    if (found) {
      const picked = pick(found);
      if (picked) targets.add(picked);
    }
  }
  // An alias is an edge only where the alias name is used.
  for (const [alias, target] of aliases) {
    if (!facts.identifiers.has(alias)) continue;
    const found = lookupQualified(target);
    if (found) {
      const picked = pick(found);
      if (picked) targets.add(picked);
    }
  }
  // Unresolved `using` namespaces from this file (not global ones: those are counted once per file that declares them).
  for (const u of facts.usings) {
    if (u.alias || u.static) {
      if (lookupQualified(absoluteType(u.name)) || index.namespaces.has(absoluteNamespace(u.name))) continue;
    }
    // Alias or `using static` of an external type: label by its namespace.
    const ns = u.static ? u.name.split(".").slice(0, -1).join(".") : absoluteNamespace(u.name);
    if (!ns || index.internalPrefixes.has(ns) || index.namespaces.has(ns)) continue;
    if (isCSharpStdlib(ns, index.packages)) continue;
    const label = csharpExternalName(ns, index.packages);
    if (label) externals.add(label);
  }

  const ownTypes = new Set(facts.types.map((t) => t.name));
  for (const ident of facts.identifiers) {
    if (ownTypes.has(ident) || CSHARP_KEYWORDS.has(ident) || aliases.has(ident)) continue;
    const names = [ident];
    if (!ident.endsWith("Attribute")) names.push(`${ident}Attribute`);
    let resolved = false;
    for (const name of names) {
      // 1. Enclosing namespaces, innermost first. A global-namespace type in a file outside
      // every project (a build script such as cake.cs) is not part of any assembly.
      for (const ctx of contexts) {
        for (const ns of namespaceChain(ctx)) {
          let list = typeIn(ns, name);
          if (ns === "" && list && index.projectOf.get(file) != null) list = list.filter((candidate) => index.projectOf.get(candidate) != null);
          const picked = pick(list);
          if (picked) {
            targets.add(picked);
            resolved = true;
            break;
          }
        }
        if (resolved) break;
      }
      if (resolved) break;
      // 2. using directives (all matches; an ambiguity would not compile).
      for (const ns of usingNamespaces) {
        const picked = pick(typeIn(ns, name));
        if (picked) {
          targets.add(picked);
          resolved = true;
        }
      }
      if (resolved) break;
    }
  }

  // Qualified uses: Polly.Utils.Guard.NotNull(...), global::Polly.Outcome.
  for (const chain of facts.chains) {
    const first = chain.split(".")[0];
    if (!index.internalPrefixes.has(first) && !aliases.has(first)) continue;
    const expanded = aliases.has(first) ? `${aliases.get(first)}${chain.slice(first.length)}` : chain;
    const segs = expanded.split(".");
    for (let i = segs.length - 1; i >= 1; i -= 1) {
      const ns = segs.slice(0, i).join(".");
      if (!index.namespaces.has(ns)) continue;
      const picked = pick(typeIn(ns, segs[i]));
      if (picked) {
        targets.add(picked);
        break;
      }
    }
  }
  targets.delete(file);
  return { targets, externals };
}

/** Namespace (C#) or package (Java) a file belongs to, for package-level cycles. */
export function packageLabelOf(file, facts, lang) {
  if (lang === "java") return facts.package || "(default package)";
  const own = facts.types.find((t) => !t.nested);
  return (own ? own.namespace : facts.namespaces[0]) || "(global namespace)";
}
