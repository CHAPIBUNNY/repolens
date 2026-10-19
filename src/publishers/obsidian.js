// Obsidian vault publisher for RepoLens.
//
// Writes generated notes into a folder inside a local Obsidian vault.
// Notes use YAML frontmatter and wikilinks. Updates are in-place and
// idempotent. Every path is contained inside the vault. No network.
//
// Config (.repolens.yml), all fields optional except vault at publish time:
//   obsidian:
//     vault: "/path/to/vault"     # absolute, or relative to the repo
//     folder: "RepoLens/my-app"   # relative directory inside the vault
//     branches: [main]            # optional branch filter (enforced by the orchestrator)
//     index: true                 # map-of-content note (default: true)
//     frontmatter: true           # YAML properties (default: true)
//     wikilinks: true             # rewrite markdown links (default: true)

import fs from "node:fs/promises";
import path from "node:path";
import { info, warn } from "../utils/logger.js";
import { getCurrentBranch } from "../utils/branch.js";
import { isInsideRoot, safeFileName } from "../utils/safe-path.js";

const INDEX_NOTE = "RepoLens";
const MANIFEST_FILE = ".repolens-obsidian.json";

const PAGE_ORDER = [
  "executive_summary",
  "system_overview",
  "business_domains",
  "architecture_overview",
  "module_catalog",
  "route_map",
  "api_surface",
  "data_flows",
  "change_impact",
  "system_map",
  "developer_onboarding",
  "graphql_schema",
  "type_graph",
  "dependency_graph",
  "architecture_drift",
  "arch_diff",
  "security_hotspots",
  "code_health",
];

const PAGE_TITLES = {
  executive_summary: "Executive Summary",
  system_overview: "System Overview",
  business_domains: "Business Domains",
  architecture_overview: "Architecture Overview",
  module_catalog: "Module Catalog",
  route_map: "Route Map",
  api_surface: "API Surface",
  data_flows: "Data Flows",
  change_impact: "Change Impact",
  system_map: "System Map",
  developer_onboarding: "Developer Onboarding",
  graphql_schema: "GraphQL Schema",
  type_graph: "Type Graph",
  dependency_graph: "Dependency Graph",
  architecture_drift: "Architecture Drift",
  arch_diff: "Architecture Diff",
  security_hotspots: "Security Hotspots",
  code_health: "Code Health",
};

const PAGE_DESCRIPTIONS = {
  executive_summary: "High-level project summary for non-technical readers.",
  system_overview: "Snapshot of stack, scale, structure, and detected capabilities.",
  business_domains: "Functional areas inferred from the repository.",
  architecture_overview: "Layered technical view of the system.",
  module_catalog: "Inventory of modules and responsibilities.",
  route_map: "Frontend routes and page structure.",
  api_surface: "Detected endpoints, handlers, and API structure.",
  data_flows: "How information moves through the system.",
  change_impact: "Architecture changes and likely downstream effects.",
  system_map: "Visual map of system relationships.",
  developer_onboarding: "What a new engineer needs to know first.",
  graphql_schema: "GraphQL types, operations, and schema structure.",
  type_graph: "Type-level relationships across the codebase.",
  dependency_graph: "Module and package dependency relationships.",
  architecture_drift: "Drift between intended and current architecture.",
  arch_diff: "Architecture-level diff across revisions.",
  security_hotspots: "Security anti-patterns with CWE classification.",
  code_health: "Complexity and unified health scores.",
};

const PAGE_TAGS = {
  executive_summary: "stakeholders",
  system_overview: "overview",
  business_domains: "stakeholders",
  architecture_overview: "engineers",
  module_catalog: "engineers",
  route_map: "engineers",
  api_surface: "engineers",
  data_flows: "stakeholders",
  change_impact: "engineers",
  system_map: "overview",
  developer_onboarding: "onboarding",
  graphql_schema: "engineers",
  type_graph: "engineers",
  dependency_graph: "engineers",
  architecture_drift: "engineers",
  arch_diff: "engineers",
  security_hotspots: "security",
  code_health: "engineers",
};

const AUDIENCE_GROUPS = [
  {
    title: "For Stakeholders",
    keys: ["executive_summary", "business_domains", "data_flows"],
  },
  {
    title: "For Engineers",
    keys: [
      "architecture_overview", "module_catalog", "api_surface",
      "route_map", "system_map", "graphql_schema", "type_graph",
      "dependency_graph", "architecture_drift", "security_hotspots", "code_health",
    ],
  },
  {
    title: "For New Contributors",
    keys: ["developer_onboarding", "system_overview"],
  },
  {
    title: "Change Tracking",
    keys: ["change_impact", "arch_diff"],
  },
];

function displayTitle(key) {
  return PAGE_TITLES[key] || String(key).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Reduce a note title to a single path segment Obsidian and Windows can store.
 */
export function sanitizeNoteName(name) {
  const cleaned = String(name ?? "")
    .replace(/[<>:"|?*\u0000-\u001f\\/]/g, " ")
    .replace(/\.\.+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "")
    .replace(/^\.+/, "");
  if (!cleaned || cleaned === "." || cleaned === "..") return "Note";
  return cleaned;
}

function noteStemForKey(key, useWikilinks) {
  if (!useWikilinks) {
    const file = safeFileName(`${key}.md`, "document.md");
    return sanitizeNoteName(file.replace(/\.md$/i, ""));
  }
  return sanitizeNoteName(displayTitle(key));
}

function allocateNotes(keys, useWikilinks) {
  const used = new Set([INDEX_NOTE]);
  const notes = [];
  for (const key of keys) {
    const base = noteStemForKey(key, useWikilinks);
    let name = base;
    let n = 2;
    while (used.has(name)) {
      const suffix = n === 2 ? key : `${key} ${n}`;
      name = sanitizeNoteName(`${base} (${suffix})`);
      n += 1;
      if (n > 50) {
        throw new Error(`Could not allocate a unique Obsidian note name for ${key}`);
      }
    }
    used.add(name);
    notes.push({ key, name, fileName: `${name}.md` });
  }
  return notes;
}

function yamlQuote(value) {
  return JSON.stringify(String(value));
}

function buildFrontmatter(fields) {
  const lines = ["---"];
  for (const [key, value] of Object.entries(fields)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      const items = value.filter((item) => item != null && String(item).length > 0);
      if (items.length === 0) continue;
      lines.push(`${key}:`);
      for (const item of items) lines.push(`  - ${yamlQuote(item)}`);
    } else if (typeof value === "boolean" || typeof value === "number") {
      lines.push(`${key}: ${value}`);
    } else {
      lines.push(`${key}: ${yamlQuote(value)}`);
    }
  }
  lines.push("---", "");
  return lines.join("\n");
}

function ensureTrailingNewline(text) {
  return text.endsWith("\n") ? text : `${text}\n`;
}

/**
 * Rewrite inline markdown links to Obsidian wikilinks.
 * Fenced code blocks are left untouched. http(s) and other URLs stay as links.
 * @param {string} markdown
 * @param {Map<string, string>} linkMap basename/stem → note name
 */
export function rewriteMarkdownToWikilinks(markdown, linkMap) {
  const source = String(markdown ?? "");
  const parts = source.split(/(```[\s\S]*?```)/g);
  return parts.map((part, index) => {
    if (index % 2 === 1) return part;
    return part.replace(/(!?)\[([^\]]*)\]\(([^)]+)\)/g, (full, bang, label, rawTarget) => {
      const converted = toWikilink(bang === "!", label, rawTarget, linkMap);
      return converted ?? full;
    });
  }).join("");
}

function toWikilink(isEmbed, label, rawTarget, linkMap) {
  const target = String(rawTarget ?? "").trim();
  if (!target) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("//")) return null;

  if (target.startsWith("#")) {
    const heading = safeHeading(target.slice(1));
    if (!heading) return null;
    return isEmbed ? `![[#${heading}]]` : `[[#${heading}]]`;
  }

  const hashAt = target.indexOf("#");
  const pathPart = hashAt === -1 ? target : target.slice(0, hashAt);
  const hash = hashAt === -1 ? "" : target.slice(hashAt + 1);
  let decoded = pathPart;
  try {
    decoded = decodeURIComponent(pathPart);
  } catch {
    decoded = pathPart;
  }
  if (path.isAbsolute(decoded) || /^[A-Za-z]:[\\/]/.test(decoded)) return null;

  const base = path.posix.basename(decoded.replace(/\\/g, "/"));
  if (!base || base === "." || base === "..") return null;

  const stem = base.replace(/\.md$/i, "");
  const known = lookupNote(linkMap, base) || lookupNote(linkMap, stem);
  const isMarkdown = /\.md$/i.test(base);

  if (!known && !isMarkdown && !isEmbed) return null;
  if (!known && isEmbed && !isMarkdown) {
    return `![[${base}]]`;
  }

  const dest = known || sanitizeNoteName(stem);
  const heading = hash ? safeHeading(hash) : "";
  const targetNote = heading ? `${dest}#${heading}` : dest;
  if (isEmbed) return `![[${targetNote}]]`;
  const alias = String(label ?? "").trim();
  if (!alias || alias === dest || alias === targetNote) return `[[${targetNote}]]`;
  return `[[${targetNote}|${alias.replaceAll("|", "\\|")}]]`;
}

function safeHeading(raw) {
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }
  return decoded.replace(/[\]|#^]/g, "").trim();
}

function lookupNote(linkMap, token) {
  if (!token) return null;
  return linkMap.get(token) || linkMap.get(token.toLowerCase()) || null;
}

function buildLinkMap(notes) {
  const map = new Map();
  for (const note of notes) {
    const aliases = [note.name, note.fileName, note.key, `${note.key}.md`, displayTitle(note.key)];
    for (const alias of aliases) {
      map.set(alias, note.name);
      map.set(alias.toLowerCase(), note.name);
    }
  }
  return map;
}

function defaultFolder(cfg) {
  const raw = cfg.project?.name || "project";
  const slug = sanitizeNoteName(String(raw).replace(/^\.+/, "")) || "project";
  return path.join("RepoLens", slug);
}

function assertRelativeFolder(folder) {
  if (typeof folder !== "string" || folder.trim() === "") {
    throw new Error("obsidian.folder must be a non-empty relative path inside the vault");
  }
  if (folder.includes("\0")) {
    throw new Error("obsidian.folder contains a null byte");
  }
  if (path.isAbsolute(folder) || /^[A-Za-z]:[\\/]/.test(folder)) {
    throw new Error(`obsidian.folder must stay inside the vault (received absolute path ${folder})`);
  }
  const parts = path.normalize(folder).split(path.sep).filter((part) => part && part !== ".");
  if (parts.length === 0 || parts.some((part) => part === "..")) {
    throw new Error(`obsidian.folder escapes the vault: ${folder}`);
  }
  return parts.join(path.sep);
}

/**
 * Resolve the vault directory. Relative paths are resolved from the repo root.
 * The directory must already exist. The returned path is its realpath.
 */
export async function resolveVaultRoot(cfg, vault) {
  if (typeof vault !== "string" || vault.trim() === "") {
    throw new Error(
      "obsidian.vault is required. Set it to your Obsidian vault path in .repolens.yml"
    );
  }
  if (vault.includes("\0")) {
    throw new Error("obsidian.vault contains a null byte");
  }
  const base = cfg.__repoRoot || process.cwd();
  const lexical = path.resolve(base, vault);
  let real;
  try {
    real = await fs.realpath(lexical);
  } catch (err) {
    if (err.code === "ENOENT") {
      throw new Error(`Obsidian vault does not exist: ${lexical}`);
    }
    throw err;
  }
  const stat = await fs.stat(real);
  if (!stat.isDirectory()) {
    throw new Error(`Obsidian vault is not a directory: ${lexical}`);
  }
  return real;
}

/**
 * Resolve a folder inside the vault and create it.
 * Symlinks that point outside the vault are rejected.
 */
export async function resolveVaultFolder(vaultRoot, folder) {
  const relative = assertRelativeFolder(folder);
  const lexical = path.resolve(vaultRoot, relative);
  if (!isInsideRoot(vaultRoot, lexical)) {
    throw new Error(`obsidian.folder escapes the vault: ${folder}`);
  }

  let current = vaultRoot;
  for (const part of relative.split(path.sep)) {
    current = path.join(current, part);
    let listed;
    try {
      listed = await fs.lstat(current);
    } catch (err) {
      if (err.code === "ENOENT") break;
      throw err;
    }
    if (listed.isSymbolicLink()) {
      const real = await fs.realpath(current);
      if (!isInsideRoot(vaultRoot, real)) {
        throw new Error(`obsidian.folder escapes the vault through a symlink: ${folder}`);
      }
    } else if (!listed.isDirectory()) {
      throw new Error(`obsidian.folder is not a directory: ${folder}`);
    }
  }

  await fs.mkdir(lexical, { recursive: true });
  const realFolder = await fs.realpath(lexical);
  if (!isInsideRoot(vaultRoot, realFolder)) {
    throw new Error(`obsidian.folder escapes the vault: ${folder}`);
  }
  return realFolder;
}

function containedFile(root, fileName) {
  const base = safeFileName(fileName, "");
  if (!base || base === MANIFEST_FILE) {
    throw new Error(`Refusing to write an unsafe note name: ${fileName}`);
  }
  const resolved = path.resolve(root, base);
  if (!isInsideRoot(root, resolved) || path.basename(resolved) !== base) {
    throw new Error(`Note path escapes the vault folder: ${fileName}`);
  }
  return resolved;
}

async function writeIfChanged(filePath, content) {
  let listed;
  try {
    listed = await fs.lstat(filePath);
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  if (listed?.isSymbolicLink()) {
    throw new Error(`Refusing to write through a symlink: ${filePath}`);
  }
  if (listed && !listed.isFile()) {
    throw new Error(`Refusing to overwrite a non-file: ${filePath}`);
  }
  if (listed?.isFile()) {
    const existing = await fs.readFile(filePath, "utf8");
    if (existing === content) return false;
  }
  await fs.writeFile(filePath, content, "utf8");
  return true;
}

async function readManifest(folder) {
  const manifestPath = path.join(folder, MANIFEST_FILE);
  try {
    const raw = await fs.readFile(manifestPath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.files) ? parsed.files.filter((item) => typeof item === "string") : [];
  } catch (err) {
    if (err.code !== "ENOENT") {
      warn(`Ignoring unreadable Obsidian manifest: ${err.message}`);
    }
    return [];
  }
}

function manifestPathFor(folder) {
  const resolved = path.resolve(folder, MANIFEST_FILE);
  if (!isInsideRoot(folder, resolved)) {
    throw new Error("Obsidian manifest path escapes the vault folder");
  }
  return resolved;
}

function removableManagedFile(folder, rel) {
  if (typeof rel !== "string" || rel.includes("\0") || path.isAbsolute(rel)) return null;
  const parts = rel.split(/[\\/]/).filter(Boolean);
  if (parts.length !== 1 || parts[0] === "." || parts[0] === ".." || parts[0] === MANIFEST_FILE) {
    return null;
  }
  const resolved = path.resolve(folder, parts[0]);
  if (!isInsideRoot(folder, resolved)) return null;
  return resolved;
}

async function syncManifest(vaultRoot, folder, fileNames) {
  const previous = await readManifest(folder);
  const next = new Set(fileNames);
  let removed = 0;
  for (const rel of previous) {
    if (next.has(rel)) continue;
    const target = removableManagedFile(folder, rel);
    if (!target || !isInsideRoot(vaultRoot, target)) continue;
    let listed;
    try {
      listed = await fs.lstat(target);
    } catch (err) {
      if (err.code === "ENOENT") continue;
      throw err;
    }
    if (listed.isSymbolicLink() || !listed.isFile()) continue;
    await fs.unlink(target);
    removed += 1;
  }

  const body = `${JSON.stringify({ version: 1, files: [...fileNames].sort() }, null, 2)}\n`;
  await writeIfChanged(manifestPathFor(folder), body);
  return removed;
}

function renderPage(note, markdown, options) {
  const body = options.useWikilinks
    ? rewriteMarkdownToWikilinks(markdown, options.linkMap)
    : String(markdown);
  const backlink = options.useIndex
    ? (options.useWikilinks ? `← [[${INDEX_NOTE}|Index]]` : `← [Index](${INDEX_NOTE}.md)`)
    : "";
  const parts = [];
  if (options.useFrontmatter) {
    const aliases = [note.key];
    const title = displayTitle(note.key);
    if (title !== note.name) aliases.push(title);
    parts.push(buildFrontmatter({
      title: note.name,
      aliases,
      tags: ["repolens", PAGE_TAGS[note.key]].filter(Boolean),
      type: note.key,
      project: options.projectName,
      branch: options.branch,
      publisher: "repolens",
    }));
  }
  if (backlink) parts.push(`${backlink}\n`);
  parts.push(body.trimEnd());
  return ensureTrailingNewline(parts.join("\n"));
}

function renderIndex(notes, options) {
  const byKey = new Map(notes.map((note) => [note.key, note]));
  const listed = new Set();
  const sections = [];

  for (const group of AUDIENCE_GROUPS) {
    const items = group.keys.filter((key) => byKey.has(key));
    if (items.length === 0) continue;
    sections.push(`## ${group.title}`, "");
    for (const key of items) {
      listed.add(key);
      sections.push(indexItem(byKey.get(key), options.useWikilinks));
    }
    sections.push("");
  }

  const custom = notes.filter((note) => !listed.has(note.key));
  if (custom.length > 0) {
    sections.push("## Custom", "");
    for (const note of custom) sections.push(indexItem(note, options.useWikilinks));
    sections.push("");
  }

  const intro = [
    `# ${options.projectName}`,
    "",
    "Architecture notes published by RepoLens into this Obsidian vault.",
    "Re-running publish updates these notes in place.",
    "",
  ];

  const parts = [];
  if (options.useFrontmatter) {
    const aliases = options.projectName && options.projectName !== INDEX_NOTE
      ? [options.projectName]
      : [];
    parts.push(buildFrontmatter({
      title: INDEX_NOTE,
      aliases,
      tags: ["repolens", "index"],
      type: "index",
      project: options.projectName,
      branch: options.branch,
      publisher: "repolens",
    }));
  }
  parts.push([...intro, ...sections].join("\n").trimEnd());
  return ensureTrailingNewline(parts.join("\n"));
}

function indexItem(note, useWikilinks) {
  const description = PAGE_DESCRIPTIONS[note.key] || "Generated by RepoLens.";
  const link = useWikilinks ? `[[${note.name}]]` : `[${note.name}](${note.fileName})`;
  return `- ${link} — ${description}`;
}

function orderedKeys(renderedPages) {
  const present = Object.entries(renderedPages)
    .filter(([, markdown]) => typeof markdown === "string" && markdown.trim() !== "")
    .map(([key]) => key);
  const known = PAGE_ORDER.filter((key) => present.includes(key));
  const custom = present.filter((key) => !PAGE_ORDER.includes(key));
  return [...known, ...custom];
}

/**
 * Publish rendered pages into an Obsidian vault folder.
 * @returns {Promise<{ folder: string, files: string[], removed: number, changed: number }>}
 */
export async function publishToObsidian(cfg, renderedPages) {
  const obsidian = cfg.obsidian || {};
  const vaultRoot = await resolveVaultRoot(cfg, obsidian.vault);
  const folderRel = obsidian.folder == null || obsidian.folder === ""
    ? defaultFolder(cfg)
    : obsidian.folder;
  const folder = await resolveVaultFolder(vaultRoot, folderRel);

  const useFrontmatter = obsidian.frontmatter !== false;
  const useWikilinks = obsidian.wikilinks !== false;
  const useIndex = obsidian.index !== false;
  const projectName = cfg.project?.name || "RepoLens";
  const branch = getCurrentBranch();

  const notes = allocateNotes(orderedKeys(renderedPages || {}), useWikilinks);
  const linkMap = buildLinkMap(notes);
  const fileNames = [];
  let changed = 0;

  for (const note of notes) {
    const filePath = containedFile(folder, note.fileName);
    const content = renderPage(note, renderedPages[note.key], {
      useFrontmatter,
      useWikilinks,
      useIndex,
      linkMap,
      projectName,
      branch,
    });
    if (await writeIfChanged(filePath, content)) changed += 1;
    fileNames.push(note.fileName);
  }

  if (useIndex) {
    const indexPath = containedFile(folder, `${INDEX_NOTE}.md`);
    const content = renderIndex(notes, { useFrontmatter, useWikilinks, projectName, branch });
    if (await writeIfChanged(indexPath, content)) changed += 1;
    fileNames.push(`${INDEX_NOTE}.md`);
  }

  const removed = await syncManifest(vaultRoot, folder, fileNames);
  info(`obsidian notes written to ${folder} (${fileNames.length} notes, ${changed} updated, ${removed} removed)`);
  return { folder, files: fileNames, removed, changed };
}
