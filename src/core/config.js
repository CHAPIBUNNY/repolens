import fs from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import { validateConfig } from "./config-schema.js";

export async function loadConfig(configPath) {
  const absoluteConfigPath = path.resolve(configPath);
  const raw = await fs.readFile(absoluteConfigPath, "utf8");
  const cfg = yaml.load(raw);

  // Validate config against schema
  validateConfig(cfg);

  cfg.__configPath = absoluteConfigPath;
  cfg.__repoRoot = path.dirname(absoluteConfigPath);

  return cfg;
}