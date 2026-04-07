// JSDoc/TSDoc extraction for API Surface enrichment
// Parses @param, @returns, @deprecated, @example, @description tags

import fs from "node:fs/promises";
import path from "node:path";
import { info } from "../utils/logger.js";

const JS_EXTENSIONS = [".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx"];

/**
 * Pattern to match JSDoc/TSDoc block comments
 * Captures the entire comment block including * prefixes
 */
const JSDOC_BLOCK = /\/\*\*[\s\S]*?\*\//g;

/**
 * Pattern to match exported functions (named exports and default exports)
 * Captures function name and parameter list
 */
const EXPORT_FUNCTION = /export\s+(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/g;
const EXPORT_CONST_ARROW = /export\s+const\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g;
const EXPORT_DEFAULT_FUNCTION = /export\s+default\s+(?:async\s+)?function(?:\s+(\w+))?\s*\(([^)]*)\)/g;

/**
 * Parse a JSDoc block into structured tags
 */
function parseJSDocBlock(block) {
  const result = {
    description: "",
    params: [],
    returns: null,
    deprecated: null,
    examples: [],
    throws: [],
    see: [],
    since: null,
  };

  // Remove comment markers and normalize
  const lines = block
    .replace(/^\/\*\*/, "")
    .replace(/\*\/$/, "")
    .split("\n")
    .map(line => line.replace(/^\s*\*\s?/, "").trim())
    .filter(line => line.length > 0);

  let currentTag = null;
  let currentValue = [];

  function flushTag() {
    if (!currentTag) {
      // If no tag yet, this is the description
      if (currentValue.length > 0) {
        result.description = currentValue.join(" ").trim();
      }
    } else {
      const value = currentValue.join(" ").trim();
      
      switch (currentTag) {
        case "param":
        case "arg":
        case "argument": {
          // Parse @param {Type} name - description
          const paramMatch = value.match(/^(?:\{([^}]+)\}\s*)?(\[?[\w.]+\]?)\s*(?:-\s*)?(.*)$/);
          if (paramMatch) {
            result.params.push({
              type: paramMatch[1] || "any",
              name: paramMatch[2].replace(/^\[|\]$/g, ""), // Remove optional brackets
              optional: paramMatch[2].startsWith("["),
              description: paramMatch[3] || "",
            });
          }
          break;
        }
        case "returns":
        case "return": {
          // Parse @returns {Type} description
          const returnMatch = value.match(/^(?:\{([^}]+)\}\s*)?(.*)$/);
          if (returnMatch) {
            result.returns = {
              type: returnMatch[1] || "void",
              description: returnMatch[2] || "",
            };
          }
          break;
        }
        case "deprecated":
          result.deprecated = value || "This function is deprecated.";
          break;
        case "example":
          result.examples.push(value);
          break;
        case "throws":
        case "exception":
          result.throws.push(value);
          break;
        case "see":
          result.see.push(value);
          break;
        case "since":
          result.since = value;
          break;
      }
    }
    currentTag = null;
    currentValue = [];
  }

  for (const line of lines) {
    const tagMatch = line.match(/^@(\w+)\s*(.*)?$/);
    if (tagMatch) {
      flushTag();
      currentTag = tagMatch[1];
      if (tagMatch[2]) {
        currentValue.push(tagMatch[2]);
      }
    } else if (line.length > 0) {
      currentValue.push(line);
    }
  }
  flushTag();

  return result;
}

/**
 * Find the JSDoc block immediately preceding a position in source code
 */
function findPrecedingJSDoc(source, position) {
  // Look backwards from position for a JSDoc block
  const beforePos = source.slice(0, position);
  const blocks = [...beforePos.matchAll(JSDOC_BLOCK)];
  
  if (blocks.length === 0) return null;
  
  const lastBlock = blocks[blocks.length - 1];
  const blockEnd = lastBlock.index + lastBlock[0].length;
  
  // Check if the JSDoc block is immediately before the function (allow whitespace/newlines)
  const between = source.slice(blockEnd, position);
  if (/^[\s]*$/.test(between)) {
    return parseJSDocBlock(lastBlock[0]);
  }
  
  return null;
}

/**
 * Extract all documented exports from a file
 */
function extractDocumentedExports(source, filePath) {
  const exports = [];
  const relativePath = filePath;

  // Named function exports
  const funcRegex = new RegExp(EXPORT_FUNCTION.source, "g");
  let match;
  while ((match = funcRegex.exec(source)) !== null) {
    const jsdoc = findPrecedingJSDoc(source, match.index);
    exports.push({
      name: match[1],
      type: "function",
      params: match[2] ? match[2].split(",").map(p => p.trim()).filter(Boolean) : [],
      source: relativePath,
      line: source.slice(0, match.index).split("\n").length,
      jsdoc: jsdoc,
    });
  }

  // Arrow function exports (export const x = () => ...)
  const arrowRegex = new RegExp(EXPORT_CONST_ARROW.source, "g");
  while ((match = arrowRegex.exec(source)) !== null) {
    const jsdoc = findPrecedingJSDoc(source, match.index);
    exports.push({
      name: match[1],
      type: "arrow",
      source: relativePath,
      line: source.slice(0, match.index).split("\n").length,
      jsdoc: jsdoc,
    });
  }

  // Default function exports
  const defaultRegex = new RegExp(EXPORT_DEFAULT_FUNCTION.source, "g");
  while ((match = defaultRegex.exec(source)) !== null) {
    const jsdoc = findPrecedingJSDoc(source, match.index);
    exports.push({
      name: match[1] || "default",
      type: "function",
      params: match[2] ? match[2].split(",").map(p => p.trim()).filter(Boolean) : [],
      source: relativePath,
      line: source.slice(0, match.index).split("\n").length,
      isDefault: true,
      jsdoc: jsdoc,
    });
  }

  return exports;
}

async function readFileSafe(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

/**
 * Analyze JSDoc/TSDoc across all JavaScript/TypeScript files
 * @param {string[]} files - List of file paths relative to repo root
 * @param {string} repoRoot - Absolute path to repository root
 * @returns {Promise<Object>} Analysis result with documented exports
 */
export async function analyzeJSDoc(files, repoRoot) {
  const result = {
    detected: false,
    exports: [],
    documented: 0,
    undocumented: 0,
    deprecated: [],
    byFile: {},
    summary: null,
  };

  const jsFiles = files.filter(f => JS_EXTENSIONS.some(ext => f.endsWith(ext)));
  if (jsFiles.length === 0) return result;

  for (const file of jsFiles) {
    const content = await readFileSafe(path.join(repoRoot, file));
    if (!content) continue;

    const fileExports = extractDocumentedExports(content, file);
    if (fileExports.length === 0) continue;

    result.detected = true;
    result.byFile[file] = fileExports;

    for (const exp of fileExports) {
      result.exports.push(exp);
      
      if (exp.jsdoc) {
        result.documented++;
        if (exp.jsdoc.deprecated) {
          result.deprecated.push({
            name: exp.name,
            source: exp.source,
            reason: exp.jsdoc.deprecated,
          });
        }
      } else {
        result.undocumented++;
      }
    }
  }

  // Build summary
  const total = result.documented + result.undocumented;
  const coverage = total > 0 ? Math.round((result.documented / total) * 100) : 0;
  
  result.summary = {
    totalExports: total,
    documented: result.documented,
    undocumented: result.undocumented,
    coverage: `${coverage}%`,
    deprecatedCount: result.deprecated.length,
    filesWithExports: Object.keys(result.byFile).length,
  };

  if (total > 0) {
    info(`JSDoc analysis: ${result.documented}/${total} exports documented (${coverage}%), ${result.deprecated.length} deprecated`);
  }

  return result;
}

/**
 * Get documentation for a specific export
 * @param {Object} jsdocResult - Result from analyzeJSDoc
 * @param {string} exportName - Name of the export to find
 * @returns {Object|null} Export info with JSDoc or null if not found
 */
export function getExportDoc(jsdocResult, exportName) {
  return jsdocResult.exports.find(e => e.name === exportName) || null;
}

/**
 * Get all documented exports from a specific file
 * @param {Object} jsdocResult - Result from analyzeJSDoc
 * @param {string} filePath - Relative path to the file
 * @returns {Object[]} Array of exports from that file
 */
export function getFileExports(jsdocResult, filePath) {
  return jsdocResult.byFile[filePath] || [];
}

/**
 * Format JSDoc for display in documentation
 * @param {Object} jsdoc - Parsed JSDoc object
 * @returns {string} Markdown-formatted documentation
 */
export function formatJSDocAsMarkdown(jsdoc) {
  if (!jsdoc) return "";
  
  const lines = [];
  
  if (jsdoc.description) {
    lines.push(jsdoc.description);
    lines.push("");
  }
  
  if (jsdoc.deprecated) {
    lines.push(`> ⚠️ **Deprecated**: ${jsdoc.deprecated}`);
    lines.push("");
  }
  
  if (jsdoc.params.length > 0) {
    lines.push("**Parameters:**");
    for (const param of jsdoc.params) {
      const opt = param.optional ? " *(optional)*" : "";
      lines.push(`- \`${param.name}\` (\`${param.type}\`)${opt}: ${param.description}`);
    }
    lines.push("");
  }
  
  if (jsdoc.returns) {
    lines.push(`**Returns:** \`${jsdoc.returns.type}\` — ${jsdoc.returns.description}`);
    lines.push("");
  }
  
  if (jsdoc.throws.length > 0) {
    lines.push("**Throws:**");
    for (const t of jsdoc.throws) {
      lines.push(`- ${t}`);
    }
    lines.push("");
  }
  
  if (jsdoc.examples.length > 0) {
    lines.push("**Example:**");
    for (const ex of jsdoc.examples) {
      lines.push("```javascript");
      lines.push(ex);
      lines.push("```");
    }
    lines.push("");
  }
  
  if (jsdoc.since) {
    lines.push(`*Since: ${jsdoc.since}*`);
  }
  
  return lines.join("\n").trim();
}
