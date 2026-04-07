// Security pattern detection — scans source files for risky code patterns
// Detects: eval(), innerHTML, SQL concatenation, command injection,
//          hardcoded secrets, prototype pollution, regex DoS, path traversal

import fs from "node:fs/promises";
import path from "node:path";
import { info, warn } from "../utils/logger.js";

const JS_EXTENSIONS = [".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx"];

/**
 * Security pattern categories with regex detection and severity
 */
const SECURITY_PATTERNS = [
  // Code Injection
  {
    id: "eval-usage",
    category: "Code Injection",
    name: "eval() usage",
    severity: "high",
    pattern: /\beval\s*\(/g,
    description: "eval() executes arbitrary code and is a major injection risk. Replace with JSON.parse(), Function constructor, or domain-specific parsers.",
    cwe: "CWE-95",
  },
  {
    id: "new-function",
    category: "Code Injection",
    name: "new Function() constructor",
    severity: "high",
    pattern: /new\s+Function\s*\(/g,
    description: "Function constructor is equivalent to eval(). Use safe alternatives.",
    cwe: "CWE-95",
  },
  {
    id: "set-timeout-string",
    category: "Code Injection",
    name: "setTimeout/setInterval with string argument",
    severity: "medium",
    // Matches setTimeout("...", ...) or setTimeout('...', ...) or setTimeout(`...`, ...)
    pattern: /(?:setTimeout|setInterval)\s*\(\s*['"`]/g,
    description: "Passing a string to setTimeout/setInterval triggers eval-like behavior. Pass a function reference instead.",
    cwe: "CWE-95",
  },

  // XSS
  {
    id: "innerhtml-assignment",
    category: "Cross-Site Scripting (XSS)",
    name: "innerHTML assignment",
    severity: "high",
    pattern: /\.innerHTML\s*[=+](?!=)/g,
    description: "Direct innerHTML assignment can execute injected scripts. Use textContent, or sanitize with DOMPurify.",
    cwe: "CWE-79",
  },
  {
    id: "outerhtml-assignment",
    category: "Cross-Site Scripting (XSS)",
    name: "outerHTML assignment",
    severity: "high",
    pattern: /\.outerHTML\s*[=+](?!=)/g,
    description: "outerHTML assignment is equivalent to innerHTML and carries the same XSS risk.",
    cwe: "CWE-79",
  },
  {
    id: "document-write",
    category: "Cross-Site Scripting (XSS)",
    name: "document.write()",
    severity: "high",
    pattern: /document\.write(?:ln)?\s*\(/g,
    description: "document.write() can inject unescaped HTML. Use DOM APIs to manipulate the page.",
    cwe: "CWE-79",
  },
  {
    id: "dangerously-set-inner-html",
    category: "Cross-Site Scripting (XSS)",
    name: "React dangerouslySetInnerHTML",
    severity: "medium",
    pattern: /dangerouslySetInnerHTML/g,
    description: "dangerouslySetInnerHTML bypasses React's XSS protection. Ensure content is sanitized before use.",
    cwe: "CWE-79",
  },

  // SQL Injection
  {
    id: "sql-concatenation",
    category: "SQL Injection",
    name: "SQL string concatenation",
    severity: "high",
    // Matches SQL keywords followed by string concat with variables
    pattern: /(?:SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER)\s+.*?\+\s*(?:\w+|['"`])/gi,
    description: "Concatenating user input into SQL queries enables injection attacks. Use parameterized queries or prepared statements.",
    cwe: "CWE-89",
  },
  {
    id: "sql-template-literal",
    category: "SQL Injection",
    name: "SQL in template literals with interpolation",
    severity: "medium",
    pattern: /`(?:SELECT|INSERT|UPDATE|DELETE|DROP)\s+[^`]*\$\{/gi,
    description: "Template literals with SQL and variable interpolation may be vulnerable. Use parameterized queries.",
    cwe: "CWE-89",
  },

  // Command Injection
  {
    id: "exec-usage",
    category: "Command Injection",
    name: "child_process exec()",
    severity: "high",
    // exec with string that includes variable interpolation
    pattern: /(?:exec|execSync)\s*\(\s*(?:`[^`]*\$\{|['"][^)]*\+)/g,
    description: "exec() with string interpolation enables command injection. Use execFile() or spawn() with argument arrays.",
    cwe: "CWE-78",
  },
  {
    id: "shell-true",
    category: "Command Injection",
    name: "spawn/execFile with shell: true",
    severity: "medium",
    pattern: /shell\s*:\s*true/g,
    description: "shell: true enables shell interpretation of arguments, risking injection. Remove when possible.",
    cwe: "CWE-78",
  },

  // Path Traversal
  {
    id: "path-traversal",
    category: "Path Traversal",
    name: "Unsanitized path join with user input",
    severity: "medium",
    // req.params, req.query, req.body used in path operations
    pattern: /path\.(?:join|resolve)\s*\([^)]*req\.(?:params|query|body)/g,
    description: "Combining user input with path operations without sanitization enables directory traversal. Validate and normalize paths.",
    cwe: "CWE-22",
  },

  // Prototype Pollution
  {
    id: "prototype-assignment",
    category: "Prototype Pollution",
    name: "__proto__ assignment",
    severity: "high",
    pattern: /__proto__\s*[=\[]/g,
    description: "__proto__ manipulation can pollute Object prototype. Use Object.create(null) for dictionary objects.",
    cwe: "CWE-1321",
  },
  {
    id: "object-merge-unsafe",
    category: "Prototype Pollution",
    name: "Recursive object merge without prototype check",
    severity: "low",
    // Deep/recursive merge or extend patterns
    pattern: /(?:deepMerge|deepExtend|merge|assign)\s*\(/g,
    description: "Deep merge utilities may be vulnerable to prototype pollution if they don't check hasOwnProperty. Verify the implementation.",
    cwe: "CWE-1321",
  },

  // Hardcoded Credentials
  {
    id: "hardcoded-password",
    category: "Hardcoded Credentials",
    name: "Hardcoded password or secret",
    severity: "high",
    // password = "...", secret = "...", apiKey = "..." (not env vars)
    pattern: /(?:password|passwd|secret|api_?key|token)\s*[:=]\s*['"][^'"]{8,}['"]/gi,
    description: "Hardcoded credentials should be moved to environment variables or a secrets manager.",
    cwe: "CWE-798",
  },

  // Insecure Randomness
  {
    id: "math-random-security",
    category: "Insecure Randomness",
    name: "Math.random() for security-sensitive operation",
    severity: "low",
    pattern: /Math\.random\s*\(\s*\)/g,
    description: "Math.random() is not cryptographically secure. Use crypto.randomUUID() or crypto.getRandomValues() for security tokens.",
    cwe: "CWE-330",
  },

  // Regex DoS
  {
    id: "regex-dos",
    category: "ReDoS",
    name: "Potentially catastrophic regex",
    severity: "low",
    // Nested quantifiers like (a+)+ or (a*)*
    pattern: /new\s+RegExp\s*\(\s*(?:\w+|['"`])/g,
    description: "Dynamic regex construction from user input can cause ReDoS. Use static regex or input validation.",
    cwe: "CWE-1333",
  },
];

// Files/patterns to skip (test files, config, generated code)
const SKIP_PATTERNS = [
  /node_modules\//,
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /\btest[s]?\//,
  /\bdist\//,
  /\bbuild\//,
  /\.min\.[jt]s$/,
  /\.d\.ts$/,
  /\.config\.[jt]s$/,
  /\.repolens\//,
];

function shouldSkipFile(filePath) {
  return SKIP_PATTERNS.some(pattern => pattern.test(filePath));
}

async function readFileSafe(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

/**
 * Scan source files for security anti-patterns
 * @param {string[]} files - List of file paths relative to repo root
 * @param {string} repoRoot - Absolute path to repository root
 * @returns {Promise<Object>} Security analysis result
 */
export async function analyzeSecurityPatterns(files, repoRoot) {
  const result = {
    detected: false,
    findings: [],
    summary: null,
    byCategory: {},
    bySeverity: { high: 0, medium: 0, low: 0 },
    filesScanned: 0,
    filesWithFindings: new Set(),
  };

  const jsFiles = files
    .filter(f => JS_EXTENSIONS.some(ext => f.endsWith(ext)))
    .filter(f => !shouldSkipFile(f));

  if (jsFiles.length === 0) return result;

  result.filesScanned = jsFiles.length;

  for (const file of jsFiles) {
    const content = await readFileSafe(path.join(repoRoot, file));
    if (!content) continue;

    // Strip comments to reduce false positives
    const stripped = stripComments(content);

    for (const pattern of SECURITY_PATTERNS) {
      const regex = new RegExp(pattern.pattern.source, pattern.pattern.flags);
      let match;
      
      while ((match = regex.exec(stripped)) !== null) {
        // Get line number
        const lineNumber = stripped.slice(0, match.index).split("\n").length;
        
        // Get the surrounding code snippet
        const lines = stripped.split("\n");
        const snippetStart = Math.max(0, lineNumber - 2);
        const snippetEnd = Math.min(lines.length, lineNumber + 1);
        const snippet = lines.slice(snippetStart, snippetEnd).join("\n").trim();
        
        result.detected = true;
        result.findings.push({
          id: pattern.id,
          category: pattern.category,
          name: pattern.name,
          severity: pattern.severity,
          file,
          line: lineNumber,
          snippet: snippet.length > 200 ? snippet.slice(0, 200) + "..." : snippet,
          description: pattern.description,
          cwe: pattern.cwe,
        });

        result.bySeverity[pattern.severity]++;
        result.filesWithFindings.add(file);
        
        if (!result.byCategory[pattern.category]) {
          result.byCategory[pattern.category] = [];
        }
        result.byCategory[pattern.category].push(result.findings[result.findings.length - 1]);
      }
    }
  }

  // Convert Set to count for serialization
  result.filesWithFindingsCount = result.filesWithFindings.size;
  result.filesWithFindings = [...result.filesWithFindings];

  result.summary = buildSummary(result);
  
  if (result.findings.length > 0) {
    info(`Security patterns: ${result.findings.length} finding(s) in ${result.filesWithFindingsCount} file(s) (${result.bySeverity.high} high, ${result.bySeverity.medium} medium, ${result.bySeverity.low} low)`);
  }

  return result;
}

/**
 * Strip single-line and multi-line comments from source code
 * to reduce false positives in pattern matching
 */
function stripComments(source) {
  // Remove multi-line comments
  let stripped = source.replace(/\/\*[\s\S]*?\*\//g, (match) => {
    // Preserve line count for accurate line numbers
    return match.replace(/[^\n]/g, " ");
  });
  // Remove single-line comments (but not URLs like https://)
  stripped = stripped.replace(/(?<!:)\/\/.*$/gm, "");
  return stripped;
}

function buildSummary(result) {
  if (result.findings.length === 0) {
    return "No security hotspots detected.";
  }

  const parts = [`${result.findings.length} security finding(s)`];
  if (result.bySeverity.high > 0) parts.push(`${result.bySeverity.high} high severity`);
  if (result.bySeverity.medium > 0) parts.push(`${result.bySeverity.medium} medium severity`);
  if (result.bySeverity.low > 0) parts.push(`${result.bySeverity.low} low severity`);
  parts.push(`across ${result.filesWithFindingsCount} file(s)`);
  return parts.join(" · ");
}
