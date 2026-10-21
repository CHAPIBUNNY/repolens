import fs from "node:fs/promises";
import path from "node:path";

/**
 * Language profiles used by `init --quick` and config-less `demo`.
 * Globs are repository-wide so a Python package that lives next to setup.py
 * is scanned even when it is not under src/.
 */
export const LANGUAGE_PROFILES = [
  {
    id: "python",
    label: "Python",
    markers: ["pyproject.toml", "setup.py", "setup.cfg", "requirements.txt", "Pipfile", "poetry.lock"],
    extensions: [".py"],
    include: ["**/*.py"],
    candidateRoots: ["src", "app", "lib", "api", "core", "services"],
  },
  {
    id: "go",
    label: "Go",
    markers: ["go.mod"],
    extensions: [".go"],
    include: ["**/*.go"],
    candidateRoots: ["cmd", "internal", "pkg", "api"],
  },
  {
    id: "rust",
    label: "Rust",
    markers: ["Cargo.toml"],
    extensions: [".rs"],
    include: ["**/*.rs"],
    candidateRoots: ["src", "crates"],
  },
  {
    id: "java",
    label: "Java",
    markers: ["pom.xml", "build.gradle", "build.gradle.kts", "settings.gradle", "settings.gradle.kts"],
    extensions: [".java", ".kt", ".kts", ".scala"],
    include: ["**/*.{java,kt,kts,scala}"],
    candidateRoots: ["src/main/java", "src/main/kotlin", "src/main/scala", "src", "app"],
  },
  {
    id: "javascript",
    label: "JavaScript",
    markers: ["package.json", "tsconfig.json", "jsconfig.json"],
    extensions: [".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".vue", ".svelte"],
    include: ["**/*.{js,jsx,mjs,cjs,ts,tsx,vue,svelte}"],
    candidateRoots: ["src", "app", "lib", "pages", "components", "packages"],
  },
  {
    id: "ruby",
    label: "Ruby",
    markers: ["Gemfile"],
    extensions: [".rb"],
    include: ["**/*.rb"],
    candidateRoots: ["app", "lib"],
  },
  {
    id: "php",
    label: "PHP",
    markers: ["composer.json"],
    extensions: [".php"],
    include: ["**/*.php"],
    candidateRoots: ["src", "app", "lib"],
  },
  {
    id: "csharp",
    label: "C#",
    markers: ["*.csproj", "*.sln"],
    extensions: [".cs"],
    include: ["**/*.cs"],
    candidateRoots: ["src"],
  },
  {
    id: "swift",
    label: "Swift",
    markers: ["Package.swift"],
    extensions: [".swift"],
    include: ["**/*.swift"],
    candidateRoots: ["Sources", "src"],
  },
  {
    id: "cpp",
    label: "C",
    markers: ["CMakeLists.txt"],
    extensions: [".c", ".cc", ".cpp", ".h", ".hpp"],
    include: ["**/*.{c,cc,cpp,h,hpp}"],
    candidateRoots: ["src", "include"],
  },
];

const EXT_TO_LANGUAGE = new Map();
for (const profile of LANGUAGE_PROFILES) {
  for (const ext of profile.extensions) {
    if (!EXT_TO_LANGUAGE.has(ext)) EXT_TO_LANGUAGE.set(ext, profile.id);
  }
}

const SKIP_DIRS = new Set([
  ".git",
  ".hg",
  ".svn",
  ".repolens",
  ".next",
  ".venv",
  "venv",
  "node_modules",
  "vendor",
  "target",
  "dist",
  "build",
  "out",
  "coverage",
  "__pycache__",
  ".tox",
  ".mypy_cache",
]);

const UNIVERSAL_CANDIDATE_ROOTS = ["src", "app", "lib", "cmd", "internal", "pkg", "packages"];

export const UNIVERSAL_INCLUDE = [
  "**/*.{js,jsx,mjs,cjs,ts,tsx,vue,svelte,py,go,rs,java,kt,kts,scala,rb,php,cs,swift,c,cc,cpp,h,hpp}",
];

const MAX_WALK_ENTRIES = 8000;
const MAX_WALK_DEPTH = 4;

function markerMatches(marker, rootNames) {
  if (marker.startsWith("*.")) {
    const suffix = marker.slice(1);
    return rootNames.some((name) => name.endsWith(suffix));
  }
  return rootNames.includes(marker);
}

function rootRank(root) {
  const base = root.split("/").pop() || root;
  if (/^(tests?|specs?|__tests__|testdata)$/i.test(base)) return 2;
  if (/^(docs|examples?|benchmarks?)$/i.test(base)) return 1;
  return 0;
}

function compareRoots(a, b) {
  const rank = rootRank(a) - rootRank(b);
  if (rank !== 0) return rank;
  return a.localeCompare(b);
}

async function dirExists(dirPath) {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function walkSourceTree(repoRoot) {
  const extCounts = new Map();
  const topLevelExts = new Map();
  const rootNames = [];
  let seen = 0;

  async function walk(dir, depth) {
    if (depth > MAX_WALK_DEPTH || seen >= MAX_WALK_ENTRIES) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (seen >= MAX_WALK_ENTRIES) return;
      seen += 1;
      if (entry.isSymbolicLink()) continue;

      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
        await walk(path.join(dir, entry.name), depth + 1);
        continue;
      }

      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (EXT_TO_LANGUAGE.has(ext)) {
        extCounts.set(ext, (extCounts.get(ext) || 0) + 1);
      }

      const relDir = path.relative(repoRoot, dir);
      if (!relDir) {
        rootNames.push(entry.name);
        continue;
      }

      const top = relDir.split(path.sep)[0];
      if (!topLevelExts.has(top)) topLevelExts.set(top, new Set());
      if (ext) topLevelExts.get(top).add(ext);
    }
  }

  await walk(repoRoot, 0);
  return { extCounts, topLevelExts, rootNames };
}

/**
 * Detect languages and the scan globs / module roots that fit this repository.
 * Always returns at least one include pattern and one module root.
 */
export async function detectRepoLanguages(repoRoot) {
  const root = path.resolve(repoRoot);
  const { extCounts, topLevelExts, rootNames } = await walkSourceTree(root);

  const presentIds = new Set();
  for (const ext of extCounts.keys()) {
    const id = EXT_TO_LANGUAGE.get(ext);
    if (id) presentIds.add(id);
  }

  const detected = LANGUAGE_PROFILES.filter((profile) => {
    if (presentIds.has(profile.id)) return true;
    return profile.markers.some((marker) => markerMatches(marker, rootNames));
  });

  const include = [];
  const seenInclude = new Set();
  const source = detected.length > 0 ? detected.flatMap((profile) => profile.include) : UNIVERSAL_INCLUDE;
  for (const pattern of source) {
    if (seenInclude.has(pattern)) continue;
    seenInclude.add(pattern);
    include.push(pattern);
  }

  const sourceExts = new Set();
  const profilesForRoots = detected.length > 0 ? detected : LANGUAGE_PROFILES;
  for (const profile of profilesForRoots) {
    if (detected.length > 0 || presentIds.has(profile.id)) {
      for (const ext of profile.extensions) sourceExts.add(ext);
    }
  }
  if (detected.length === 0) {
    for (const ext of EXT_TO_LANGUAGE.keys()) sourceExts.add(ext);
  }

  const moduleRoots = [];
  for (const [dir, exts] of topLevelExts) {
    if ([...exts].some((ext) => sourceExts.has(ext))) moduleRoots.push(dir);
  }

  if (moduleRoots.length === 0) {
    const candidates = detected.length > 0
      ? [...new Set(detected.flatMap((profile) => profile.candidateRoots))]
      : UNIVERSAL_CANDIDATE_ROOTS;
    for (const candidate of candidates) {
      if (await dirExists(path.join(root, candidate))) moduleRoots.push(candidate);
    }
  }

  if (moduleRoots.length === 0) moduleRoots.push(".");

  moduleRoots.sort(compareRoots);

  return {
    languages: detected.map((profile) => ({ id: profile.id, label: profile.label })),
    include,
    moduleRoots,
  };
}
