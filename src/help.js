export function printHelp() {
  console.log(`
RepoLens — Repository Intelligence CLI

Usage:
  repolens <command> [options]

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
  version     Print the current RepoLens version
  help        Show this help message

Options:
  --config <path>   Path to .repolens.yml (auto-discovered if omitted)
  --target <path>   Repository path for init, doctor, migrate, demo, uninstall
  --quick           Scaffold without the wizard (also --non-interactive)
  --dry-run         Preview migration changes without writing them
  --force           Apply migrate or uninstall without a confirmation prompt
  --verbose         Print debug logs and full stacks on unexpected errors
  --version, -v     Print version and exit
  --help, -h        Show this help message

Non-interactive sessions (CI, pipes, or REPOLENS_NON_INTERACTIVE):
  init falls back to --quick instead of waiting on the wizard
  yes/no prompts use their default and do not wait (uninstall defaults to no
    on a closed terminal outside CI; CI still removes files and tells you so)
  feedback exits with code 2 because it needs a terminal

Exit codes:
  0  success (including a cancelled wizard)
  1  runtime error, or an unknown command
  2  invalid flags, missing config, or a failed doctor check

Examples:
  repolens init
  repolens init --quick
  repolens init --target /tmp/my-repo
  repolens doctor --target /tmp/my-repo
  repolens migrate --dry-run
  repolens publish
  repolens publish --config /path/.repolens.yml
  repolens demo
  repolens watch
  repolens uninstall --target /tmp/my-repo
  repolens mcp
  repolens --version
`);
}
