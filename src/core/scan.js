import fg from "fast-glob";
import fs from "node:fs/promises";
import path from "node:path";

const norm = (p) => p.replace(/\\/g, "/");

function isNextRoute(file) {
  const f = norm(file);
  return (
    f.includes("/pages/api/") ||
    (f.includes("/app/") && (f.endsWith("/route.ts") || f.endsWith("/route.js")))
  );
}

function isNextPage(file) {
  const f = norm(file);

  if (f.includes("/app/")) {
    return (
      f.endsWith("/page.tsx") ||
      f.endsWith("/page.jsx") ||
      f.endsWith("/page.ts") ||
      f.endsWith("/page.js")
    );
  }

  if (f.includes("/pages/") && !f.includes("/pages/api/")) {
    return (
      f.endsWith(".tsx") ||
      f.endsWith(".jsx") ||
      f.endsWith(".ts") ||
      f.endsWith(".js")
    );
  }

  return false;
}

async function readFileSafe(file) {
  try {
    return await fs.readFile(file, "utf8");
  } catch {
    return "";
  }
}

function moduleKeyForFile(file, moduleRoots) {
  const normalized = norm(file);

  const sortedRoots = [...moduleRoots].sort((a, b) => b.length - a.length);

  for (const root of sortedRoots) {
    if (normalized === root) return root;
    if (normalized.startsWith(`${root}/`)) {
      const remainder = normalized.slice(root.length + 1);
      const nextSegment = remainder.split("/")[0];
      return nextSegment ? `${root}/${nextSegment}` : root;
    }
  }

  const parts = normalized.split("/");
  return parts.length > 1 ? parts[0] : "root";
}

function routePathFromFile(file) {
  const f = norm(file);

  if (f.includes("/app/")) {
    const appIndex = f.indexOf("/app/");
    const relative = f.slice(appIndex + 5);

    const cleaned = relative
      .replace(/\/page\.(ts|tsx|js|jsx)$/, "")
      .replace(/\/route\.(ts|tsx|js|jsx)$/, "")
      .replace(/\[(.*?)\]/g, ":$1")
      .replace(/\/$/, "");

    return cleaned ? `/${cleaned}` : "/";
  }

  if (f.includes("/pages/api/")) {
    const apiIndex = f.indexOf("/pages/api/");
    const relative = f.slice(apiIndex + 11);

    return "/api/" + relative.replace(/\.(ts|tsx|js|jsx)$/, "");
  }

  if (f.includes("/pages/")) {
    const pagesIndex = f.indexOf("/pages/");
    const relative = f.slice(pagesIndex + 7);

    const cleaned = relative
      .replace(/\.(ts|tsx|js|jsx)$/, "")
      .replace(/\/index$/, "")
      .replace(/\[(.*?)\]/g, ":$1")
      .replace(/\/$/, "");

    return cleaned ? `/${cleaned}` : "/";
  }

  return file;
}

export async function scanRepo(cfg) {
  const repoRoot = cfg.__repoRoot;

  const files = await fg(cfg.scan.include, {
    cwd: repoRoot,
    ignore: cfg.scan.ignore,
    onlyFiles: true
  });

  const moduleCounts = new Map();

  for (const file of files) {
    const key = moduleKeyForFile(file, cfg.module_roots || []);
    moduleCounts.set(key, (moduleCounts.get(key) || 0) + 1);
  }

  const modules = [...moduleCounts.entries()]
    .map(([key, fileCount]) => ({ key, fileCount }))
    .sort((a, b) => b.fileCount - a.fileCount);

  const apiFiles = files.filter(isNextRoute);
  const api = [];

  for (const file of apiFiles) {
    const absoluteFile = path.join(repoRoot, file);
    const content = await readFileSafe(absoluteFile);
    const methods = [];

    if (content.includes("export async function GET")) methods.push("GET");
    if (content.includes("export async function POST")) methods.push("POST");
    if (content.includes("export async function PUT")) methods.push("PUT");
    if (content.includes("export async function PATCH")) methods.push("PATCH");
    if (content.includes("export async function DELETE")) methods.push("DELETE");

    api.push({
      file,
      path: routePathFromFile(file),
      methods: methods.length ? methods : ["UNKNOWN"]
    });
  }

  const pageFiles = files.filter(isNextPage);
  const pages = pageFiles.map((file) => ({
    file,
    path: routePathFromFile(file)
  }));

  return {
    filesCount: files.length,
    modules,
    api,
    pages
  };
}