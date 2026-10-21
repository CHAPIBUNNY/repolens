// Scan one cloned repository with RepoLens in deterministic mode.
// AI environment variables are cleared before the scanner is imported.

import fs from "node:fs/promises";
import path from "node:path";
import { compactHealth } from "../src/badge.js";

const DOC_CHAR_CAP = 150_000;

for (const key of [
  "REPOLENS_AI_API_KEY",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GOOGLE_API_KEY",
  "AZURE_OPENAI_API_KEY",
  "REPOLENS_AI_BASE_URL",
  "REPOLENS_AI_PROVIDER",
  "REPOLENS_AI_PRESET",
]) {
  delete process.env[key];
}
process.env.REPOLENS_AI_ENABLED = "false";
process.env.REPOLENS_TELEMETRY_ENABLED = "false";

function arg(name) {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) {
    console.error(`Missing ${name}`);
    process.exit(2);
  }
  return value;
}

const IGNORE = [
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/.git/**",
  "**/vendor/**",
  "**/target/**",
  "**/__pycache__/**",
  "**/testdata/**",
  "**/fixtures/**",
  "**/*_test.go",
  "**/*.test.js",
  "**/*.test.ts",
  "**/*.test.tsx",
  "**/*.spec.js",
  "**/*.spec.ts",
  "**/*.spec.tsx",
  "**/locale/**",
  "**/*.min.js",
  "**/*.d.ts",
  "**/test/**",
  "**/tests/**",
  "**/__tests__/**",
];

function escapeGlob(value) {
  return value.replace(/[\\*?[\]{}()!@+]/g, "\\$&");
}

function sampleFiles(files, max) {
  const groups = new Map();
  for (const file of files) {
    const parts = file.split("/");
    const key = parts.length > 2 ? parts.slice(0, 2).join("/") : parts[0];
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(file);
  }
  const keys = [...groups.keys()].sort();
  const alloc = new Map();
  let assigned = 0;
  for (const key of keys) {
    const share = Math.max(1, Math.floor((groups.get(key).length / files.length) * max));
    const count = Math.min(share, groups.get(key).length);
    alloc.set(key, count);
    assigned += count;
  }
  while (assigned > max) {
    const key = keys.find((item) => alloc.get(item) > 1);
    if (!key) break;
    alloc.set(key, alloc.get(key) - 1);
    assigned -= 1;
  }
  let guard = 0;
  while (assigned < max && guard < keys.length * 4) {
    const key = keys[guard % keys.length];
    if (alloc.get(key) < groups.get(key).length) {
      alloc.set(key, alloc.get(key) + 1);
      assigned += 1;
    }
    guard += 1;
    if (keys.every((key) => alloc.get(key) >= groups.get(key).length)) break;
  }
  const selected = [];
  for (const key of keys) selected.push(...groups.get(key).slice(0, alloc.get(key)));
  selected.sort();
  return selected.length > max ? selected.slice(0, max) : selected;
}

const jobPath = arg("--job");
const outPath = arg("--out");

try {
  const job = JSON.parse(await fs.readFile(jobPath, "utf8"));
  const fg = (await import("fast-glob")).default;
  const { scanRepo } = await import("../src/core/scan.js");
  const { generateDocumentSet } = await import("../src/docs/generate-doc-set.js");

  const root = job.dest;
  const matched = (await fg(job.repo.include, {
    cwd: root,
    ignore: IGNORE,
    onlyFiles: true,
    followSymbolicLinks: false,
    dot: false,
  })).sort();

  if (matched.length === 0) {
    throw new Error("no source files matched the scan patterns");
  }

  const maxFiles = job.maxFiles || 1600;
  const capped = matched.length > maxFiles;
  const files = capped ? sampleFiles(matched, maxFiles) : matched;

  const config = {
    configVersion: 1,
    project: { name: job.repo.name },
    publishers: ["markdown"],
    ai: { enabled: false, mode: "off" },
    scan: {
      include: files.map(escapeGlob),
      ignore: IGNORE,
    },
    module_roots: job.repo.moduleRoots || ["src", "lib", "app", "packages"],
    documentation: {
      include_artifacts: false,
      output_dir: ".repolens",
    },
    __repoRoot: root,
    __configPath: path.join(root, ".repolens.yml"),
  };

  const scan = await scanRepo(config);
  const docSet = await generateDocumentSet(scan, config, null);
  const documents = docSet.documents.map((doc) => {
    const content = String(doc.content || "");
    const truncated = content.length > DOC_CHAR_CAP;
    return {
      key: doc.key,
      title: doc.title,
      filename: doc.filename,
      audience: doc.audience,
      description: doc.description,
      truncated,
      content: truncated ? `${content.slice(0, DOC_CHAR_CAP)}\n\n` : content,
    };
  });

  if (documents.length === 0) throw new Error("RepoLens produced no documents");

  const languages = scan.metadata?.languages ? [...scan.metadata.languages] : [];
  const result = {
    ok: true,
    stats: {
      files: scan.filesCount || files.length,
      matched: matched.length,
      capped,
      modules: scan.modules?.length || 0,
      api: scan.api?.length || 0,
      pages: scan.pages?.length || 0,
      languages,
      frameworks: scan.metadata?.frameworks || [],
      moduleList: (scan.modules || []).slice(0, 40).map((item) => ({
        key: item.key,
        fileCount: item.fileCount,
      })),
      health: compactHealth(docSet.codeHealth),
    },
    documents,
  };
  await fs.writeFile(outPath, JSON.stringify(result));
} catch (error) {
  const message = error && error.message ? error.message : String(error);
  await fs.writeFile(outPath, JSON.stringify({ ok: false, error: message.slice(0, 500) }));
  console.error(message);
  process.exit(1);
} finally {
  try {
    const job = JSON.parse(await fs.readFile(jobPath, "utf8"));
    await fs.rm(path.join(job.dest, ".repolens"), { recursive: true, force: true });
  } catch {
    // The clone is still useful if cleanup fails.
  }
}
