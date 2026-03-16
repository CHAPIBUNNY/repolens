/**
 * RepoLens Configuration Schema Validator
 * 
 * Schema Version: 1
 * 
 * This validator ensures .repolens.yml files conform to the expected structure.
 * Breaking changes to this schema will require a major version bump.
 */

const CURRENT_SCHEMA_VERSION = 1;
const SUPPORTED_PUBLISHERS = ["notion", "markdown", "confluence", "github_wiki"];
const SUPPORTED_PAGE_KEYS = [
  "system_overview",
  "module_catalog",
  "api_surface",
  "arch_diff",
  "route_map",
  "system_map",
  // New AI-enhanced document types
  "executive_summary",
  "business_domains",
  "architecture_overview",
  "data_flows",
  "change_impact",
  "developer_onboarding"
];

class ValidationError extends Error {
  constructor(message, path) {
    super(message);
    this.name = "ValidationError";
    this.path = path;
  }
}

/**
 * Validate the complete config object
 */
export function validateConfig(config) {
  const errors = [];

  // Check schema version (required for v1.0+)
  if (config.configVersion === undefined || config.configVersion === null) {
    errors.push("Missing required field: configVersion (must be 1)");
  } else if (typeof config.configVersion !== "number") {
    errors.push("configVersion must be a number");
  } else if (config.configVersion > CURRENT_SCHEMA_VERSION) {
    errors.push(
      `Config schema version ${config.configVersion} is not supported. ` +
      `This version of RepoLens supports schema version ${CURRENT_SCHEMA_VERSION}. ` +
      `Please upgrade RepoLens or downgrade your config.`
    );
  }

  // Validate project section
  if (!config.project) {
    errors.push("Missing required section: project");
  } else {
    if (!config.project.name || typeof config.project.name !== "string") {
      errors.push("project.name is required and must be a string");
    }
    if (config.project.docs_title_prefix && typeof config.project.docs_title_prefix !== "string") {
      errors.push("project.docs_title_prefix must be a string");
    }
  }

  // Validate publishers
  if (!config.publishers) {
    errors.push("Missing required section: publishers");
  } else if (!Array.isArray(config.publishers)) {
    errors.push("publishers must be an array");
  } else if (config.publishers.length === 0) {
    errors.push("publishers array cannot be empty");
  } else {
    config.publishers.forEach((pub, idx) => {
      if (typeof pub !== "string" || pub.length === 0) {
        errors.push(`publishers[${idx}]: must be a non-empty string`);
      }
      // Core publishers are validated strictly; plugin publishers are allowed
      // as long as they are strings (validated at plugin load time)
    });
  }

  // Validate plugins (optional)
  if (config.plugins !== undefined) {
    if (!Array.isArray(config.plugins)) {
      errors.push("plugins must be an array");
    } else {
      config.plugins.forEach((p, idx) => {
        if (typeof p !== "string" || p.length === 0) {
          errors.push(`plugins[${idx}]: must be a non-empty string (path or package name)`);
        }
      });
    }
  }

  // Validate scan section
  if (!config.scan) {
    errors.push("Missing required section: scan");
  } else {
    if (!config.scan.include || !Array.isArray(config.scan.include)) {
      errors.push("scan.include is required and must be an array");
    } else if (config.scan.include.length === 0) {
      errors.push("scan.include cannot be empty");
    }

    if (!config.scan.ignore || !Array.isArray(config.scan.ignore)) {
      errors.push("scan.ignore is required and must be an array");
    }
  }

  // Validate module_roots (optional but must be array if present)
  if (config.module_roots !== undefined) {
    if (!Array.isArray(config.module_roots)) {
      errors.push("module_roots must be an array");
    }
  }

  // Validate outputs section
  if (!config.outputs) {
    errors.push("Missing required section: outputs");
  } else {
    if (!config.outputs.pages || !Array.isArray(config.outputs.pages)) {
      errors.push("outputs.pages is required and must be an array");
    } else if (config.outputs.pages.length === 0) {
      errors.push("outputs.pages cannot be empty");
    } else {
      config.outputs.pages.forEach((page, idx) => {
        if (!page.key || typeof page.key !== "string") {
          errors.push(`outputs.pages[${idx}]: missing required field "key"`);
        } else if (!SUPPORTED_PAGE_KEYS.includes(page.key)) {
          errors.push(
            `outputs.pages[${idx}]: "${page.key}" is not a valid page key. ` +
            `Supported: ${SUPPORTED_PAGE_KEYS.join(", ")}`
          );
        }
        
        if (!page.title || typeof page.title !== "string") {
          errors.push(`outputs.pages[${idx}]: missing required field "title"`);
        }
        
        if (page.description && typeof page.description !== "string") {
          errors.push(`outputs.pages[${idx}]: description must be a string`);
        }
      });
    }
  }

  // Validate notion configuration (optional)
  if (config.notion !== undefined) {
    if (typeof config.notion !== "object" || Array.isArray(config.notion)) {
      errors.push("notion must be an object");
    } else {
      // Validate branches filter
      if (config.notion.branches !== undefined) {
        if (!Array.isArray(config.notion.branches)) {
          errors.push("notion.branches must be an array");
        } else {
          config.notion.branches.forEach((branch, idx) => {
            if (typeof branch !== "string") {
              errors.push(`notion.branches[${idx}] must be a string`);
            }
          });
        }
      }

      // Validate includeBranchInTitle
      if (config.notion.includeBranchInTitle !== undefined) {
        if (typeof config.notion.includeBranchInTitle !== "boolean") {
          errors.push("notion.includeBranchInTitle must be a boolean");
        }
      }
    }
  }

  // Validate Confluence configuration (optional)
  if (config.confluence !== undefined) {
    if (typeof config.confluence !== "object" || Array.isArray(config.confluence)) {
      errors.push("confluence must be an object");
    } else {
      // Validate branches filter
      if (config.confluence.branches !== undefined) {
        if (!Array.isArray(config.confluence.branches)) {
          errors.push("confluence.branches must be an array");
        } else {
          config.confluence.branches.forEach((branch, idx) => {
            if (typeof branch !== "string") {
              errors.push(`confluence.branches[${idx}] must be a string`);
            }
          });
        }
      }
    }
  }

  // Validate GitHub Wiki configuration (optional)
  if (config.github_wiki !== undefined) {
    if (typeof config.github_wiki !== "object" || Array.isArray(config.github_wiki)) {
      errors.push("github_wiki must be an object");
    } else {
      if (config.github_wiki.branches !== undefined) {
        if (!Array.isArray(config.github_wiki.branches)) {
          errors.push("github_wiki.branches must be an array");
        } else {
          config.github_wiki.branches.forEach((branch, idx) => {
            if (typeof branch !== "string") {
              errors.push(`github_wiki.branches[${idx}] must be a string`);
            }
          });
        }
      }
      if (config.github_wiki.sidebar !== undefined && typeof config.github_wiki.sidebar !== "boolean") {
        errors.push("github_wiki.sidebar must be a boolean");
      }
      if (config.github_wiki.footer !== undefined && typeof config.github_wiki.footer !== "boolean") {
        errors.push("github_wiki.footer must be a boolean");
      }
    }
  }

  // Validate Discord configuration (optional)
  if (config.discord !== undefined) {
    if (typeof config.discord !== "object" || Array.isArray(config.discord)) {
      errors.push("discord must be an object");
    } else {
      // Validate notifyOn
      if (config.discord.notifyOn !== undefined) {
        const validOptions = ["always", "significant", "never"];
        if (!validOptions.includes(config.discord.notifyOn)) {
          errors.push(`discord.notifyOn must be one of: ${validOptions.join(", ")}`);
        }
      }

      // Validate significantThreshold
      if (config.discord.significantThreshold !== undefined) {
        if (typeof config.discord.significantThreshold !== "number") {
          errors.push("discord.significantThreshold must be a number");
        } else if (config.discord.significantThreshold < 0 || config.discord.significantThreshold > 100) {
          errors.push("discord.significantThreshold must be between 0 and 100");
        }
      }

      // Validate branches filter
      if (config.discord.branches !== undefined) {
        if (!Array.isArray(config.discord.branches)) {
          errors.push("discord.branches must be an array");
        } else {
          config.discord.branches.forEach((branch, idx) => {
            if (typeof branch !== "string") {
              errors.push(`discord.branches[${idx}] must be a string`);
            }
          });
        }
      }

      // Validate enabled flag
      if (config.discord.enabled !== undefined && typeof config.discord.enabled !== "boolean") {
        errors.push("discord.enabled must be a boolean");
      }
    }
  }

  // Validate feature flags (optional)
  if (config.features !== undefined) {
    if (typeof config.features !== "object" || Array.isArray(config.features)) {
      errors.push("features must be an object");
    } else {
      Object.entries(config.features).forEach(([key, value]) => {
        if (typeof value !== "boolean") {
          errors.push(`features.${key} must be a boolean`);
        }
      });
    }
  }

  // Validate AI configuration (optional)
  if (config.ai !== undefined) {
    if (typeof config.ai !== "object" || Array.isArray(config.ai)) {
      errors.push("ai must be an object");
    } else {
      if (config.ai.enabled !== undefined && typeof config.ai.enabled !== "boolean") {
        errors.push("ai.enabled must be a boolean");
      }
      if (config.ai.mode !== undefined && !["hybrid", "full", "off"].includes(config.ai.mode)) {
        errors.push("ai.mode must be one of: hybrid, full, off");
      }
      if (config.ai.temperature !== undefined && typeof config.ai.temperature !== "number") {
        errors.push("ai.temperature must be a number");
      } else if (typeof config.ai.temperature === "number" && (config.ai.temperature < 0 || config.ai.temperature > 2)) {
        errors.push("ai.temperature must be between 0 and 2");
      }
      if (config.ai.max_tokens !== undefined && typeof config.ai.max_tokens !== "number") {
        errors.push("ai.max_tokens must be a number");
      } else if (typeof config.ai.max_tokens === "number" && config.ai.max_tokens <= 0) {
        errors.push("ai.max_tokens must be greater than 0");
      }
    }
  }

  // Validate documentation configuration (optional)
  if (config.documentation !== undefined) {
    if (typeof config.documentation !== "object" || Array.isArray(config.documentation)) {
      errors.push("documentation must be an object");
    } else {
      if (config.documentation.output_dir && typeof config.documentation.output_dir !== "string") {
        errors.push("documentation.output_dir must be a string");
      }
      if (config.documentation.include_artifacts !== undefined && typeof config.documentation.include_artifacts !== "boolean") {
        errors.push("documentation.include_artifacts must be a boolean");
      }
      if (config.documentation.sections !== undefined) {
        if (!Array.isArray(config.documentation.sections)) {
          errors.push("documentation.sections must be an array");
        }
      }
    }
  }

  // Validate domains configuration (optional)
  if (config.domains !== undefined) {
    if (typeof config.domains !== "object" || Array.isArray(config.domains)) {
      errors.push("domains must be an object");
    } else {
      Object.entries(config.domains).forEach(([domainKey, domain]) => {
        if (typeof domain !== "object") {
          errors.push(`domains.${domainKey} must be an object`);
        } else {
          if (!domain.match || !Array.isArray(domain.match)) {
            errors.push(`domains.${domainKey}.match is required and must be an array`);
          }
          if (domain.description && typeof domain.description !== "string") {
            errors.push(`domains.${domainKey}.description must be a string`);
          }
        }
      });
    }
  }

  if (errors.length > 0) {
    const errorMessage = [
      "Invalid .repolens.yml configuration:",
      "",
      ...errors.map(e => `  • ${e}`),
      "",
      "See https://github.com/CHAPIBUNNY/repolens#configuration for documentation."
    ].join("\n");
    
    throw new ValidationError(errorMessage);
  }

  return true;
}

/**
 * Get the schema version this validator supports
 */
export function getSchemaVersion() {
  return CURRENT_SCHEMA_VERSION;
}

/**
 * Check if a feature is enabled (with default fallback)
 */
export function isFeatureEnabled(config, featureName, defaultValue = true) {
  if (!config.features) return defaultValue;
  return config.features[featureName] !== undefined 
    ? config.features[featureName] 
    : defaultValue;
}

// Valid top-level config keys
const VALID_CONFIG_KEYS = [
  "configVersion",
  "project",
  "publishers",
  "scan",
  "module_roots",
  "outputs",
  "notion",
  "confluence",
  "github_wiki",
  "discord",
  "features",
  "ai",
  "documentation",
  "domains",
  "plugins",
];

/**
 * Calculate Levenshtein distance between two strings.
 */
function levenshteinDistance(a, b) {
  const matrix = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }
  
  return matrix[a.length][b.length];
}

/**
 * Find closest matching valid key for a typo.
 * @param {string} typo - The potentially misspelled key
 * @param {string[]} validKeys - Array of valid keys
 * @param {number} maxDistance - Maximum Levenshtein distance to consider (default: 3)
 * @returns {string|null} - Suggestion or null if no close match
 */
function findClosestKey(typo, validKeys, maxDistance = 3) {
  let closest = null;
  let minDist = Infinity;
  
  for (const key of validKeys) {
    const dist = levenshteinDistance(typo.toLowerCase(), key.toLowerCase());
    if (dist < minDist && dist <= maxDistance) {
      minDist = dist;
      closest = key;
    }
  }
  
  return closest;
}

/**
 * Check config for typos in top-level keys.
 * @param {object} config - The parsed config object
 * @returns {Array<{key: string, suggestion: string}>} - List of detected typos with suggestions
 */
export function detectConfigTypos(config) {
  const typos = [];
  
  for (const key of Object.keys(config)) {
    if (!VALID_CONFIG_KEYS.includes(key)) {
      const suggestion = findClosestKey(key, VALID_CONFIG_KEYS);
      if (suggestion) {
        typos.push({ key, suggestion });
      }
    }
  }
  
  return typos;
}

// Export constants for use in doctor
export { SUPPORTED_PUBLISHERS, SUPPORTED_PAGE_KEYS, VALID_CONFIG_KEYS };
