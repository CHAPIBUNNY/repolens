// Install and test commands for the onboarding guide, from the build files at the
// repository root. Every repository used to get `npm install` and `npm test # or:
// npx pytest run`, including Python, Java, C#, and Rust projects without a package.json.

import fs from "node:fs";
import path from "node:path";

function exists(dir, name) {
  try {
    return fs.statSync(path.join(dir, name)).isFile();
  } catch {
    return false;
  }
}

function readJson(file) {
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > 1024 * 1024) return null;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function listRoot(dir) {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

/**
 * `{ install: string[], test: string[], manifests: { file, purpose }[] }` for the
 * ecosystems whose build files sit at `repoRoot`. Empty lists when none is found.
 * @param {string} repoRoot
 * @param {{ testFrameworks?: string[], buildTools?: string[] }} [metadata]
 */
export function detectSetupCommands(repoRoot, metadata = {}) {
  const install = [];
  const test = [];
  const manifests = [];
  const buildTools = [];
  const extraTestFrameworks = [];
  const entries = listRoot(repoRoot);
  const has = (name) => entries.includes(name) && exists(repoRoot, name);
  const testFrameworks = (metadata.testFrameworks || []).map((name) => String(name).toLowerCase());

  if (has("package.json")) {
    const pkg = readJson(path.join(repoRoot, "package.json")) || {};
    const pm = packageManagerBin(pkg, has);
    install.push(`${pm} install`);
    if (pkg.scripts && typeof pkg.scripts.test === "string") test.push(`${pm} test`);
    manifests.push({ file: "package.json", purpose: "Available scripts and dependencies" });
  }

  const pyManifest = ["pyproject.toml", "setup.py", "setup.cfg", "requirements.txt"].find(has);
  if (pyManifest) {
    if (has("uv.lock")) install.push("uv sync");
    else if (has("poetry.lock")) install.push("poetry install");
    else if (pyManifest === "requirements.txt") install.push("pip install -r requirements.txt");
    else install.push("pip install -e .");
    test.push(testFrameworks.includes("pytest") ? "pytest" : "python -m unittest");
    manifests.push({ file: pyManifest, purpose: "Python package metadata and dependencies" });
  }

  if (has("go.mod")) {
    install.push("go mod download");
    test.push("go test ./...");
    manifests.push({ file: "go.mod", purpose: "Go module path and dependencies" });
  }

  if (has("Cargo.toml")) {
    install.push("cargo build");
    test.push("cargo test");
    manifests.push({ file: "Cargo.toml", purpose: "Rust crates and dependencies" });
  }

  if (has("pom.xml")) {
    const mvn = has("mvnw") ? "./mvnw" : "mvn";
    install.push(`${mvn} package`);
    test.push(`${mvn} test`);
    manifests.push({ file: "pom.xml", purpose: "Maven build and dependencies" });
  }

  const gradleFile = ["build.gradle.kts", "build.gradle", "settings.gradle.kts", "settings.gradle"].find(has);
  if (gradleFile) {
    const gradle = has("gradlew") ? "./gradlew" : "gradle";
    install.push(`${gradle} build`);
    test.push(`${gradle} test`);
    manifests.push({ file: gradleFile, purpose: "Gradle build and dependencies" });
  }

  const solution = entries.filter((name) => /\.slnx?$/i.test(name)).sort()[0];
  const rootProject = entries.filter((name) => /\.csproj$/i.test(name)).sort()[0];
  const dotnet = solution || rootProject || ((metadata.buildTools || []).includes("MSBuild (.NET)") ? "" : null);
  if (dotnet !== null) {
    install.push("dotnet build");
    test.push("dotnet test");
    if (dotnet) manifests.push({ file: dotnet, purpose: ".NET solution and projects" });
  }

  if (has("Gemfile")) {
    install.push("bundle install");
    manifests.push({ file: "Gemfile", purpose: "Ruby dependencies" });
    const gemfile = readText(repoRoot, "Gemfile");
    if (/\bminitest\b/.test(gemfile)) extraTestFrameworks.push("Minitest");
    if (/\brspec\b/.test(gemfile)) extraTestFrameworks.push("RSpec");
  }

  if (has("Rakefile")) {
    buildTools.push("Rake");
    manifests.push({ file: "Rakefile", purpose: "Rake tasks" });
    const rake = readText(repoRoot, "Rakefile");
    if (/task\s+default:\s*:test\b|Rake::TestTask|Minitest::TestTask|^\s*task\s+:test\b/m.test(rake)) {
      test.push(has("Gemfile") ? "bundle exec rake test" : "rake test");
    }
  }

  const makefile = has("Makefile") ? "Makefile" : (has("makefile") ? "makefile" : null);
  if (makefile) {
    const text = readText(repoRoot, makefile);
    const flags = [];
    if (/CGO_ENABLED/.test(text)) flags.push("CGO_ENABLED");
    if (/-tags\b/.test(text)) flags.push("-tags");
    buildTools.push(flags.length ? `Make (${flags.join(", ")})` : "Make");
    manifests.push({
      file: makefile,
      purpose: flags.length ? `Build targets (${flags.join(", ")})` : "Build targets",
    });
    if (/^test\s*:/m.test(text)) test.push("make test");
  }

  const taskfile = ["Taskfile.yml", "Taskfile.yaml"].find(has);
  if (taskfile) {
    buildTools.push("Task");
    manifests.push({ file: taskfile, purpose: "Task runner targets" });
    if (/^\s*test\s*:/m.test(readText(repoRoot, taskfile))) test.push("task test");
  }

  if (hasTeshFiles(repoRoot)) {
    extraTestFrameworks.push("tesh");
    // A tesh harness is real test tooling. Listing it here keeps onboarding from
    // saying "Standard toolchain" when the repo has no Make or Task file.
    buildTools.push("tesh");
  }

  return { install, test, manifests, buildTools, extraTestFrameworks };
}

// `packageManager` is the tool the repository actually runs (`nub@0.8.3`).
// A leftover pnpm-lock.yaml must not turn that into `pnpm install`.
function packageManagerBin(pkg, has) {
  const declared = String(pkg.packageManager || "").split("@")[0].trim().toLowerCase();
  if (/^(npm|pnpm|yarn|bun|nub)$/.test(declared)) return declared;
  if (has("pnpm-lock.yaml") || has("pnpm-workspace.yaml")) return "pnpm";
  if (has("yarn.lock")) return "yarn";
  if (has("bun.lockb") || has("bun.lock")) return "bun";
  return "npm";
}

function readText(dir, name, max = 200_000) {
  try {
    const file = path.join(dir, name);
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > max) return "";
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

/** `tests/*.tesh` (and one directory deeper) is an end-to-end harness, not `go test`. */
function hasTeshFiles(repoRoot) {
  const roots = ["tests", "test"];
  for (const root of roots) {
    if (dirHasTesh(path.join(repoRoot, root), 0)) return true;
  }
  return false;
}

function dirHasTesh(dir, depth) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    if (entry.isDirectory()) {
      if (depth < 2 && dirHasTesh(path.join(dir, entry.name), depth + 1)) return true;
    } else if (entry.name.endsWith(".tesh")) {
      return true;
    }
  }
  return false;
}
