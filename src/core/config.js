import fs from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";

export async function loadConfig(configPath) {
  const absoluteConfigPath = path.resolve(configPath);
  const raw = await fs.readFile(absoluteConfigPath, "utf8");
  const cfg = yaml.load(raw);

  if (!cfg?.project?.name) {
    throw new Error("Invalid .repolens.yml: missing project.name");
  }

  if (!cfg?.scan?.include || !Array.isArray(cfg.scan.include)) {
    throw new Error("Invalid .repolens.yml: missing scan.include");
  }

  if (!cfg?.scan?.ignore || !Array.isArray(cfg.scan.ignore)) {
    throw new Error("Invalid .repolens.yml: missing scan.ignore");
  }

  if (!cfg?.outputs?.pages || !Array.isArray(cfg.outputs.pages)) {
    throw new Error("Invalid .repolens.yml: missing outputs.pages");
  }

  cfg.__configPath = absoluteConfigPath;
  cfg.__repoRoot = path.dirname(absoluteConfigPath);

  return cfg;
}