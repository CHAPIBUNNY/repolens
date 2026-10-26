import { CORE_SCHEMA, load, mergeTag } from "js-yaml";

const MAX_YAML_CHARS = 1_000_000;
const MAX_YAML_ALIASES = 2000;

/**
 * Parse YAML without executing custom tags.
 * js-yaml 5 `load` uses the YAML 1.2 Core schema (`true`/`false` are booleans;
 * the YAML 1.1 spellings `yes` and `no` stay strings). The merge key (`<<`)
 * is added back so configs that relied on js-yaml 4's merge still parse.
 * A size cap and `maxAliases` stop a billion-laughs document.
 * An empty file returns `undefined`, matching the previous loader.
 */
export function loadYaml(raw) {
  if (typeof raw !== "string") {
    throw new Error("YAML input must be a string");
  }
  if (raw.length > MAX_YAML_CHARS) {
    throw new Error(`YAML document exceeds ${MAX_YAML_CHARS} characters`);
  }
  if (raw.trim() === "") return undefined;

  const aliasUses = raw.match(/(^|[\s\[\{,])\*[A-Za-z_][\w-]*/g);
  if (aliasUses && aliasUses.length > MAX_YAML_ALIASES) {
    throw new Error(`YAML document has too many aliases (${aliasUses.length})`);
  }

  return load(raw, {
    schema: CORE_SCHEMA.withTags(mergeTag),
    maxAliases: MAX_YAML_ALIASES,
  });
}
