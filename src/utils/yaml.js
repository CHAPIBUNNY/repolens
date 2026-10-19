import yaml from "js-yaml";

const MAX_YAML_CHARS = 1_000_000;
const MAX_YAML_ALIASES = 2000;

/**
 * Parse YAML without executing custom tags.
 * js-yaml 4 `load` is already safe (no JS types). This adds a size cap and
 * an alias cap so a config cannot expand into a billion-laughs document.
 * The js-yaml 4 default schema is unchanged (`true`/`false` are booleans;
 * the YAML 1.1 spellings `yes` and `no` stay strings).
 */
export function loadYaml(raw) {
  if (typeof raw !== "string") {
    throw new Error("YAML input must be a string");
  }
  if (raw.length > MAX_YAML_CHARS) {
    throw new Error(`YAML document exceeds ${MAX_YAML_CHARS} characters`);
  }

  const aliasUses = raw.match(/(^|[\s\[\{,])\*[A-Za-z_][\w-]*/g);
  if (aliasUses && aliasUses.length > MAX_YAML_ALIASES) {
    throw new Error(`YAML document has too many aliases (${aliasUses.length})`);
  }

  return yaml.load(raw);
}
