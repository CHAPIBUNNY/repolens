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
  const entries = listRoot(repoRoot);
  const has = (name) => entries.includes(name) && exists(repoRoot, name);
  const testFrameworks = (metadata.testFrameworks || []).map((name) => String(name).toLowerCase());

  if (has("package.json")) {
    const pkg = readJson(path.join(repoRoot, "package.json")) || {};
    let pm = "npm";
    if (has("pnpm-lock.yaml") || has("pnpm-workspace.yaml")) pm = "pnpm";
    else if (has("yarn.lock")) pm = "yarn";
    else if (has("bun.lockb") || has("bun.lock")) pm = "bun";
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
  }

  return { install, test, manifests };
}
