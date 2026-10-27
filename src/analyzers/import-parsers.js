// Import extraction for the dependency graph.
// Comments, strings, and template text are not imports. Type-only
// TypeScript imports are returned with typeOnly: true so they do not
// become runtime edges.

const PYTHON_STDLIB = new Set([
  "__future__", "abc", "aifc", "argparse", "array", "ast", "asynchat", "asyncio",
  "asyncore", "atexit", "base64", "bdb", "binascii", "binhex", "bisect", "builtins",
  "bz2", "calendar", "cgi", "cgitb", "chunk", "cmath", "cmd", "code", "codecs",
  "codeop", "collections", "colorsys", "compileall", "concurrent", "configparser",
  "contextlib", "contextvars", "copy", "copyreg", "cProfile", "crypt", "csv",
  "ctypes", "curses", "dataclasses", "datetime", "dbm", "decimal", "difflib",
  "dis", "distutils", "doctest", "email", "encodings", "enum", "errno", "faulthandler",
  "fcntl", "filecmp", "fileinput", "fnmatch", "fractions", "ftplib", "functools",
  "gc", "getopt", "getpass", "gettext", "glob", "graphlib", "grp", "gzip", "hashlib",
  "heapq", "hmac", "html", "http", "idlelib", "imaplib", "imghdr", "imp", "importlib",
  "inspect", "io", "ipaddress", "itertools", "json", "keyword", "lib2to3", "linecache",
  "locale", "logging", "lzma", "mailbox", "mailcap", "marshal", "math", "mimetypes",
  "mmap", "modulefinder", "msvcrt", "multiprocessing", "netrc", "nis", "nntplib", "nt", "ntpath", "numbers",
  "operator", "optparse", "os", "ossaudiodev", "pathlib", "pdb", "pickle", "pickletools",
  "pipes", "pkgutil", "platform", "plistlib", "poplib", "posix", "posixpath", "pprint",
  "profile", "pstats", "pty", "pwd", "py_compile", "pyclbr", "pydoc", "queue", "quopri",
  "random", "re", "readline", "reprlib", "resource", "rlcompleter", "runpy", "sched",
  "secrets", "select", "selectors", "shelve", "shlex", "shutil", "signal", "site",
  "smtpd", "smtplib", "sndhdr", "socket", "socketserver", "sqlite3", "ssl", "stat",
  "statistics", "string", "stringprep", "struct", "subprocess", "sunau", "symtable",
  "sys", "sysconfig", "syslog", "tabnanny", "tarfile", "telnetlib", "tempfile", "termios",
  "test", "textwrap", "threading", "time", "timeit", "tkinter", "token", "tokenize",
  "tomllib", "trace", "traceback", "tracemalloc", "tty", "turtle", "turtledemo", "types",
  "typing", "unicodedata", "unittest", "urllib", "uu", "uuid", "venv", "warnings",
  "wave", "weakref", "webbrowser", "winreg", "winsound", "wsgiref", "xdrlib", "xml",
  "xmlrpc", "zipapp", "zipfile", "zipimport", "zlib", "zoneinfo",
]);

function isIdentStart(ch) {
  return /[A-Za-z_$]/.test(ch || "");
}

function isIdentPart(ch) {
  return /[A-Za-z0-9_$]/.test(ch || "");
}

function skipWs(source, i) {
  while (i < source.length && /[\t\n\r \f]/.test(source[i])) i += 1;
  return i;
}

function readWord(source, i) {
  const start = i;
  while (i < source.length && isIdentPart(source[i])) i += 1;
  return { word: source.slice(start, i), next: i };
}

function skipLineComment(source, i) {
  const nl = source.indexOf("\n", i);
  return nl === -1 ? source.length : nl + 1;
}

function skipBlockComment(source, i) {
  const end = source.indexOf("*/", i + 2);
  return end === -1 ? source.length : end + 2;
}

function skipQuoted(source, i) {
  const quote = source[i];
  i += 1;
  while (i < source.length) {
    if (source[i] === "\\") {
      i += 2;
      continue;
    }
    if (source[i] === quote) return i + 1;
    if (source[i] === "\n") return i;
    i += 1;
  }
  return i;
}

function readJsString(source, i) {
  i = skipWs(source, i);
  const quote = source[i];
  if (quote !== "'" && quote !== '"') return null;
  let j = i + 1;
  let value = "";
  while (j < source.length) {
    if (source[j] === "\\") {
      value += source[j + 1] === "n" ? "\n" : (source[j + 1] || "");
      j += 2;
      continue;
    }
    if (source[j] === quote) return { value, next: j + 1 };
    if (source[j] === "\n") return null;
    value += source[j];
    j += 1;
  }
  return null;
}

function skipRegex(source, i) {
  i += 1;
  let inClass = false;
  while (i < source.length) {
    if (source[i] === "\\") {
      i += 2;
      continue;
    }
    if (source[i] === "[") inClass = true;
    else if (source[i] === "]") inClass = false;
    else if (source[i] === "/" && !inClass) return i + 1;
    else if (source[i] === "\n") return i;
    i += 1;
  }
  return i;
}

function prevCodeChar(source, i) {
  let j = i - 1;
  while (j >= 0 && /[\t\n\r \f]/.test(source[j])) j -= 1;
  return j >= 0 ? source[j] : "";
}

function canStartRegex(ch) {
  return ch === "" || "([{:;,!?&|~^=<>+-*%".includes(ch);
}

function splitTopCommas(inner) {
  const parts = [];
  let current = "";
  let depth = 0;
  for (const ch of inner) {
    if (ch === "{" || ch === "(" || ch === "[") depth += 1;
    else if (ch === "}" || ch === ")" || ch === "]") depth -= 1;
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current);
  return parts;
}

function braceIsTypeOnly(inner) {
  const parts = splitTopCommas(inner).map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return true;
  return parts.every((part) => /^type\s+/.test(part) && !/^type\s+as\b/.test(part));
}

/** Local bindings in an import brace. `type Foo` is skipped. `foo as bar` yields `bar`. */
function localNames(inner) {
  const names = [];
  for (const part of splitTopCommas(inner)) {
    const trimmed = part.trim().replace(/\s+/g, " ");
    if (!trimmed || /^type\s+/.test(trimmed)) continue;
    const asMatch = trimmed.match(/^[A-Za-z_$][\w$]*\s+as\s+([A-Za-z_$][\w$]*)$/);
    if (asMatch) {
      names.push(asMatch[1]);
      continue;
    }
    const id = trimmed.match(/^([A-Za-z_$][\w$]*)$/);
    if (id) names.push(id[1]);
  }
  return names;
}

function readAlias(source, i) {
  let j = skipWs(source, i);
  const word = readWord(source, j);
  if (word.word !== "as") return { name: null, next: i };
  j = skipWs(source, word.next);
  const name = readWord(source, j);
  if (!name.word) return { name: null, next: j };
  return { name: name.word, next: name.next };
}

function findMatchingBrace(source, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function skipAsBinding(source, i) {
  let j = skipWs(source, i);
  const word = readWord(source, j);
  if (word.word !== "as") return i;
  j = skipWs(source, word.next);
  const name = readWord(source, j);
  return name.word ? name.next : j;
}

function readFromClause(source, i) {
  i = skipAsBinding(source, i);
  i = skipWs(source, i);
  const word = readWord(source, i);
  if (word.word !== "from") return null;
  const lit = readJsString(source, word.next);
  if (!lit) return null;
  return lit;
}

/**
 * @returns {{ specifier: string, typeOnly: boolean, names: string[] }[]}
 * `names` are the local bindings (`import { a as b }` → `b`) so callers can
 * count `b(` as a use of this import. Type-only imports still list names.
 */
export function extractJsImports(source) {
  const imports = [];
  const n = source.length;
  let i = 0;

  function add(specifier, typeOnly, names = []) {
    if (typeof specifier !== "string") return;
    const locals = [];
    const seen = new Set();
    for (const name of names) {
      if (typeof name !== "string" || !name || seen.has(name)) continue;
      seen.add(name);
      locals.push(name);
    }
    imports.push({ specifier, typeOnly: Boolean(typeOnly), names: locals });
  }

  function parseRequire(at) {
    const i0 = skipWs(source, at);
    if (source[i0] !== "(") return at;
    const lit = readJsString(source, i0 + 1);
    if (!lit) return at;
    const after = skipWs(source, lit.next);
    if (source[after] !== ")") return at;
    add(lit.value, false);
    return after + 1;
  }

  function parseImport(at) {
    let j = skipWs(source, at);
    if (source[j] === "(") {
      const lit = readJsString(source, j + 1);
      if (!lit) return at;
      const after = skipWs(source, lit.next);
      if (source[after] !== ")") return at;
      add(lit.value, false);
      return after + 1;
    }
    if (source[j] === ".") return at;

    let typeOnly = false;
    const first = readWord(source, j);
    if (first.word === "type") {
      typeOnly = true;
      j = skipWs(source, first.next);
    }

    if (source[j] === "{") {
      const close = findMatchingBrace(source, j);
      if (close === -1) return at;
      const inner = source.slice(j + 1, close);
      const clause = readFromClause(source, close + 1);
      if (!clause) return close + 1;
      const onlyTypes = typeOnly || braceIsTypeOnly(inner);
      add(clause.value, onlyTypes, typeOnly ? [] : localNames(inner));
      return clause.next;
    }

    if (source[j] === "*" || isIdentStart(source[j]) || source[j] === "'" || source[j] === '"') {
      if (source[j] === "'" || source[j] === '"') {
        const lit = readJsString(source, j);
        if (lit) add(lit.value, typeOnly);
        return lit ? lit.next : j;
      }
      // default binding, namespace, or `name, { ... }`
      let sawValue = !typeOnly;
      const names = [];
      if (source[j] !== "*") {
        const binding = readWord(source, j);
        if (binding.word && !typeOnly) names.push(binding.word);
        j = skipWs(source, binding.next);
        if (source[j] === ",") {
          sawValue = !typeOnly;
          j = skipWs(source, j + 1);
        }
      } else {
        j = skipWs(source, j + 1);
        const alias = readAlias(source, j);
        if (alias.name && !typeOnly) names.push(alias.name);
        j = skipWs(source, alias.next);
      }
      if (source[j] === "{") {
        const close = findMatchingBrace(source, j);
        if (close === -1) return j;
        const inner = source.slice(j + 1, close);
        const clause = readFromClause(source, close + 1);
        if (!clause) return close + 1;
        const onlyTypes = typeOnly || (!sawValue && braceIsTypeOnly(inner));
        if (!onlyTypes) names.push(...localNames(inner));
        add(clause.value, onlyTypes, names);
        return clause.next;
      }
      const clause = readFromClause(source, j);
      if (!clause) return at;
      add(clause.value, typeOnly, typeOnly ? [] : names);
      return clause.next;
    }

    return at;
  }

  function parseExport(at) {
    let j = skipWs(source, at);
    let typeOnly = false;
    const first = readWord(source, j);
    if (first.word === "type") {
      typeOnly = true;
      j = skipWs(source, first.next);
    }
    if (source[j] === "*") {
      const clause = readFromClause(source, j + 1);
      if (!clause) return at;
      add(clause.value, typeOnly);
      return clause.next;
    }
    if (source[j] === "{") {
      const close = findMatchingBrace(source, j);
      if (close === -1) return at;
      const inner = source.slice(j + 1, close);
      const clause = readFromClause(source, close + 1);
      if (!clause) return close + 1;
      add(clause.value, typeOnly || braceIsTypeOnly(inner));
      return clause.next;
    }
    return at;
  }

  while (i < n) {
    const ch = source[i];
    if (ch === "/" && source[i + 1] === "/") {
      i = skipLineComment(source, i);
      continue;
    }
    if (ch === "/" && source[i + 1] === "*") {
      i = skipBlockComment(source, i);
      continue;
    }
    if (ch === "'" || ch === '"') {
      i = skipQuoted(source, i);
      continue;
    }
    if (ch === "`") {
      i = scanTemplate(source, i + 1, (inner, from, to) => {
        // Scan the expression as code by continuing the outer walk on a slice.
        // Handled below by recursion on the expression text with an offset.
        const found = extractJsImports(source.slice(from, to));
        for (const item of found) imports.push(item);
      });
      continue;
    }
    if (ch === "/" && canStartRegex(prevCodeChar(source, i))) {
      i = skipRegex(source, i);
      continue;
    }
    if (isIdentStart(ch)) {
      const word = readWord(source, i);
      const prev = prevCodeChar(source, i);
      i = word.next;
      if (prev === ".") continue;
      if (word.word === "import") i = parseImport(i);
      else if (word.word === "export") i = parseExport(i);
      else if (word.word === "require") i = parseRequire(i);
      continue;
    }
    i += 1;
  }

  return imports;
}

function scanTemplate(source, i, onExpression) {
  while (i < source.length) {
    if (source[i] === "\\") {
      i += 2;
      continue;
    }
    if (source[i] === "`") return i + 1;
    if (source[i] === "$" && source[i + 1] === "{") {
      const close = findMatchingBrace(source, i + 1);
      if (close === -1) return source.length;
      onExpression(source, i + 2, close);
      i = close + 1;
      continue;
    }
    i += 1;
  }
  return i;
}

const NODE_BUILTINS = new Set([
  "assert", "async_hooks", "buffer", "child_process", "cluster", "console",
  "constants", "crypto", "dgram", "diagnostics_channel", "dns", "domain",
  "events", "fs", "http", "http2", "https", "inspector", "module", "net",
  "os", "path", "perf_hooks", "process", "punycode", "querystring",
  "readline", "repl", "sqlite", "stream", "string_decoder", "sys", "timers",
  "tls", "trace_events", "tty", "url", "util", "v8", "vm", "wasi",
  "worker_threads", "zlib",
]);

export function externalPackageName(specifier) {
  if (typeof specifier !== "string") return null;
  const trimmed = specifier.trim();
  if (!trimmed || trimmed.startsWith(".") || trimmed.startsWith("/") || trimmed.startsWith("node:")) return null;
  if (trimmed.includes("://") || trimmed.startsWith("#")) return null;
  const parts = trimmed.startsWith("@")
    ? trimmed.split("/").slice(0, 2)
    : trimmed.split("/").slice(0, 1);
  const name = parts.filter(Boolean).join("/");
  if (!name || name === "." || name === "..") return null;
  const top = name.startsWith("@") ? null : name.split("/")[0];
  if (top && NODE_BUILTINS.has(top)) return null;
  return name;
}

function stripPythonNoise(source) {
  let out = "";
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (ch === "#") {
      const nl = source.indexOf("\n", i);
      out += " ";
      if (nl === -1) break;
      i = nl;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const triple = source.slice(i, i + 3) === ch.repeat(3);
      const quote = triple ? ch.repeat(3) : ch;
      out += " ";
      i += quote.length;
      while (i < source.length) {
        if (source[i] === "\\") {
          out += source[i + 1] === "\n" ? "\n" : " ";
          i += 2;
          continue;
        }
        if (source.startsWith(quote, i)) {
          i += quote.length;
          break;
        }
        out += source[i] === "\n" ? "\n" : " ";
        i += 1;
      }
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

function leadingIndent(line) {
  const match = String(line).match(/^[ \t]*/);
  return match ? match[0].length : 0;
}

function noteTypingBindings(statement, aliases, flags) {
  const imported = statement.match(/^import\s+(.+)$/);
  if (imported) {
    for (const part of imported[1].split(",")) {
      const as = part.trim().match(/^([\w.]+)(?:\s+as\s+([A-Za-z_]\w*))?$/);
      if (!as) continue;
      if (as[1] !== "typing" && as[1] !== "typing_extensions") continue;
      aliases.add(as[2] || as[1]);
    }
    return;
  }
  const from = statement.match(/^from\s+(typing|typing_extensions)\s+import\s+(.+)$/);
  if (!from) return;
  for (const part of from[2].replace(/[()]/g, " ").split(",")) {
    const as = part.trim().match(/^([A-Za-z_]\w*)(?:\s+as\s+([A-Za-z_]\w*))?$/);
    if (!as || as[1] !== "TYPE_CHECKING") continue;
    flags.add(as[2] || as[1]);
  }
}

function isTypeCheckingGuard(statement, aliases, flags) {
  const match = statement.match(/^(?:if|elif)\s+(.+?)\s*:\s*$/);
  if (!match) return false;
  const cond = match[1].trim();
  if (cond === "TYPE_CHECKING" || flags.has(cond)) return true;
  if (cond === "typing.TYPE_CHECKING") return true;
  const attr = cond.match(/^([A-Za-z_]\w*)\.TYPE_CHECKING$/);
  return Boolean(attr && aliases.has(attr[1]));
}

function pushPythonImport(imports, statement, typeOnly) {
  if (statement.startsWith("import ")) {
    const rest = statement.slice("import ".length).replace(/[()]/g, " ");
    for (const part of rest.split(",")) {
      const name = part.trim().split(/\s+/)[0];
      if (name && /^[\w.]+$/.test(name)) imports.push({ module: name, level: 0, typeOnly });
    }
    return;
  }
  const relative = statement.match(/^from\s+(\.+)([\w.]*)\s+import\s+(.+)$/);
  if (relative) {
    const level = relative[1].length;
    const base = relative[2] || "";
    if (base) {
      imports.push({ module: base, level, typeOnly });
      return;
    }
    for (const part of relative[3].replace(/[()]/g, " ").split(",")) {
      const name = part.trim().split(/\s+/)[0];
      if (name && /^[A-Za-z_]\w*$/.test(name)) imports.push({ module: name, level, typeOnly });
    }
    return;
  }
  const match = statement.match(/^from\s+([\w.]+)\s+import\b/);
  if (!match) return;
  imports.push({ module: match[1], level: 0, typeOnly });
}

/**
 * @returns {{ module: string, level: number, typeOnly: boolean }[]}
 * level 0 is an absolute import. level N is a relative import with N dots.
 * Imports under `if TYPE_CHECKING:` / `if typing.TYPE_CHECKING:` (including
 * `import typing as t`) are typeOnly and must not become runtime edges.
 */
export function extractPythonImports(source) {
  const stripped = stripPythonNoise(source).replace(/\\\n/g, " ");
  const lines = stripped.split("\n");
  const imports = [];
  const aliases = new Set(["typing"]);
  const flags = new Set(["TYPE_CHECKING"]);
  const blockIndents = [];
  let buf = "";
  let depth = 0;
  let bufTypeOnly = false;
  let bufIndent = 0;

  function inTypeChecking(indent) {
    while (blockIndents.length && indent <= blockIndents[blockIndents.length - 1]) {
      blockIndents.pop();
    }
    return blockIndents.length > 0;
  }

  function finishStatement() {
    const statement = buf.trim();
    buf = "";
    depth = 0;
    if (!statement) return;
    if (bufTypeOnly) {
      pushPythonImport(imports, statement, true);
      return;
    }
    if (isTypeCheckingGuard(statement, aliases, flags)) {
      blockIndents.push(bufIndent);
      return;
    }
    noteTypingBindings(statement, aliases, flags);
    pushPythonImport(imports, statement, false);
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed && depth === 0) continue;
    if (depth === 0) {
      bufTypeOnly = inTypeChecking(leadingIndent(line));
      bufIndent = leadingIndent(line);
      buf = trimmed;
    } else {
      buf = `${buf} ${trimmed}`;
    }
    depth += (line.match(/\(/g) || []).length;
    depth -= (line.match(/\)/g) || []).length;
    if (depth > 0) continue;
    finishStatement();
  }
  if (buf) finishStatement();
  return imports;
}

function packageRootDirs(files) {
  const initDirs = new Set();
  for (const file of files) {
    const norm = String(file).replace(/\\/g, "/");
    if (!/\/__init__\.pyw?$/.test(norm)) continue;
    initDirs.add(norm.slice(0, norm.lastIndexOf("/")));
  }
  const roots = [];
  for (const dir of initDirs) {
    const parent = dir.includes("/") ? dir.slice(0, dir.lastIndexOf("/")) : "";
    if (!initDirs.has(parent)) roots.push(dir);
  }
  return roots;
}

export function pythonModuleName(file, roots = []) {
  let rel = String(file).replace(/\\/g, "/");
  const sorted = [...roots].sort((a, b) => b.length - a.length);
  for (const root of sorted) {
    if (rel !== root && !rel.startsWith(`${root}/`)) continue;
    const parent = root.includes("/") ? root.slice(0, root.lastIndexOf("/")) : "";
    rel = parent ? rel.slice(parent.length + 1) : rel;
    break;
  }
  if (rel.startsWith("src/")) rel = rel.slice(4);
  rel = rel.replace(/\.pyw?$/, "");
  if (rel.endsWith("/__init__")) rel = rel.slice(0, -"/__init__".length);
  if (rel === "__init__") return "";
  return rel.replace(/\//g, ".");
}

export function pythonPackageName(file, roots = []) {
  const rel = String(file).replace(/\\/g, "/");
  const init = rel.endsWith("/__init__.py") || rel.endsWith("/__init__.pyw");
  const mod = pythonModuleName(file, roots);
  if (init) return mod;
  const parts = mod.split(".").filter(Boolean);
  parts.pop();
  return parts.join(".");
}

export function resolvePythonImport(file, imported, index) {
  const level = imported.level || 0;
  let dotted;
  const roots = index.packageRoots || [];
  if (level > 0) {
    const pkg = pythonPackageName(file, roots);
    const parts = pkg ? pkg.split(".") : [];
    const up = level - 1;
    if (up > parts.length) return { kind: "unresolved" };
    const base = parts.slice(0, parts.length - up);
    if (imported.module) base.push(...imported.module.split(".").filter(Boolean));
    dotted = base.join(".");
  } else {
    dotted = imported.module;
  }

  if (!dotted) return { kind: "unresolved" };
  if (index.has(dotted)) return { kind: "internal", file: index.get(dotted) };

  if (level > 0) {
    const parent = dotted.split(".").slice(0, -1).join(".");
    if (parent && index.has(parent)) return { kind: "internal", file: index.get(parent) };
    return { kind: "unresolved" };
  }

  const top = dotted.split(".")[0];
  if (!PYTHON_STDLIB.has(top)) {
    const nearby = sameDirectoryModule(file, dotted, index);
    if (nearby) return { kind: "internal", file: nearby };
  }
  if (index.has(top) || [...index.keys()].some((name) => name.startsWith(`${top}.`))) {
    return { kind: "unresolved" };
  }
  if (PYTHON_STDLIB.has(top)) return { kind: "stdlib" };
  return { kind: "external", name: top };
}

function sameDirectoryModule(file, dotted, index) {
  const norm = String(file).replace(/\\/g, "/");
  const slash = norm.lastIndexOf("/");
  const dir = slash === -1 ? "" : norm.slice(0, slash);
  const rel = dotted.replace(/\./g, "/");
  const prefix = dir ? `${dir}/` : "";
  const candidates = new Set([
    `${prefix}${rel}.py`,
    `${prefix}${rel}.pyw`,
    `${prefix}${rel}/__init__.py`,
    `${prefix}${rel}/__init__.pyw`,
  ]);
  for (const known of index.values()) {
    if (candidates.has(String(known).replace(/\\/g, "/"))) return known;
  }
  return null;
}

export function indexPythonModules(files) {
  const roots = packageRootDirs(files);
  const index = new Map();
  index.packageRoots = roots;
  const looseStems = new Map();
  for (const file of files) {
    const name = pythonModuleName(file, roots);
    if (name && !index.has(name)) index.set(name, file);
    const norm = String(file).replace(/\\/g, "/");
    const insidePackage = roots.some((root) => norm === `${root}/__init__.py` || norm === `${root}/__init__.pyw` || norm.startsWith(`${root}/`));
    if (insidePackage) continue;
    const stem = norm.split("/").pop().replace(/\.pyw?$/, "");
    if (!stem || PYTHON_STDLIB.has(stem)) continue;
    if (looseStems.has(stem)) looseStems.set(stem, null);
    else looseStems.set(stem, file);
  }
  for (const [stem, file] of looseStems) {
    if (file && !index.has(stem)) index.set(stem, file);
  }
  return index;
}

export function isPythonStdlib(name) {
  return PYTHON_STDLIB.has(name);
}

/**
 * @returns {string[]} import paths
 */
export function extractGoImports(source) {
  const paths = [];
  const n = source.length;
  let i = 0;

  function skipSpaceAndComments(at) {
    let j = at;
    while (j < n) {
      if (/[\t\n\r \f]/.test(source[j])) {
        j += 1;
        continue;
      }
      if (source[j] === "/" && source[j + 1] === "/") {
        j = skipLineComment(source, j);
        continue;
      }
      if (source[j] === "/" && source[j + 1] === "*") {
        j = skipBlockComment(source, j);
        continue;
      }
      break;
    }
    return j;
  }

  function readGoString(at) {
    at = skipSpaceAndComments(at);
    const quote = source[at];
    if (quote !== '"' && quote !== "`") return null;
    let j = at + 1;
    let value = "";
    if (quote === "`") {
      while (j < n && source[j] !== "`") {
        value += source[j];
        j += 1;
      }
      return source[j] === "`" ? { value, next: j + 1 } : null;
    }
    while (j < n) {
      if (source[j] === "\\") {
        value += source[j + 1] || "";
        j += 2;
        continue;
      }
      if (source[j] === '"') return { value, next: j + 1 };
      if (source[j] === "\n") return null;
      value += source[j];
      j += 1;
    }
    return null;
  }

  function takeImportPath(at) {
    let j = skipSpaceAndComments(at);
    if (source[j] === ".") j = skipSpaceAndComments(j + 1);
    else if (isIdentStart(source[j]) || source[j] === "_") {
      const word = readWord(source, j);
      const after = skipSpaceAndComments(word.next);
      if (source[after] === '"' || source[after] === "`") j = after;
    }
    const lit = readGoString(j);
    if (!lit || !lit.value) return null;
    return lit;
  }

  while (i < n) {
    if (/[\t\n\r \f]/.test(source[i])) {
      i += 1;
      continue;
    }
    if (source[i] === "/" && source[i + 1] === "/") {
      i = skipLineComment(source, i);
      continue;
    }
    if (source[i] === "/" && source[i + 1] === "*") {
      i = skipBlockComment(source, i);
      continue;
    }
    if (source[i] === '"' || source[i] === "`" || source[i] === "'") {
      i = source[i] === "'" ? skipQuoted(source, i) : (readGoString(i)?.next || i + 1);
      continue;
    }
    if (isIdentStart(source[i])) {
      const word = readWord(source, i);
      const prev = prevCodeChar(source, i);
      i = word.next;
      if (word.word !== "import" || prev === ".") continue;
      i = skipSpaceAndComments(i);
      if (source[i] === "(") {
        i += 1;
        while (i < n) {
          i = skipSpaceAndComments(i);
          if (source[i] === ")" || i >= n) {
            i += 1;
            break;
          }
          const lit = takeImportPath(i);
          if (!lit) {
            i += 1;
            continue;
          }
          paths.push(lit.value);
          i = lit.next;
        }
        continue;
      }
      const lit = takeImportPath(i);
      if (lit) {
        paths.push(lit.value);
        i = lit.next;
      }
      continue;
    }
    i += 1;
  }

  return paths;
}

export function goPackageDir(importPath, modulePath, moduleDir) {
  if (!modulePath) return null;
  if (importPath !== modulePath && !importPath.startsWith(`${modulePath}/`)) return null;
  const rel = importPath === modulePath ? "" : importPath.slice(modulePath.length + 1);
  const prefix = moduleDir ? moduleDir.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/$/, "") : "";
  if (!prefix) return rel;
  return rel ? `${prefix}/${rel}` : prefix;
}

export function isGoStdlib(importPath) {
  const first = String(importPath).split("/")[0];
  return Boolean(first) && !first.includes(".");
}

export function parseGoModule(text) {
  const match = String(text || "").match(/^\s*module\s+(\S+)/m);
  return match ? match[1] : null;
}
