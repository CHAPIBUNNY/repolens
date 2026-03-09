import fs from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import { validateConfig as validateSchema } from "./config-schema.js";
import { validateConfig } from "../utils/validate.js";
import { warn, error } from "../utils/logger.js";

export async function loadConfig(configPath) {
  const absoluteConfigPath = path.resolve(configPath);
  const raw = await fs.readFile(absoluteConfigPath, "utf8");
  const cfg = yaml.load(raw);

  // Validate config against schema (structure)
  validateSchema(cfg);
  
  // Validate config for security (injection, secrets, etc.)
  const securityResult = validateConfig(cfg);
  
  // Log warnings
  if (securityResult.warnings.length > 0) {
    securityResult.warnings.forEach(w => warn(`Config warning: ${w}`));
  }
  
  // Throw error if invalid
  if (!securityResult.valid) {
    error("Configuration validation failed:");
    securityResult.errors.forEach(e => error(`  - ${e}`));
    throw new Error(`Invalid configuration: ${securityResult.errors.join(", ")}`);
  }

  cfg.__configPath = absoluteConfigPath;
  cfg.__repoRoot = path.dirname(absoluteConfigPath);

  return cfg;
}