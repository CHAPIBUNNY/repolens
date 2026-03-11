// TypeScript type graph analysis — maps interfaces, types, classes, and their relationships

import fs from "node:fs/promises";
import path from "node:path";
import { info } from "../utils/logger.js";

const TS_EXTENSIONS = [".ts", ".tsx"];

// Patterns for extracting type declarations
const INTERFACE_PATTERN = /(?:export\s+)?interface\s+(\w+)(?:\s+extends\s+([\w,\s<>]+))?\s*\{/g;
const TYPE_ALIAS_PATTERN = /(?:export\s+)?type\s+(\w+)(?:<[^>]*>)?\s*=\s*([^;]+);/g;
const CLASS_PATTERN = /(?:export\s+)?(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([\w,\s]+))?\s*\{/g;
const ENUM_PATTERN = /(?:export\s+)?(?:const\s+)?enum\s+(\w+)\s*\{/g;
const GENERIC_CONSTRAINT = /<(\w+)\s+extends\s+(\w+)/g;

async function readFileSafe(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

function extractTypeReferences(typeExpression) {
  // Extract named type references from a type expression (strips primitives, operators)
  const primitives = new Set([
    "string", "number", "boolean", "void", "null", "undefined", "never", "any",
    "unknown", "object", "bigint", "symbol", "true", "false",
  ]);
  const refs = new Set();
  // Match word boundaries that look like type names (PascalCase or all-caps)
  const namePattern = /\b([A-Z]\w*)\b/g;
  let match;
  while ((match = namePattern.exec(typeExpression)) !== null) {
    const name = match[1];
    if (!primitives.has(name.toLowerCase()) && name !== "Array" && name !== "Promise" &&
        name !== "Record" && name !== "Partial" && name !== "Required" && name !== "Omit" &&
        name !== "Pick" && name !== "Readonly" && name !== "Map" && name !== "Set" &&
        name !== "Date" && name !== "RegExp" && name !== "Error" && name !== "Buffer") {
      refs.add(name);
    }
  }
  return [...refs];
}

export async function analyzeTypeScript(files, repoRoot) {
  const result = {
    detected: false,
    interfaces: [],
    typeAliases: [],
    classes: [],
    enums: [],
    relationships: [],  // { from, to, type: extends|implements|references }
    files: [],
    summary: null,
  };

  const tsFiles = files.filter(f => TS_EXTENSIONS.some(ext => f.endsWith(ext)));
  if (tsFiles.length === 0) return result;

  result.detected = true;
  const typeNames = new Set(); // track all declared type names for relationship resolution

  for (const file of tsFiles) {
    const content = await readFileSafe(path.join(repoRoot, file));
    if (!content) continue;

    let hasTypes = false;

    // Interfaces
    let match;
    const ifaceRegex = new RegExp(INTERFACE_PATTERN.source, "g");
    while ((match = ifaceRegex.exec(content)) !== null) {
      const name = match[1];
      const extends_ = match[2] ? match[2].split(",").map(s => s.replace(/<.*/, "").trim()) : [];
      typeNames.add(name);
      result.interfaces.push({ name, extends: extends_, source: file });
      hasTypes = true;

      for (const parent of extends_) {
        result.relationships.push({ from: name, to: parent, type: "extends" });
      }
    }

    // Type aliases
    const typeRegex = new RegExp(TYPE_ALIAS_PATTERN.source, "g");
    while ((match = typeRegex.exec(content)) !== null) {
      const name = match[1];
      const definition = match[2].trim();
      const refs = extractTypeReferences(definition);
      typeNames.add(name);
      result.typeAliases.push({ name, refs, source: file });
      hasTypes = true;

      for (const ref of refs) {
        result.relationships.push({ from: name, to: ref, type: "references" });
      }
    }

    // Classes
    const classRegex = new RegExp(CLASS_PATTERN.source, "g");
    while ((match = classRegex.exec(content)) !== null) {
      const name = match[1];
      const extends_ = match[2] || null;
      const implements_ = match[3] ? match[3].split(",").map(s => s.trim()) : [];
      typeNames.add(name);
      result.classes.push({ name, extends: extends_, implements: implements_, source: file });
      hasTypes = true;

      if (extends_) {
        result.relationships.push({ from: name, to: extends_, type: "extends" });
      }
      for (const iface of implements_) {
        result.relationships.push({ from: name, to: iface, type: "implements" });
      }
    }

    // Enums
    const enumRegex = new RegExp(ENUM_PATTERN.source, "g");
    while ((match = enumRegex.exec(content)) !== null) {
      typeNames.add(match[1]);
      result.enums.push({ name: match[1], source: file });
      hasTypes = true;
    }

    // Generic constraints (e.g., <T extends SomeType>)
    const constraintRegex = new RegExp(GENERIC_CONSTRAINT.source, "g");
    while ((match = constraintRegex.exec(content)) !== null) {
      // Only track if the constraint references a known (non-primitive) type
      const refs = extractTypeReferences(match[2]);
      for (const ref of refs) {
        result.relationships.push({ from: match[1], to: ref, type: "constrained-by" });
      }
    }

    if (hasTypes) {
      result.files.push(file);
    }
  }

  // Filter relationships to only include edges where both sides are project-declared types
  result.relationships = result.relationships.filter(
    r => typeNames.has(r.from) && typeNames.has(r.to) && r.from !== r.to
  );

  // Deduplicate relationships
  const relKey = r => `${r.from}→${r.to}:${r.type}`;
  const seen = new Set();
  result.relationships = result.relationships.filter(r => {
    const k = relKey(r);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  result.summary = buildSummary(result);
  info(`TypeScript types: ${result.interfaces.length} interfaces, ${result.typeAliases.length} aliases, ${result.classes.length} classes, ${result.enums.length} enums`);

  return result;
}

function buildSummary(result) {
  const parts = [];
  if (result.files.length) parts.push(`${result.files.length} file(s) with type declarations`);
  if (result.interfaces.length) parts.push(`${result.interfaces.length} interface(s)`);
  if (result.typeAliases.length) parts.push(`${result.typeAliases.length} type alias(es)`);
  if (result.classes.length) parts.push(`${result.classes.length} class(es)`);
  if (result.enums.length) parts.push(`${result.enums.length} enum(s)`);
  if (result.relationships.length) parts.push(`${result.relationships.length} relationship(s)`);
  return parts.join(" · ");
}
