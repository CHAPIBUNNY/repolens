// Import path aliases: tsconfig/jsconfig `compilerOptions.paths` (with `baseUrl` and the
// `extends` chain, plus `references` for solution-style configs such as Vite's
// tsconfig.json → tsconfig.app.json) and `resolve.alias` in a Vite config.
// `@/components/Button` in a Vite + React app is a local file, not an npm package.

import fs from "node:fs/promises";
import path from "node:path";
import { readJsonc, resolvePackageExtends } from "./ts-elision.js";
import { trimTrailingSlashes } from "../utils/path-roles.js";

// TypeScript allows one `*` in a paths target; it takes the text the pattern's `*` matched.
function substituteStar(target, capture) {
  const star = target.indexOf("*");
  return star === -1 ? target : `${target.slice(0, star)}${capture}${target.slice(star + 1)}`;
}

const TS_CONFIGS = ["tsconfig.json", "jsconfig.json"];
const VITE_CONFIGS = ["vite.config.ts", "vite.config.mts", "vite.config.js", "vite.config.mjs", "vite.config.cts", "vite.config.cjs"];
const MAX_CONFIG_BYTES = 256 * 1024;

const posix = path.posix;

function inRepo(rel) {
  return rel !== null && rel !== undefined && !posix.isAbsolute(rel) && rel !== ".." && !rel.startsWith("../");
}

function joinRel(dir, target) {
  const joined = posix.normalize(posix.join(dir === "" ? "." : dir, target));
  return joined === "." ? "" : trimTrailingSlashes(joined);
}

async function exists(repoRoot, rel) {
  try {
    const stat = await fs.stat(path.join(repoRoot, rel));
    return stat.isFile();
  } catch {
    return false;
  }
}

async function readSmall(repoRoot, rel) {
  try {
    const full = path.join(repoRoot, rel);
    const stat = await fs.stat(full);
    if (!stat.isFile() || stat.size > MAX_CONFIG_BYTES) return null;
    return await fs.readFile(full, "utf8");
  } catch {
    return null;
  }
}

/**
 * `{ baseUrl, paths, pathsDir }` for a tsconfig and its `extends` chain. `baseUrl` is
 * repo-relative. `pathsDir` is the folder of the config that set `paths`, which is
 * the base for `paths` targets when no `baseUrl` is set (TypeScript 4.1+).
 */
async function readAliasOptions(repoRoot, configRel, depth = 0, seen = new Set()) {
  const empty = { baseUrl: null, paths: null, pathsDir: null, references: [] };
  if (depth > 6 || seen.has(configRel)) return empty;
  seen.add(configRel);
  const parsed = await readJsonc(repoRoot, configRel);
  if (!parsed || typeof parsed !== "object") return empty;
  const dir = posix.dirname(configRel) === "." ? "" : posix.dirname(configRel);
  let result = { ...empty };
  const parents = Array.isArray(parsed.extends) ? parsed.extends : parsed.extends ? [parsed.extends] : [];
  for (const parent of parents) {
    if (typeof parent !== "string") continue;
    let rel = null;
    if (parent.startsWith(".") || parent.startsWith("/")) {
      rel = joinRel(dir, parent);
      if (!rel.endsWith(".json")) rel += ".json";
      if (!inRepo(rel)) rel = null;
    } else {
      rel = await resolvePackageExtends(repoRoot, configRel, parent);
    }
    if (!rel) continue;
    const inherited = await readAliasOptions(repoRoot, rel, depth + 1, seen);
    result = {
      ...result,
      baseUrl: inherited.baseUrl ?? result.baseUrl,
      paths: inherited.paths ?? result.paths,
      pathsDir: inherited.paths ? inherited.pathsDir : result.pathsDir,
    };
  }
  const options = parsed.compilerOptions && typeof parsed.compilerOptions === "object" ? parsed.compilerOptions : {};
  if (typeof options.baseUrl === "string") {
    const base = joinRel(dir, options.baseUrl);
    if (inRepo(base)) result.baseUrl = base;
  }
  if (options.paths && typeof options.paths === "object" && !Array.isArray(options.paths)) {
    result.paths = options.paths;
    result.pathsDir = dir;
  }
  if (Array.isArray(parsed.references)) {
    for (const ref of parsed.references) {
      if (!ref || typeof ref.path !== "string") continue;
      let rel = joinRel(dir, ref.path);
      if (!rel.endsWith(".json")) rel = rel ? `${rel}/tsconfig.json` : "tsconfig.json";
      if (inRepo(rel)) result.references.push(rel);
    }
  }
  return result;
}

function aliasEntries(options) {
  if (!options?.paths) return [];
  const base = options.baseUrl ?? options.pathsDir ?? "";
  const entries = [];
  for (const [pattern, targets] of Object.entries(options.paths)) {
    if (typeof pattern !== "string" || (pattern.match(/\*/g) || []).length > 1) continue;
    const list = (Array.isArray(targets) ? targets : [targets]).filter((t) => typeof t === "string");
    if (list.length === 0) continue;
    entries.push({ pattern, targets: list.map((target) => ({ base, target })), source: "tsconfig" });
  }
  return entries;
}

/** Top-level `{...}` or `[...]` text starting at `open` (strings and comments skipped). */
function balancedBlock(text, open) {
  const close = text[open] === "{" ? "}" : "]";
  const opener = text[open];
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      let j = i + 1;
      while (j < text.length && text[j] !== ch) j += text[j] === "\\" ? 2 : 1;
      i = j;
      continue;
    }
    if (ch === "/" && text[i + 1] === "/") {
      const nl = text.indexOf("\n", i);
      i = nl === -1 ? text.length : nl;
      continue;
    }
    if (ch === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end === -1 ? text.length : end + 1;
      continue;
    }
    if (ch === opener) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return text.slice(open + 1, i);
    }
  }
  return null;
}

// Split an object or array body at top-level commas.
function splitTopLevel(body) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      let j = i + 1;
      while (j < body.length && body[j] !== ch) j += body[j] === "\\" ? 2 : 1;
      i = j;
      continue;
    }
    if (ch === "(" || ch === "{" || ch === "[") depth += 1;
    else if (ch === ")" || ch === "}" || ch === "]") depth -= 1;
    else if (ch === "," && depth === 0) {
      parts.push(body.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(body.slice(start));
  return parts.map((part) => part.trim()).filter(Boolean);
}

// The folder an alias value points at: the last string literal of
// `path.resolve(__dirname, "./src")`, `fileURLToPath(new URL("./src", import.meta.url))`,
// or a plain `"/src"` (Vite resolves a leading `/` from the project root).
function aliasTarget(value) {
  const text = String(value);
  const literals = [...text.matchAll(/(['"`])((?:(?!\1)[^\\\n]|\\.)*)\1/g)].map((m) => m[2]);
  const usable = literals.filter((lit) => !/^(file|https?):/.test(lit) && !/\$\{/.test(lit));
  if (usable.length === 0) return null;
  const last = usable[usable.length - 1];
  if (!last || last.includes("*")) return null;
  // `react: "preact/compat"` aliases one package to another: not a folder.
  const pathCall = /\b(resolve|join|URL|fileURLToPath)\s*\(|__dirname|import\.meta|process\.cwd/.test(text);
  if (!pathCall && !/^(\.{1,2})?\//.test(last)) return null;
  if (/(^|\/)node_modules(\/|$)/.test(last)) return null;
  return last.replace(/^\/+/, "").replace(/^\.\//, "") || ".";
}

/** Vite `resolve.alias` entries as `{ find, target }` (object or `[{ find, replacement }]` form). */
export function parseViteAliases(source) {
  const text = String(source || "");
  const out = [];
  const re = /\balias\s*:\s*([{[])/g;
  let match;
  while ((match = re.exec(text))) {
    const open = match.index + match[0].length - 1;
    const body = balancedBlock(text, open);
    if (body === null) continue;
    if (match[1] === "{") {
      for (const entry of splitTopLevel(body)) {
        const kv = entry.match(/^(?:(['"`])([^'"`]+)\1|([A-Za-z_$][\w$-]*))\s*:\s*([\s\S]+)$/);
        if (!kv) continue;
        const find = kv[2] ?? kv[3];
        const target = aliasTarget(kv[4]);
        if (find && target) out.push({ find, target });
      }
    } else {
      for (const entry of splitTopLevel(body)) {
        const inner = entry.startsWith("{") ? balancedBlock(entry, 0) : null;
        if (inner === null) continue;
        let find = null;
        let target = null;
        for (const field of splitTopLevel(inner)) {
          const f = field.match(/^find\s*:\s*(['"`])([^'"`]+)\1$/);
          if (f) find = f[2];
          const r = field.match(/^replacement\s*:\s*([\s\S]+)$/);
          if (r) target = aliasTarget(r[1]);
        }
        if (find && target) out.push({ find, target });
      }
    }
  }
  return out;
}

function viteEntries(aliases, dir) {
  const entries = [];
  for (const { find, target } of aliases) {
    const key = trimTrailingSlashes(find);
    if (!key) continue;
    const base = dir;
    entries.push({ pattern: key, targets: [{ base, target }], source: "vite" });
    entries.push({ pattern: `${key}/*`, targets: [{ base, target: `${target === "." ? "" : target}/*`.replace(/^\//, "") }], source: "vite" });
  }
  return entries;
}

/** Longest-prefix pattern match, as TypeScript does: returns the `*` capture or null. */
function matchPattern(pattern, specifier) {
  const star = pattern.indexOf("*");
  if (star === -1) return pattern === specifier ? "" : null;
  const prefix = pattern.slice(0, star);
  const suffix = pattern.slice(star + 1);
  if (specifier.length < prefix.length + suffix.length) return null;
  if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix)) return null;
  return specifier.slice(prefix.length, specifier.length - suffix.length);
}

/**
 * Returns `async (file, specifier) => ({ matched, candidates }) | null`.
 * `matched` is true when an alias pattern matched (the import is local even when no
 * scanned file is found, for example a `.css` or `.svg` asset). `candidates` are
 * repo-relative paths to try, in order. A bare specifier under `baseUrl` gives
 * candidates with `matched: false` (it may still be an npm package).
 */
export function createAliasResolver(repoRoot) {
  const byDir = new Map();

  async function configForDir(dir) {
    if (byDir.has(dir)) return byDir.get(dir);
    const promise = (async () => {
      let ts = null;
      for (const name of TS_CONFIGS) {
        const rel = dir ? `${dir}/${name}` : name;
        if (await exists(repoRoot, rel)) {
          ts = rel;
          break;
        }
      }
      let vite = null;
      for (const name of VITE_CONFIGS) {
        const rel = dir ? `${dir}/${name}` : name;
        const text = await readSmall(repoRoot, rel);
        if (text !== null) {
          vite = { rel, aliases: parseViteAliases(text) };
          break;
        }
      }
      const parent = dir === "" ? null : await configForDir(posix.dirname(dir) === "." ? "" : posix.dirname(dir));
      let entries = [];
      let baseUrl = null;
      if (ts) {
        const options = await readAliasOptions(repoRoot, ts);
        entries = aliasEntries(options);
        baseUrl = options.baseUrl;
        // Solution-style config (`"files": []` + references): the aliases live in
        // the referenced configs, such as tsconfig.app.json in a Vite app.
        if (entries.length === 0 && options.references.length > 0) {
          for (const ref of options.references) {
            const refOptions = await readAliasOptions(repoRoot, ref);
            for (const entry of aliasEntries(refOptions)) {
              if (!entries.some((e) => e.pattern === entry.pattern)) entries.push(entry);
            }
            if (!baseUrl && refOptions.baseUrl) baseUrl = refOptions.baseUrl;
          }
        }
      } else if (parent) {
        entries = parent.tsEntries;
        baseUrl = parent.baseUrl;
      }
      const viteList = vite ? viteEntries(vite.aliases, dir) : parent ? parent.viteEntries : [];
      return { tsEntries: entries, viteEntries: viteList, baseUrl };
    })();
    byDir.set(dir, promise);
    return promise;
  }

  return async (file, specifier) => {
    if (typeof specifier !== "string" || !specifier || specifier.startsWith(".") || specifier.startsWith("/")) return null;
    const dirName = posix.dirname(String(file).replace(/\\/g, "/"));
    const config = await configForDir(dirName === "." ? "" : dirName);
    const candidates = [];
    let matched = false;
    for (const group of [config.tsEntries, config.viteEntries]) {
      let best = null;
      for (const entry of group) {
        const capture = matchPattern(entry.pattern, specifier);
        if (capture === null) continue;
        const prefixLength = entry.pattern.indexOf("*") === -1 ? entry.pattern.length + 1 : entry.pattern.indexOf("*");
        if (!best || prefixLength > best.prefixLength) best = { entry, capture, prefixLength };
      }
      if (!best) continue;
      let local = false;
      for (const { base, target } of best.entry.targets) {
        const rel = joinRel(base, substituteStar(target, best.capture));
        if (!inRepo(rel) || !rel) continue;
        candidates.push(rel);
        if (!/(^|\/)node_modules(\/|$)/.test(rel)) local = true;
      }
      // A catch-all pattern (`"*": ["*", "types/*"]`) or one that points into
      // node_modules only says where to look; an import it does not resolve to a
      // scanned file may still be an npm package.
      if (local && best.entry.pattern.indexOf("*") !== 0) matched = true;
    }
    if (matched) return { matched: true, candidates: [...new Set(candidates)] };
    if (config.baseUrl !== null && config.baseUrl !== undefined) {
      const rel = joinRel(config.baseUrl, specifier);
      if (inRepo(rel) && rel) candidates.push(rel);
    }
    return candidates.length > 0 ? { matched: false, candidates: [...new Set(candidates)] } : null;
  };
}
