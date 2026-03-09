/**
 * Configuration Validation & Security
 * 
 * Validates .repolens.yml configuration against schema and security best practices.
 * Prevents injection attacks, validates types, and enforces constraints.
 */

import { detectSecrets } from "./secrets.js";

/**
 * Validate configuration object against schema
 * @param {object} config - Configuration to validate
 * @returns {{valid: boolean, errors: Array<string>, warnings: Array<string>}}
 */
export function validateConfig(config) {
  const errors = [];
  const warnings = [];
  
  // Required: configVersion
  if (!config.configVersion) {
    errors.push("Missing required field: configVersion");
  } else if (config.configVersion !== 1) {
    errors.push(`Unsupported configVersion: ${config.configVersion}. Expected: 1`);
  }
  
  // Validate scan configuration
  if (config.scan) {
    const scanErrors = validateScanConfig(config.scan);
    errors.push(...scanErrors);
  } else {
    warnings.push("No scan configuration found. Using defaults.");
  }
  
  // Validate publishers
  if (!config.publishers || Object.keys(config.publishers).length === 0) {
    warnings.push("No publishers configured. Documentation will not be published.");
  } else {
    const publisherErrors = validatePublishers(config.publishers);
    errors.push(...publisherErrors);
  }
  
  // Validate notion configuration
  if (config.notion) {
    const notionErrors = validateNotionConfig(config.notion);
    errors.push(...notionErrors);
    
    const notionWarnings = checkNotionWarnings(config.notion);
    warnings.push(...notionWarnings);
  }
  
  // Validate domains (if present)
  if (config.domains) {
    const domainErrors = validateDomains(config.domains);
    errors.push(...domainErrors);
  }
  
  // Check for secrets in config
  const secretFindings = scanConfigForSecrets(config);
  if (secretFindings.length > 0) {
    for (const finding of secretFindings) {
      errors.push(`SECRET DETECTED in config: ${finding.type} at ${finding.path}`);
    }
  }
  
  // Validate against injection attacks
  const injectionIssues = checkForInjection(config);
  errors.push(...injectionIssues);
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate scan configuration
 */
function validateScanConfig(scan) {
  const errors = [];
  
  if (scan.include) {
    if (!Array.isArray(scan.include)) {
      errors.push("scan.include must be an array of glob patterns");
    } else {
      // Validate each pattern
      for (const pattern of scan.include) {
        if (typeof pattern !== "string") {
          errors.push(`Invalid pattern in scan.include: ${pattern} (must be string)`);
          continue; // Skip further checks if not a string
        }
        
        // Check for dangerous patterns
        if (pattern.includes("..")) {
          errors.push(`Dangerous pattern in scan.include: ${pattern} (contains "..")`);
        }
        
        // Warn about overly broad patterns
        if (pattern === "**" || pattern === "**/*") {
          errors.push(`Overly broad pattern: ${pattern}. This may cause performance issues.`);
        }
      }
    }
  }
  
  if (scan.exclude) {
    if (!Array.isArray(scan.exclude)) {
      errors.push("scan.exclude must be an array of glob patterns");
    } else {
      for (const pattern of scan.exclude) {
        if (typeof pattern !== "string") {
          errors.push(`Invalid pattern in scan.exclude: ${pattern} (must be string)`);
          continue; // Skip further checks if not a string
        }
      }
    }
  }
  
  // Validate root if present
  if (scan.root && typeof scan.root !== "string") {
    errors.push("scan.root must be a string");
  }
  
  return errors;
}

/**
 * Validate publishers configuration
 */
function validatePublishers(publishers) {
  const errors = [];
  
  if (!Array.isArray(publishers) && typeof publishers !== "object") {
    errors.push("publishers must be an array or object");
    return errors;
  }
  
  const validPublishers = ["notion", "markdown"];
  
  if (Array.isArray(publishers)) {
    for (const pub of publishers) {
      if (!validPublishers.includes(pub)) {
        errors.push(`Unknown publisher: ${pub}. Valid: ${validPublishers.join(", ")}`);
      }
    }
  } else {
    for (const [key, value] of Object.entries(publishers)) {
      if (!validPublishers.includes(key)) {
        errors.push(`Unknown publisher: ${key}. Valid: ${validPublishers.join(", ")}`);
      }
      
      // Validate publisher config
      if (typeof value !== "object" && typeof value !== "boolean") {
        errors.push(`Invalid config for publisher ${key}`);
      }
    }
  }
  
  return errors;
}

/**
 * Validate Notion configuration
 */
function validateNotionConfig(notion) {
  const errors = [];
  
  if (notion.workspaceId && typeof notion.workspaceId !== "string") {
    errors.push("notion.workspaceId must be a string");
  }
  
  if (notion.branches) {
    if (!Array.isArray(notion.branches)) {
      errors.push("notion.branches must be an array");
    } else {
      for (const branch of notion.branches) {
        if (typeof branch !== "string") {
          errors.push(`Invalid branch name: ${branch} (must be string)`);
        }
        
        // Check for dangerous branch names
        if (branch.includes("..") || branch.includes("/")) {
          errors.push(`Invalid branch name: ${branch} (contains dangerous characters)`);
        }
      }
    }
  }
  
  return errors;
}

/**
 * Check for Notion configuration warnings
 */
function checkNotionWarnings(notion) {
  const warnings = [];
  
  if (!notion.branches || notion.branches.length === 0) {
    warnings.push("notion.branches not configured. All branches will publish to Notion (may cause conflicts).");
  }
  
  if (!notion.workspaceId) {
    warnings.push("notion.workspaceId not set. Will use environment variable NOTION_WORKSPACE_ID.");
  }
  
  return warnings;
}

/**
 * Validate domains configuration
 */
function validateDomains(domains) {
  const errors = [];
  
  if (!Array.isArray(domains)) {
    errors.push("domains must be an array");
    return errors;
  }
  
  for (const domain of domains) {
    if (!domain.name || typeof domain.name !== "string") {
      errors.push("Each domain must have a 'name' field (string)");
    }
    
    if (!domain.patterns || !Array.isArray(domain.patterns)) {
      errors.push(`Domain '${domain.name}' must have 'patterns' array`);
    } else {
      for (const pattern of domain.patterns) {
        if (typeof pattern !== "string") {
          errors.push(`Invalid pattern in domain '${domain.name}': ${pattern}`);
        }
      }
    }
    
    if (domain.description && typeof domain.description !== "string") {
      errors.push(`Domain '${domain.name}' description must be a string`);
    }
  }
  
  return errors;
}

/**
 * Scan configuration for accidentally included secrets
 */
function scanConfigForSecrets(config, path = "root", depth = 0) {
  const findings = [];
  
  // Prevent infinite recursion
  if (depth > 20) {
    return findings;
  }
  
  if (typeof config === "string") {
    const secrets = detectSecrets(config);
    for (const secret of secrets) {
      findings.push({
        ...secret,
        path,
      });
    }
  } else if (Array.isArray(config)) {
    config.forEach((item, index) => {
      findings.push(...scanConfigForSecrets(item, `${path}[${index}]`, depth + 1));
    });
  } else if (typeof config === "object" && config !== null) {
    // Detect circular references by checking if we've seen this object before
    try {
      for (const [key, value] of Object.entries(config)) {
        findings.push(...scanConfigForSecrets(value, `${path}.${key}`, depth + 1));
      }
    } catch (e) {
      // Handle circular references or maximum call stack
      return findings;
    }
  }
  
  return findings;
}

/**
 * Check for potential injection attacks in config
 */
function checkForInjection(config) {
  const errors = [];
  
  // Check for shell injection in patterns
  const dangerousChars = [";", "|", "&", "`", "$", "(", ")", "<", ">"];
  
  function checkString(str, context) {
    if (typeof str !== "string" || !str) return;
    
    for (const char of dangerousChars) {
      if (str.includes(char)) {
        errors.push(`Potentially dangerous character '${char}' found in ${context}: "${str}"`);
      }
    }
    
    // Check for command substitution
    if (str.includes("$(") || str.includes("${")) {
      errors.push(`Command substitution detected in ${context}: "${str}"`);
    }
  }
  
  // Check scan patterns
  if (config.scan?.include && Array.isArray(config.scan.include)) {
    config.scan.include.forEach((pattern, i) => {
      if (typeof pattern === "string") {
        checkString(pattern, `scan.include[${i}]`);
      }
    });
  }
  
  if (config.scan?.exclude && Array.isArray(config.scan.exclude)) {
    config.scan.exclude.forEach((pattern, i) => {
      if (typeof pattern === "string") {
        checkString(pattern, `scan.exclude[${i}]`);
      }
    });
  }
  
  // Check domain patterns
  if (config.domains && Array.isArray(config.domains)) {
    config.domains.forEach((domain, i) => {
      if (domain.patterns && Array.isArray(domain.patterns)) {
        domain.patterns.forEach((pattern, j) => {
          if (typeof pattern === "string") {
            checkString(pattern, `domains[${i}].patterns[${j}]`);
          }
        });
      }
    });
  }
  
  return errors;
}

/**
 * Sanitize configuration for safe logging
 * Removes or redacts sensitive fields
 */
export function sanitizeConfigForLogging(config) {
  const sanitized = JSON.parse(JSON.stringify(config));
  
  // Redact sensitive fields
  if (sanitized.notion?.workspaceId) {
    const id = sanitized.notion.workspaceId;
    sanitized.notion.workspaceId = id.substring(0, 4) + "***" + id.substring(id.length - 4);
  }
  
  // Remove any tokens
  delete sanitized.notion?.token;
  delete sanitized.ai?.apiKey;
  
  return sanitized;
}

/**
 * Validate file path is safe (no directory traversal)
 */
export function validateSafePath(filePath) {
  if (typeof filePath !== "string") {
    return { valid: false, error: "File path must be a string" };
  }
  
  // Check for directory traversal
  if (filePath.includes("..")) {
    return { valid: false, error: "Directory traversal not allowed" };
  }
  
  // Check for absolute paths (should use relative)
  if (filePath.startsWith("/") || /^[a-zA-Z]:/.test(filePath)) {
    return { valid: false, error: "Absolute paths not allowed in configuration" };
  }
  
  // Check for null bytes
  if (filePath.includes("\0")) {
    return { valid: false, error: "Null bytes not allowed in file paths" };
  }
  
  return { valid: true };
}
