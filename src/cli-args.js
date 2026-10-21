const FLAGS_WITH_VALUE = new Set([
  "--config",
  "--target",
  "--format",
  "--out",
  "--base",
  "--head",
  "--url",
  "--link",
  "--label",
]);
const BOOLEAN_FLAGS = new Set([
  "--quick",
  "--non-interactive",
  "--dry-run",
  "--force",
  "--strict",
  "--verbose",
  "--help",
  "-h",
  "--version",
  "-v",
]);

/**
 * Parse RepoLens argv (already sliced past node and the script path).
 * Global options may appear before or after the command.
 */
export function parseCliArgs(argv) {
  const flags = {};
  const positionals = [];
  const errors = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--") {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (arg.startsWith("-")) {
      if (FLAGS_WITH_VALUE.has(arg)) {
        const value = argv[i + 1];
        if (value == null || value.startsWith("-")) {
          errors.push(`${arg} requires a value`);
        } else {
          flags[arg] = value;
          i += 1;
        }
      } else if (BOOLEAN_FLAGS.has(arg)) {
        flags[arg] = true;
      } else {
        errors.push(`Unknown option: ${arg}`);
      }
    } else {
      positionals.push(arg);
    }
  }

  if (positionals.length > 1) {
    errors.push(`Unexpected argument: ${positionals.slice(1).join(" ")}`);
  }

  const command = positionals[0];
  return {
    command,
    flags,
    errors,
    help: Boolean(flags["--help"] || flags["-h"] || command === "help"),
    version: Boolean(flags["--version"] || flags["-v"] || command === "version"),
  };
}
