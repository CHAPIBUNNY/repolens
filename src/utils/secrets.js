/**
 * Secrets Detection & Sanitization
 * 
 * Prevents accidental exposure of sensitive information in documentation,
 * logs, and telemetry.
 */

/**
 * Patterns for detecting common secret formats
 */
const SECRET_PATTERNS = [
  // API Keys
  { name: "OpenAI API Key", pattern: /sk-[a-zA-Z0-9]{20,}/, severity: "high" },
  { name: "Anthropic API Key", pattern: /sk-ant-[a-zA-Z0-9_-]{95,}/, severity: "high" },
  { name: "GitHub Token", pattern: /gh[ps]_[a-zA-Z0-9]{36,}/, severity: "critical" },
  { name: "Generic API Key", pattern: /api[_-]?key[_-]?[a-zA-Z0-9]{20,}/i, severity: "high" },
  
  // OAuth Tokens
  { name: "Slack Token", pattern: /xox[baprs]-[a-zA-Z0-9-]{10,}/, severity: "critical" },
  { name: "Bearer Token", pattern: /Bearer\s+[a-zA-Z0-9_-]{20,}/, severity: "high" },
  
  // Cloud Provider Keys
  { name: "AWS Access Key", pattern: /AKIA[0-9A-Z]{16}/, severity: "critical" },
  { name: "Google API Key", pattern: /AIzaSy[a-zA-Z0-9_-]{33}/, severity: "critical" },
  
  // Database Connection Strings
  { name: "MongoDB URI", pattern: /mongodb(\+srv)?:\/\/[^\s]+/, severity: "high" },
  { name: "PostgreSQL URI", pattern: /postgres(ql)?:\/\/[^\s]+/, severity: "high" },
  
  // Generic Secrets
  { name: "Private Key", pattern: /-----BEGIN (RSA|OPENSSH|DSA|EC|PGP) PRIVATE KEY-----/, severity: "critical" },
  { name: "Password in URL", pattern: /[a-zA-Z]{3,10}:\/\/[^:\/]+:[^@\/]+@[^\s]+/, severity: "high" },
  
  // Notion Specific
  { name: "Notion Token", pattern: /secret_[a-zA-Z0-9]{30,}/, severity: "high" },
  { name: "Notion Integration Token", pattern: /ntn_[a-zA-Z0-9]{50,}/, severity: "high" },
];

/**
 * Scan text for potential secrets
 * @param {string} text - Text to scan
 * @returns {Array<{type: string, severity: string, match: string, position: number}>}
 */
export function detectSecrets(text) {
  if (!text || typeof text !== "string") return [];
  
  const findings = [];
  
  for (const { name, pattern, severity } of SECRET_PATTERNS) {
    const matches = text.matchAll(new RegExp(pattern, "g"));
    
    for (const match of matches) {
      findings.push({
        type: name,
        severity,
        match: match[0],
        position: match.index,
        // Redacted version for safe logging
        redacted: redactSecret(match[0]),
      });
    }
  }
  
  return findings;
}

/**
 * Redact a secret for safe display
 * @param {string} secret - Secret to redact
 * @returns {string} Redacted version
 */
function redactSecret(secret) {
  if (secret.length <= 8) {
    return "***";
  }
  
  const visibleChars = 4;
  const start = secret.substring(0, visibleChars);
  const end = secret.substring(secret.length - visibleChars);
  
  return `${start}***${end}`;
}

/**
 * Sanitize text by replacing secrets with redacted versions
 * @param {string} text - Text to sanitize
 * @returns {string} Sanitized text
 */
export function sanitizeSecrets(text) {
  if (!text || typeof text !== "string") return text;
  
  let sanitized = text;
  
  for (const { pattern } of SECRET_PATTERNS) {
    sanitized = sanitized.replace(new RegExp(pattern, "g"), (match) => {
      return redactSecret(match);
    });
  }
  
  return sanitized;
}

/**
 * Check if a string looks like a secret
 * @param {string} value - Value to check
 * @returns {boolean}
 */
export function isLikelySecret(value) {
  if (!value || typeof value !== "string") return false;
  
  // Check against known patterns
  for (const { pattern } of SECRET_PATTERNS) {
    if (pattern.test(value)) {
      return true;
    }
  }
  
  // Heuristic: high entropy strings might be secrets
  const entropy = calculateEntropy(value);
  const hasHighEntropy = entropy > 4.5 && value.length >= 20;
  
  // Heuristic: looks like base64-encoded data
  const isBase64Like = /^[A-Za-z0-9+/]{20,}={0,2}$/.test(value);
  
  return hasHighEntropy || isBase64Like;
}

/**
 * Calculate Shannon entropy of a string
 * @param {string} str - String to analyze
 * @returns {number} Entropy value
 */
function calculateEntropy(str) {
  const freq = {};
  for (const char of str) {
    freq[char] = (freq[char] || 0) + 1;
  }
  
  let entropy = 0;
  const len = str.length;
  
  for (const count of Object.values(freq)) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }
  
  return entropy;
}

/**
 * Validate environment variables don't contain unexpected secrets
 * @param {object} env - Environment variables object
 * @returns {Array<{key: string, issue: string}>}
 */
export function validateEnvironment(env = process.env) {
  const issues = [];
  
  // List of keys that SHOULD contain secrets (expected)
  const expectedSecretKeys = [
    "NOTION_TOKEN",
    "REPOLENS_AI_API_KEY",
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "AZURE_OPENAI_API_KEY",
  ];
  
  // Check each environment variable
  for (const [key, value] of Object.entries(env)) {
    if (!value || typeof value !== "string") continue;
    
    // Skip expected secret keys
    if (expectedSecretKeys.includes(key)) continue;
    
    // Check if value looks like a secret but key doesn't indicate it should be
    if (isLikelySecret(value)) {
      issues.push({
        key,
        issue: `Environment variable "${key}" contains what looks like a secret`,
        severity: "warning",
      });
    }
    
    // Check for secrets in the value
    const findings = detectSecrets(value);
    if (findings.length > 0) {
      issues.push({
        key,
        issue: `Environment variable "${key}" contains detected secret: ${findings[0].type}`,
        severity: findings[0].severity,
        redacted: findings[0].redacted,
      });
    }
  }
  
  return issues;
}

/**
 * Sanitize an object for logging/telemetry
 * Recursively redacts any values that look like secrets
 * @param {any} obj - Object to sanitize
 * @param {number} depth - Current recursion depth
 * @returns {any} Sanitized copy
 */
export function sanitizeObject(obj, depth = 0) {
  if (depth > 10) return "[Max depth exceeded]";
  if (obj === null || obj === undefined) return obj;
  
  // Handle strings
  if (typeof obj === "string") {
    return sanitizeSecrets(obj);
  }
  
  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item, depth + 1));
  }
  
  // Handle objects
  if (typeof obj === "object") {
    const sanitized = {};
    
    for (const [key, value] of Object.entries(obj)) {
      // Known secret keys - always redact
      const secretKeys = ["token", "key", "secret", "password", "auth", "apikey"];
      const isSecretKey = secretKeys.some(sk => key.toLowerCase().includes(sk));
      
      if (isSecretKey && typeof value === "string") {
        sanitized[key] = redactSecret(value);
      } else {
        sanitized[key] = sanitizeObject(value, depth + 1);
      }
    }
    
    return sanitized;
  }
  
  // Return primitives as-is
  return obj;
}
