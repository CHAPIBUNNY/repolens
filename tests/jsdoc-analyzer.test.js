// Tests for JSDoc/TSDoc extraction analyzer

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { analyzeJSDoc, getExportDoc, getFileExports, formatJSDocAsMarkdown } from "../src/analyzers/jsdoc-analyzer.js";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

describe("JSDoc Analyzer", () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "jsdoc-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("extracts JSDoc from exported functions", async () => {
    const code = `
/**
 * Calculates the sum of two numbers.
 * @param {number} a - First number
 * @param {number} b - Second number
 * @returns {number} The sum of a and b
 */
export function add(a, b) {
  return a + b;
}
`;
    await fs.writeFile(path.join(tempDir, "math.js"), code);
    
    const result = await analyzeJSDoc(["math.js"], tempDir);
    
    expect(result.detected).toBe(true);
    expect(result.exports).toHaveLength(1);
    expect(result.exports[0].name).toBe("add");
    expect(result.exports[0].jsdoc).toBeDefined();
    expect(result.exports[0].jsdoc.description).toBe("Calculates the sum of two numbers.");
    expect(result.exports[0].jsdoc.params).toHaveLength(2);
    expect(result.exports[0].jsdoc.params[0].name).toBe("a");
    expect(result.exports[0].jsdoc.params[0].type).toBe("number");
    expect(result.exports[0].jsdoc.returns.type).toBe("number");
  });

  it("detects deprecated functions", async () => {
    const code = `
/**
 * Old way to do things.
 * @deprecated Use newWay() instead
 */
export function oldWay() {}

export function newWay() {}
`;
    await fs.writeFile(path.join(tempDir, "legacy.js"), code);
    
    const result = await analyzeJSDoc(["legacy.js"], tempDir);
    
    expect(result.deprecated).toHaveLength(1);
    expect(result.deprecated[0].name).toBe("oldWay");
    expect(result.deprecated[0].reason).toBe("Use newWay() instead");
  });

  it("handles optional parameters", async () => {
    const code = `
/**
 * Greet someone.
 * @param {string} name - Person's name
 * @param {string} [greeting] - Optional greeting phrase
 */
export function greet(name, greeting = "Hello") {}
`;
    await fs.writeFile(path.join(tempDir, "greet.js"), code);
    
    const result = await analyzeJSDoc(["greet.js"], tempDir);
    
    const params = result.exports[0].jsdoc.params;
    expect(params[0].optional).toBe(false);
    expect(params[1].optional).toBe(true);
  });

  it("extracts examples", async () => {
    const code = `
/**
 * Format a date.
 * @example formatDate(new Date())
 */
export function formatDate(date) {}
`;
    await fs.writeFile(path.join(tempDir, "date.js"), code);
    
    const result = await analyzeJSDoc(["date.js"], tempDir);
    
    expect(result.exports[0].jsdoc.examples).toHaveLength(1);
    expect(result.exports[0].jsdoc.examples[0]).toBe("formatDate(new Date())");
  });

  it("extracts throws annotations", async () => {
    const code = `
/**
 * Parse JSON safely.
 * @throws {SyntaxError} If JSON is invalid
 */
export function parseJSON(str) {}
`;
    await fs.writeFile(path.join(tempDir, "parse.js"), code);
    
    const result = await analyzeJSDoc(["parse.js"], tempDir);
    
    expect(result.exports[0].jsdoc.throws).toHaveLength(1);
    expect(result.exports[0].jsdoc.throws[0]).toContain("SyntaxError");
  });

  it("counts documented vs undocumented exports", async () => {
    const code = `
/**
 * Documented function.
 */
export function documented() {}

export function undocumented() {}
`;
    await fs.writeFile(path.join(tempDir, "mixed.js"), code);
    
    const result = await analyzeJSDoc(["mixed.js"], tempDir);
    
    expect(result.documented).toBe(1);
    expect(result.undocumented).toBe(1);
    expect(result.summary.coverage).toBe("50%");
  });

  it("handles TypeScript files", async () => {
    const code = `
/**
 * Get user by ID.
 * @param {string} id - User ID
 * @returns {Promise<User>} The user object
 */
export async function getUser(id: string): Promise<User> {}
`;
    await fs.writeFile(path.join(tempDir, "user.ts"), code);
    
    const result = await analyzeJSDoc(["user.ts"], tempDir);
    
    expect(result.detected).toBe(true);
    expect(result.exports[0].name).toBe("getUser");
  });

  it("handles arrow function exports", async () => {
    const code = `
/**
 * Double a number.
 * @param {number} n - The number
 */
export const double = (n) => n * 2;
`;
    await fs.writeFile(path.join(tempDir, "arrow.js"), code);
    
    const result = await analyzeJSDoc(["arrow.js"], tempDir);
    
    expect(result.detected).toBe(true);
    expect(result.exports[0].name).toBe("double");
    expect(result.exports[0].type).toBe("arrow");
  });

  it("handles default exports", async () => {
    const code = `
/**
 * Main entry point.
 */
export default function main() {}
`;
    await fs.writeFile(path.join(tempDir, "main.js"), code);
    
    const result = await analyzeJSDoc(["main.js"], tempDir);
    
    expect(result.exports[0].name).toBe("main");
    expect(result.exports[0].isDefault).toBe(true);
  });

  it("returns empty result for non-JS files", async () => {
    const result = await analyzeJSDoc(["image.png", "data.json"], tempDir);
    expect(result.detected).toBe(false);
    expect(result.exports).toHaveLength(0);
  });
});

describe("getExportDoc", () => {
  it("finds export by name", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "jsdoc-find-"));
    const code = `
/**
 * Find me.
 */
export function findMe() {}

export function skipMe() {}
`;
    await fs.writeFile(path.join(tempDir, "find.js"), code);
    
    const result = await analyzeJSDoc(["find.js"], tempDir);
    const doc = getExportDoc(result, "findMe");
    
    expect(doc).toBeDefined();
    expect(doc.name).toBe("findMe");
    expect(doc.jsdoc.description).toBe("Find me.");
    
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("returns null for unknown export", async () => {
    const result = { exports: [] };
    expect(getExportDoc(result, "notFound")).toBeNull();
  });
});

describe("getFileExports", () => {
  it("returns exports for specific file", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "jsdoc-file-"));
    await fs.writeFile(path.join(tempDir, "a.js"), "export function a() {}");
    await fs.writeFile(path.join(tempDir, "b.js"), "export function b() {}");
    
    const result = await analyzeJSDoc(["a.js", "b.js"], tempDir);
    const aExports = getFileExports(result, "a.js");
    
    expect(aExports).toHaveLength(1);
    expect(aExports[0].name).toBe("a");
    
    await fs.rm(tempDir, { recursive: true, force: true });
  });
});

describe("formatJSDocAsMarkdown", () => {
  it("formats complete JSDoc as markdown", () => {
    const jsdoc = {
      description: "Process user data.",
      params: [
        { name: "user", type: "User", optional: false, description: "The user object" },
        { name: "options", type: "Options", optional: true, description: "Processing options" }
      ],
      returns: { type: "Result", description: "The processed result" },
      deprecated: null,
      throws: ["Error if user is invalid"],
      examples: ["processUser({ id: 1 })"],
      since: "1.0.0"
    };

    const md = formatJSDocAsMarkdown(jsdoc);
    
    expect(md).toContain("Process user data.");
    expect(md).toContain("`user`");
    expect(md).toContain("*(optional)*");
    expect(md).toContain("**Returns:**");
    expect(md).toContain("**Throws:**");
    expect(md).toContain("```javascript");
    expect(md).toContain("*Since: 1.0.0*");
  });

  it("formats deprecated warning", () => {
    const jsdoc = {
      description: "Old function",
      params: [],
      returns: null,
      deprecated: "Use newFunction instead",
      throws: [],
      examples: [],
      since: null
    };

    const md = formatJSDocAsMarkdown(jsdoc);
    expect(md).toContain("⚠️ **Deprecated**");
    expect(md).toContain("Use newFunction instead");
  });

  it("returns empty string for null jsdoc", () => {
    expect(formatJSDocAsMarkdown(null)).toBe("");
  });
});
