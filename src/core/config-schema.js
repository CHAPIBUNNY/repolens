/**
 * RepoLens Configuration Schema Validator
 * 
 * Schema Version: 1
 * 
 * This validator ensures .repolens.yml files conform to the expected structure.
 * Breaking changes to this schema will require a major version bump.
 */

const CURRENT_SCHEMA_VERSION = 1;
const SUPPORTED_PUBLISHERS = ["notion", "markdown", "confluence"];
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

  // Check schema version
  if (config.configVersion !== undefined) {
    if (typeof config.configVersion !== "number") {
      errors.push("configVersion must be a number");
    } else if (config.configVersion > CURRENT_SCHEMA_VERSION) {
      errors.push(
        `Config schema version ${config.configVersion} is not supported. ` +
        `This version of RepoLens supports schema version ${CURRENT_SCHEMA_VERSION}. ` +
        `Please upgrade RepoLens or downgrade your config.`
      );
    }
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
      if (!SUPPORTED_PUBLISHERS.includes(pub)) {
        errors.push(
          `publishers[${idx}]: "${pub}" is not a valid publisher. ` +
          `Supported: ${SUPPORTED_PUBLISHERS.join(", ")}`
        );
      }
    });
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

  // Validate dashboard configuration (optional)
  if (config.dashboard !== undefined) {
    if (typeof config.dashboard !== "object" || Array.isArray(config.dashboard)) {
      errors.push("dashboard must be an object");
    } else {
      // Validate enabled flag
      if (config.dashboard.enabled !== undefined && typeof config.dashboard.enabled !== "boolean") {
        errors.push("dashboard.enabled must be a boolean");
      }

      // Validate githubPages flag
      if (config.dashboard.githubPages !== undefined && typeof config.dashboard.githubPages !== "boolean") {
        errors.push("dashboard.githubPages must be a boolean");
      }

      // Validate staleThreshold
      if (config.dashboard.staleThreshold !== undefined) {
        if (typeof config.dashboard.staleThreshold !== "number") {
          errors.push("dashboard.staleThreshold must be a number");
        } else if (config.dashboard.staleThreshold < 1) {
          errors.push("dashboard.staleThreshold must be at least 1");
        }
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
      }
      if (config.ai.max_tokens !== undefined && typeof config.ai.max_tokens !== "number") {
        errors.push("ai.max_tokens must be a number");
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
