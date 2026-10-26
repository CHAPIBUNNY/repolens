const EXIT_CODES = `Exit codes:
  0  success (including a cancelled wizard, or help with no other work)
  1  runtime error, or an unknown command
  2  invalid flags, missing config, target directory not found,
     a failed doctor check (including 0 files matched),
     demo or publish scanned 0 files, watch has nothing to watch
     (missing module_roots, or scan.include matches no files),
     badge scored 0 source files,
     comment is missing a base or head ref,
     publish --strict is missing publisher credentials,
     app is missing its id, webhook secret, or private key,
     or feedback has no terminal`;

const COMMAND_HELP = {
  init: `
RepoLens init — scaffold RepoLens files

Usage:
  repolens init [--target <path>] [--quick]

Options:
  --target <path>       Repository to scaffold (default: current directory)
  --quick               Skip the wizard. Markdown publisher only.
                        Detects the repo language and writes matching globs.
  --non-interactive     Same as --quick
  --verbose             Print debug logs
  --help, -h            Show this help

\`repolens init\` opens the wizard, which can add Notion, Confluence, GitHub
Wiki, and Obsidian. \`repolens init --quick\` writes a Markdown-only config.
It detects Python, Go, Rust, Java/Kotlin, JavaScript/TypeScript, Ruby, PHP,
C#, Swift, and C/C++ (and combinations) and sets scan.include plus
module_roots from the files it finds. A repository with no recognized
language gets multi-language globs, not JavaScript-only defaults.

The target directory must already exist.

${EXIT_CODES}

Examples:
  repolens init
  repolens init --quick
  repolens init --target /path/to/repo --quick
`,

  doctor: `
RepoLens doctor — validate a RepoLens setup

Usage:
  repolens doctor [--target <path>]

Options:
  --target <path>       Repository to validate (default: current directory)
  --verbose             Print debug logs
  --help, -h            Show this help

Checks .repolens.yml, the GitHub workflow, publishers, scan.include,
module_roots, and outputs.pages. A scan that matches 0 files is a blocking
failure: publish and demo would otherwise write empty docs.

The target directory must already exist.

${EXIT_CODES}

Examples:
  repolens doctor
  repolens doctor --target /path/to/repo
`,

  migrate: `
RepoLens migrate — upgrade workflow files

Usage:
  repolens migrate [--target <path>] [--dry-run] [--force]

Options:
  --target <path>       Repository to migrate (default: current directory)
  --dry-run             Preview changes without writing them
  --force               Apply changes without a confirmation prompt
  --verbose             Print debug logs
  --help, -h            Show this help

The target directory must already exist.

${EXIT_CODES}

Examples:
  repolens migrate --dry-run
  repolens migrate --force
  repolens migrate --target /path/to/repo
`,

  publish: `
RepoLens publish — scan, render, and publish documentation

Usage:
  repolens publish [--config <path>] [--strict]

Options:
  --config <path>       Path to .repolens.yml (auto-discovered if omitted)
  --strict              Exit 2 when a configured publisher is missing
                        credentials (Notion, Confluence, GitHub Wiki) or
                        obsidian.vault. Markdown needs no credentials.
  --verbose             Print debug logs
  --help, -h            Show this help

Without --strict, a publisher with missing credentials is skipped.
A scan that matches 0 files exits 2 and does not write empty docs.
\`publish\` does not accept --dry-run.

${EXIT_CODES}

Examples:
  repolens publish
  repolens publish --config /path/.repolens.yml
  repolens publish --strict
`,

  demo: `
RepoLens demo — local preview without API keys

Usage:
  repolens demo [--target <path>] [--config <path>]

Options:
  --target <path>       Repository to preview (default: current directory)
  --config <path>       Path to .repolens.yml (discovered from --target)
  --verbose             Print debug logs
  --help, -h            Show this help

With no config, demo detects the repository language and scans matching
files (Python, Go, Rust, Java, JavaScript, and others). It does not publish
to Notion or Confluence. A scan that matches 0 files exits 2 and does not
write empty docs.

The target directory must already exist.

${EXIT_CODES}

Examples:
  repolens demo
  repolens demo --target /path/to/repo
`,

  watch: `
RepoLens watch — regenerate Markdown when files change

Usage:
  repolens watch [--config <path>]

Options:
  --config <path>       Path to .repolens.yml (auto-discovered if omitted)
  --verbose             Print debug logs
  --help, -h            Show this help

Watches directories listed in module_roots and regenerates Markdown when
files change. Exits 2 when none of those directories exist, and when
scan.include matches no files (including after init --quick in an empty
directory). It does not wait for changes in that case. Press Ctrl+C to stop
when a watch is running.

${EXIT_CODES}

Examples:
  repolens watch
  repolens watch --config /path/.repolens.yml
`,

  uninstall: `
RepoLens uninstall — remove RepoLens-generated files

Usage:
  repolens uninstall [--target <path>] [--force]

Options:
  --target <path>       Repository to clean (default: current directory)
  --force               Remove files without a confirmation prompt
  --verbose             Print debug logs
  --help, -h            Show this help

Removes .repolens/, .repolens.yml, .github/workflows/repolens.yml,
.env.example, and README.repolens.md when those files are present.
Outside CI, a closed terminal defaults to keeping the files.
The target directory must already exist.

${EXIT_CODES}

Examples:
  repolens uninstall --target /path/to/repo
  repolens uninstall --force
`,

  feedback: `
RepoLens feedback — send feedback to the RepoLens team

Usage:
  repolens feedback

Options:
  --verbose             Print debug logs
  --help, -h            Show this help

Needs an interactive terminal. CI, pipes, and REPOLENS_NON_INTERACTIVE
exit 2.

${EXIT_CODES}

Examples:
  repolens feedback
`,

  mcp: `
RepoLens mcp — stdio MCP server

Usage:
  repolens mcp

Options:
  --help, -h            Show this help

Starts the Model Context Protocol server on stdio. \`repolens-mcp\` is the
same server. Logs go to stderr. The workspace is REPOLENS_WORKSPACE or the
current directory. Paths cannot leave that directory.

${EXIT_CODES}

Examples:
  repolens mcp
`,

  badge: `
RepoLens badge — shields.io code-health badge

Usage:
  repolens badge [--target <path>] [--format json|svg|markdown|all]
                 [--out <path>] [--url <url>] [--link <url>] [--label <text>]

Options:
  --target <path>       Repository to score (default: current directory)
  --format <kind>       json (default), svg, markdown, or all
  --out <path>          Write the badge file instead of stdout
  --url <url>           Public HTTPS URL of the JSON file (markdown snippet)
  --link <url>          Page the badge links to
  --label <text>        shields.io label (default: code health)
  --help, -h            Show this help

Prints a shields.io endpoint JSON document for the code-health score.
\`--format svg\` prints a square SVG (no rounded corners). \`--format all\`
writes JSON and SVG and prints a markdown snippet. shields.io fetches the
JSON URL, so host the file on GitHub Pages or another public HTTPS URL.
Exit 2 when no JavaScript, TypeScript, Python, or Go source files are scored.
This command does not publish to npm and does not call an AI provider.

${EXIT_CODES}

Examples:
  repolens badge
  repolens badge --format svg --out repolens-badge.svg
  repolens badge --format markdown --url https://user.github.io/repo/repolens-badge.json --link https://user.github.io/repo/
`,

  comment: `
RepoLens comment — architecture diff for a pull request

Usage:
  repolens comment [--target <path>] [--base <ref>] [--head <ref>]

Options:
  --target <path>       Repository to compare (default: current directory)
  --base <ref>          Base commit or ref
  --head <ref>          Head commit or ref
  --help, -h            Show this help

Compares base and head: files, modules, dependencies, the code-health
delta, and hotspots that are new on head. On pull_request, with
GITHUB_TOKEN and GITHUB_REPOSITORY set, it creates or updates one sticky
comment (HTML marker, edited in place). Fork pull requests skip the
comment and append the same markdown to the GitHub job summary.
Without a token, the markdown is printed. Both commits must be present
(\`fetch-depth: 0\` in Actions). Needs pull-requests: write, not a PAT.

${EXIT_CODES}

Examples:
  repolens comment --base origin/main --head HEAD
`,

  app: `
RepoLens app — self-host the GitHub App webhook

Usage:
  repolens app [--port <n>] [--host <address>] [--webhook-path <path>]
  repolens app --manifest

Options:
  --port <n>            Listen port (default 8787, or REPOLENS_APP_PORT)
  --host <address>      Listen address (default 127.0.0.1, or REPOLENS_APP_HOST)
  --webhook-path <path> Path GitHub posts to (default /api/github/webhooks)
  --manifest            Print the GitHub App manifest JSON and exit
  --help, -h            Show this help

Verifies X-Hub-Signature-256, acknowledges installation events, and on
pull_request opened, synchronize, reopened, and ready_for_review runs the
architecture diff. It posts a Check Run named RepoLens and updates the
sticky pull request comment. The check is informational: a completed diff
is success, and a failed analysis is a failed check.

\`--manifest\` needs no credentials. Running the server needs
REPOLENS_APP_ID, REPOLENS_WEBHOOK_SECRET, and either
REPOLENS_APP_PRIVATE_KEY or REPOLENS_APP_PRIVATE_KEY_PATH.
Replace hook_attributes.url in the manifest before you register the app.
This command does not register an app on GitHub.

GitHub allows about 10 seconds for the HTTP response. The server answers
202 and posts the check after the analysis finishes.

${EXIT_CODES}

Examples:
  repolens app --manifest
  repolens app --port 8787
`,
};

const GLOBAL_HELP = `
RepoLens — Repository Intelligence CLI

Usage:
  repolens <command> [options]

Run \`repolens <command> --help\` for that command's flags.
With no command, RepoLens prints this help and does not publish.

Commands:
  init        Scaffold RepoLens files in your repository
  doctor      Validate your RepoLens setup
  migrate     Upgrade workflow files to current format
  publish     Scan, render, and publish documentation
  demo        Generate local docs without API keys (quick preview)
  watch       Watch for file changes and regenerate docs
  uninstall   Remove RepoLens-generated files from a repository
  feedback    Send feedback to the RepoLens team
  mcp         Start the stdio MCP server (also available as repolens-mcp)
  badge       Print a shields.io code-health badge (JSON, SVG, or markdown)
  comment     Print or post an architecture diff for a pull request
  app         Self-host the GitHub App webhook (check run and PR comment)
  version     Print the current RepoLens version
  help        Show this help message

Options:
  --config <path>   Path to .repolens.yml (auto-discovered if omitted)
  --target <path>   Repository path for init, doctor, migrate, demo, uninstall,
                    badge, and comment. Must already exist.
  --format <kind>   badge: json (default), svg, markdown, or all
  --out <path>      badge: write JSON/SVG to this file instead of stdout
  --url <url>       badge: public URL of the JSON file, embedded in the markdown
  --link <url>      badge: page the badge links to
  --label <text>    badge: shields.io label (default: code health)
  --base <ref>      comment: base commit or ref
  --head <ref>      comment: head commit or ref
  --port <n>        app: listen port (default 8787)
  --host <address>  app: listen address (default 127.0.0.1)
  --webhook-path    app: webhook path (default /api/github/webhooks)
  --manifest        app: print the GitHub App manifest JSON and exit
  --quick           Scaffold without the wizard (also --non-interactive).
                    Markdown only; globs follow the detected language.
  --strict          publish: exit 2 when publisher credentials are missing
  --dry-run         Preview migration changes without writing them
  --force           Apply migrate or uninstall without a confirmation prompt
  --verbose         Print debug logs and full stacks on unexpected errors
  --version, -v     Print version and exit
  --help, -h        Show help. After a command, show that command's help.

Non-interactive sessions (CI, pipes, or REPOLENS_NON_INTERACTIVE):
  init falls back to --quick instead of waiting on the wizard
  yes/no prompts use their default and do not wait (uninstall defaults to no
    on a closed terminal outside CI; CI still removes files and tells you so)
  feedback exits with code 2 because it needs a terminal
  the ASCII banner is hidden when stdout is not a terminal or CI is set

${EXIT_CODES}

Examples:
  repolens
  repolens init
  repolens init --quick
  repolens init --help
  repolens init --target /tmp/my-repo
  repolens doctor --target /tmp/my-repo
  repolens migrate --dry-run
  repolens publish
  repolens publish --strict
  repolens publish --config /path/.repolens.yml
  repolens demo
  repolens watch
  repolens uninstall --target /tmp/my-repo
  repolens mcp
  repolens badge
  repolens badge --format markdown --url https://example.github.io/repo/repolens-badge.json
  repolens comment --base origin/main --head HEAD
  repolens app --manifest
  repolens app --port 8787
  repolens --version
`;

const KNOWN_COMMANDS = new Set([...Object.keys(COMMAND_HELP), "version", "help"]);

export function printHelp(command) {
  if (command && COMMAND_HELP[command]) {
    console.log(COMMAND_HELP[command]);
    return;
  }
  if (command && !KNOWN_COMMANDS.has(command)) {
    console.log(`Unknown command: ${command}`);
    console.log("Run 'repolens help' for the command list.\n");
  }
  console.log(GLOBAL_HELP);
}
