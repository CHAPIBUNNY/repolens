/**
 * RepoLens Configuration Schema Validator
 * 
 * Schema Version: 1
 * 
 * This validator ensures .repolens.yml files conform to the expected structure.
 * Breaking changes to this schema will require a major version bump.
 */

const CURRENT_SCHEMA_VERSION = 1;
const SUPPORTED_PUBLISHERS = ["notion", "markdown"];
const SUPPORTED_PAGE_KEYS = [
  "system_overview",
  "module_catalog",
  "api_surface",
  "arch_diff",
  "route_map",
  "system_map"
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
