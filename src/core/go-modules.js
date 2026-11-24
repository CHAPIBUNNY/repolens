// Go packages are directories. A module is that directory, not the first folder
// under a module root: `internal/adapter/sqlite` and `internal/adapter/lsp` are
// different packages, and lumping them hid the LSP adapter.

import path from "node:path";

function norm(file) {
  return String(file || "").replace(/\\/g, "/");
}

/** Directory of a non-test `.go` file, `""` at the repo root, or null. */
export function goModuleDir(file) {
  const normalized = norm(file);
  if (!normalized.endsWith(".go") || normalized.endsWith("_test.go")) return null;
  const dir = path.posix.dirname(normalized);
  return dir === "." ? "" : dir;
}

/** `package` clause, ignoring a leading comment line. `""` when there is none. */
export function goPackageName(source) {
  const match = String(source || "").match(/(?:^|\n)[ \t]*package[ \t]+([A-Za-z_]\w*)/);
  return match ? match[1] : "";
}

/**
 * Evidence that this product file is part of a language server: an `lsp` package
 * directory, an `lsp` command under cmd/cli/commands, or a glsp / LSP 3.16 import.
 * @returns {string[]} short paths to cite
 */
export function lspEvidenceIn(file, source) {
  const normalized = norm(file);
  const parts = normalized.split("/");
  const dirs = parts.slice(0, -1);
  const base = parts[parts.length - 1] || "";
  const evidence = [];
  if (dirs.includes("lsp")) evidence.push(dirs.join("/") || ".");
  const commandDir = dirs.some((segment) => segment === "cmd" || segment === "cli" || segment === "commands");
  if (commandDir && (base === "lsp.go" || dirs.includes("lsp"))) evidence.push(normalized);
  const text = String(source || "");
  if (/protocol_3_16/.test(text) || /\/glsp(?:\/|"|')/.test(text) || /github\.com\/tliron\/glsp/.test(text)) {
    evidence.push(normalized);
  }
  return [...new Set(evidence)];
}
