import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { analyzeSecurityPatterns } from "../src/analyzers/security-patterns.js";
import { renderSecurityHotspots } from "../src/renderers/renderAnalysis.js";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

let tmpDir;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "repolens-sec-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function writeFile(name, content) {
  const filePath = path.join(tmpDir, name);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
  return name;
}

describe("analyzeSecurityPatterns", () => {
  it("returns detected: false when no JS files provided", async () => {
    const result = await analyzeSecurityPatterns([], tmpDir);
    expect(result.detected).toBe(false);
    expect(result.findings).toEqual([]);
  });

  it("returns detected: false for clean code", async () => {
    const file = await writeFile("clean.js", `
      export function add(a, b) { return a + b; }
      export const name = "hello";
    `);
    const result = await analyzeSecurityPatterns([file], tmpDir);
    expect(result.detected).toBe(false);
    expect(result.findings.length).toBe(0);
  });

  it("detects eval() usage", async () => {
    const file = await writeFile("evil.js", `
      export function run(code) {
        return eval(code);
      }
    `);
    const result = await analyzeSecurityPatterns([file], tmpDir);
    expect(result.detected).toBe(true);
    expect(result.findings.length).toBeGreaterThanOrEqual(1);
    const evalFinding = result.findings.find(f => f.id === "eval-usage");
    expect(evalFinding).toBeDefined();
    expect(evalFinding.severity).toBe("high");
    expect(evalFinding.cwe).toBe("CWE-95");
    expect(evalFinding.file).toBe("evil.js");
  });

  it("detects innerHTML assignment", async () => {
    const file = await writeFile("xss.js", `
      function render(html) {
        document.getElementById("app").innerHTML = html;
      }
    `);
    const result = await analyzeSecurityPatterns([file], tmpDir);
    expect(result.detected).toBe(true);
    const finding = result.findings.find(f => f.id === "innerhtml-assignment");
    expect(finding).toBeDefined();
    expect(finding.severity).toBe("high");
    expect(finding.cwe).toBe("CWE-79");
  });

  it("detects dangerouslySetInnerHTML", async () => {
    const file = await writeFile("react-xss.jsx", `
      export function Comp({ html }) {
        return <div dangerouslySetInnerHTML={{ __html: html }} />;
      }
    `);
    const result = await analyzeSecurityPatterns([file], tmpDir);
    expect(result.detected).toBe(true);
    const finding = result.findings.find(f => f.id === "dangerously-set-inner-html");
    expect(finding).toBeDefined();
    expect(finding.category).toBe("Cross-Site Scripting (XSS)");
  });

  it("detects document.write()", async () => {
    const file = await writeFile("docwrite.js", `
      document.write("<h1>Hello</h1>");
    `);
    const result = await analyzeSecurityPatterns([file], tmpDir);
    expect(result.detected).toBe(true);
    const finding = result.findings.find(f => f.id === "document-write");
    expect(finding).toBeDefined();
  });

  it("detects SQL string concatenation", async () => {
    const file = await writeFile("sql.js", `
      function query(user) {
        const q = "SELECT * FROM users WHERE name = '" + user + "'";
        return db.exec(q);
      }
    `);
    const result = await analyzeSecurityPatterns([file], tmpDir);
    expect(result.detected).toBe(true);
    const finding = result.findings.find(f => f.id === "sql-concatenation");
    expect(finding).toBeDefined();
    expect(finding.severity).toBe("high");
    expect(finding.cwe).toBe("CWE-89");
  });

  it("detects SQL template literal injection", async () => {
    const file = await writeFile("sql-template.js", "function q(id) { return `SELECT * FROM users WHERE id = ${id}`; }");
    const result = await analyzeSecurityPatterns([file], tmpDir);
    expect(result.detected).toBe(true);
    const finding = result.findings.find(f => f.id === "sql-template-literal");
    expect(finding).toBeDefined();
  });

  it("detects new Function() constructor", async () => {
    const file = await writeFile("func.js", `
      const fn = new Function("a", "b", "return a + b");
    `);
    const result = await analyzeSecurityPatterns([file], tmpDir);
    expect(result.detected).toBe(true);
    const finding = result.findings.find(f => f.id === "new-function");
    expect(finding).toBeDefined();
    expect(finding.severity).toBe("high");
  });

  it("detects setTimeout with string argument", async () => {
    const file = await writeFile("timeout.js", `
      setTimeout("alert('hi')", 1000);
    `);
    const result = await analyzeSecurityPatterns([file], tmpDir);
    expect(result.detected).toBe(true);
    const finding = result.findings.find(f => f.id === "set-timeout-string");
    expect(finding).toBeDefined();
  });

  it("detects shell: true in spawn options", async () => {
    const file = await writeFile("spawn.js", `
      import { spawn } from "child_process";
      spawn("ls", ["-la"], { shell: true });
    `);
    const result = await analyzeSecurityPatterns([file], tmpDir);
    expect(result.detected).toBe(true);
    const finding = result.findings.find(f => f.id === "shell-true");
    expect(finding).toBeDefined();
  });

  it("detects __proto__ assignment", async () => {
    const file = await writeFile("proto.js", `
      obj.__proto__ = malicious;
    `);
    const result = await analyzeSecurityPatterns([file], tmpDir);
    expect(result.detected).toBe(true);
    const finding = result.findings.find(f => f.id === "prototype-assignment");
    expect(finding).toBeDefined();
    expect(finding.cwe).toBe("CWE-1321");
  });

  it("detects hardcoded passwords", async () => {
    const file = await writeFile("creds.js", `
      const config = {
        password: "supersecretpassword123",
      };
    `);
    const result = await analyzeSecurityPatterns([file], tmpDir);
    expect(result.detected).toBe(true);
    const finding = result.findings.find(f => f.id === "hardcoded-password");
    expect(finding).toBeDefined();
    expect(finding.severity).toBe("high");
  });

  it("detects Math.random() usage", async () => {
    const file = await writeFile("random.js", `
      function generateToken() {
        return Math.random().toString(36).slice(2);
      }
    `);
    const result = await analyzeSecurityPatterns([file], tmpDir);
    expect(result.detected).toBe(true);
    const finding = result.findings.find(f => f.id === "math-random-security");
    expect(finding).toBeDefined();
    expect(finding.severity).toBe("low");
  });

  it("skips test files", async () => {
    const file = await writeFile("evil.test.js", `
      eval("some test code");
    `);
    const result = await analyzeSecurityPatterns([file], tmpDir);
    expect(result.detected).toBe(false);
  });

  it("skips files in test directories", async () => {
    const file = await writeFile("tests/security.js", `
      eval("some code");
    `);
    const result = await analyzeSecurityPatterns([file], tmpDir);
    expect(result.detected).toBe(false);
  });

  it("skips .min.js files", async () => {
    const file = await writeFile("bundle.min.js", `eval("x")`);
    const result = await analyzeSecurityPatterns([file], tmpDir);
    expect(result.detected).toBe(false);
  });

  it("ignores patterns in comments", async () => {
    const file = await writeFile("commented.js", `
      // eval("don't detect this");
      /* 
        document.write("also skip this");
      */
      export const safe = true;
    `);
    const result = await analyzeSecurityPatterns([file], tmpDir);
    expect(result.detected).toBe(false);
  });

  it("groups findings by category", async () => {
    const file = await writeFile("mixed.js", `
      eval(code);
      document.getElementById("x").innerHTML = data;
    `);
    const result = await analyzeSecurityPatterns([file], tmpDir);
    expect(result.detected).toBe(true);
    expect(Object.keys(result.byCategory).length).toBeGreaterThanOrEqual(2);
    expect(result.byCategory["Code Injection"]).toBeDefined();
    expect(result.byCategory["Cross-Site Scripting (XSS)"]).toBeDefined();
  });

  it("tracks severity counts correctly", async () => {
    const file = await writeFile("multi.js", `
      eval(code);
      document.getElementById("x").innerHTML = data;
      const token = Math.random().toString(36);
    `);
    const result = await analyzeSecurityPatterns([file], tmpDir);
    expect(result.bySeverity.high).toBeGreaterThanOrEqual(2);
    expect(result.bySeverity.low).toBeGreaterThanOrEqual(1);
  });

  it("provides line numbers", async () => {
    const file = await writeFile("lines.js", `const a = 1;
const b = 2;
const c = eval("test");
`);
    const result = await analyzeSecurityPatterns([file], tmpDir);
    const finding = result.findings.find(f => f.id === "eval-usage");
    expect(finding).toBeDefined();
    expect(finding.line).toBe(3);
  });

  it("generates a human-readable summary", async () => {
    const file = await writeFile("sum.js", `
      eval(x);
      document.getElementById("y").innerHTML = z;
    `);
    const result = await analyzeSecurityPatterns([file], tmpDir);
    expect(result.summary).toContain("finding");
    expect(result.summary).toContain("high");
  });

  it("returns files with findings list", async () => {
    const file1 = await writeFile("a.js", `eval("code")`);
    const file2 = await writeFile("b.js", `const safe = 1;`);
    const result = await analyzeSecurityPatterns([file1, file2], tmpDir);
    expect(result.filesWithFindings).toContain("a.js");
    expect(result.filesWithFindings).not.toContain("b.js");
  });

  it("handles non-existent files gracefully", async () => {
    const result = await analyzeSecurityPatterns(["nonexistent.js"], tmpDir);
    expect(result.detected).toBe(false);
  });

  it("handles multiple findings in one file", async () => {
    const file = await writeFile("many.js", `
      eval(a);
      eval(b);
      eval(c);
    `);
    const result = await analyzeSecurityPatterns([file], tmpDir);
    const evalFindings = result.findings.filter(f => f.id === "eval-usage");
    expect(evalFindings.length).toBe(3);
  });

  it("skips non-JS/TS files", async () => {
    const file = await writeFile("readme.md", `eval() is dangerous`);
    const result = await analyzeSecurityPatterns([file], tmpDir);
    expect(result.detected).toBe(false);
  });
});

describe("renderSecurityHotspots", () => {
  it("renders 'not detected' message for no findings", () => {
    const result = renderSecurityHotspots({ detected: false });
    expect(result).toContain("No security anti-patterns");
    expect(result).toContain("# Security Hotspots");
  });

  it("renders full report with findings", () => {
    const mockResult = {
      detected: true,
      summary: "3 findings · 1 high · 1 medium · 1 low",
      findings: [
        { id: "eval-usage", category: "Code Injection", name: "eval() usage", severity: "high", file: "src/bad.js", line: 10, description: "Bad", cwe: "CWE-95" },
        { id: "shell-true", category: "Command Injection", name: "shell: true", severity: "medium", file: "src/cmd.js", line: 5, description: "Risky", cwe: "CWE-78" },
        { id: "math-random-security", category: "Insecure Randomness", name: "Math.random()", severity: "low", file: "src/token.js", line: 3, description: "Weak", cwe: "CWE-330" },
      ],
      bySeverity: { high: 1, medium: 1, low: 1 },
      byCategory: {
        "Code Injection": [{ id: "eval-usage", category: "Code Injection", name: "eval() usage", severity: "high", file: "src/bad.js", line: 10, description: "Bad", cwe: "CWE-95" }],
        "Command Injection": [{ id: "shell-true", category: "Command Injection", name: "shell: true", severity: "medium", file: "src/cmd.js", line: 5, description: "Risky", cwe: "CWE-78" }],
        "Insecure Randomness": [{ id: "math-random-security", category: "Insecure Randomness", name: "Math.random()", severity: "low", file: "src/token.js", line: 3, description: "Weak", cwe: "CWE-330" }],
      },
      filesScanned: 10,
      filesWithFindings: ["src/bad.js", "src/cmd.js", "src/token.js"],
      filesWithFindingsCount: 3,
    };

    const html = renderSecurityHotspots(mockResult);
    expect(html).toContain("# Security Hotspots");
    expect(html).toContain("Severity Overview");
    expect(html).toContain("🔴 High");
    expect(html).toContain("🟡 Medium");
    expect(html).toContain("🔵 Low");
    expect(html).toContain("Code Injection");
    expect(html).toContain("Command Injection");
    expect(html).toContain("Insecure Randomness");
    expect(html).toContain("Affected Files");
    expect(html).toContain("CWE-95");
    expect(html).toContain("src/bad.js");
  });

  it("renders null/undefined as not detected", () => {
    expect(renderSecurityHotspots(null)).toContain("No security anti-patterns");
    expect(renderSecurityHotspots(undefined)).toContain("No security anti-patterns");
  });
});

describe("document-plan integration", () => {
  it("includes security_hotspots in DOCUMENT_PLAN", async () => {
    const { DOCUMENT_PLAN, getDocumentByKey } = await import("../src/ai/document-plan.js");
    const entry = getDocumentByKey("security_hotspots");
    expect(entry).toBeDefined();
    expect(entry.filename).toBe("15-security-hotspots.md");
    expect(entry.audience).toBe("technical");
    expect(entry.ai).toBe(false);
    expect(DOCUMENT_PLAN.length).toBe(17);
  });
});
