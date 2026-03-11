# RepoLens v1.0 Stability Contract

This document defines the **public API surface** of RepoLens v1.0. All interfaces described here are considered stable and will not change in backwards-incompatible ways until v2.0.

## Semantic Versioning

RepoLens follows semantic versioning (semver):

- **MAJOR** (2.0, 3.0, ...): Breaking changes to CLI, config schema, or plugin interface
- **MINOR** (1.1, 1.2, ...): New features, new commands, new config fields (backwards-compatible)
- **PATCH** (1.0.1, 1.0.2, ...): Bug fixes, documentation, performance improvements

## CLI Interface

### Commands

| Command | Status | Description |
|---------|--------|-------------|
| `init` | Stable | Scaffold configuration and GitHub Actions workflow |
| `init --interactive` | Stable | Step-by-step configuration wizard |
| `doctor` | Stable | Validate repository setup |
| `publish` | Stable | Scan, generate, and publish documentation |
| `watch` | Stable | Watch for file changes and regenerate docs |
| `migrate` | Stable | Migrate legacy workflows to current format |
| `feedback` | Stable | Send feedback to the RepoLens team |
| `version` | Stable | Display version |
| `help` | Stable | Show usage information |

### Global Options

| Option | Short | Status | Description |
|--------|-------|--------|-------------|
| `--config <path>` | — | Stable | Path to `.repolens.yml` |
| `--target <path>` | — | Stable | Target repository path (init, doctor, migrate) |
| `--interactive` | — | Stable | Interactive mode for init |
| `--dry-run` | — | Stable | Preview changes without applying (migrate) |
| `--force` | — | Stable | Skip confirmation prompts (migrate) |
| `--verbose` | — | Stable | Enable verbose logging |
| `--version` | `-v` | Stable | Print version |
| `--help` | `-h` | Stable | Show help |

### Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Runtime error (scan failure, publish failure, etc.) |
| `2` | Validation error (invalid config, missing files, etc.) |

Unknown commands produce exit code `1`. Unknown flags produce exit code `1`.

## Configuration Schema

### Schema Version

The config schema is locked at **version 1** (`configVersion: 1`). This field is **required**.

Future schema changes:
- **Additive** (new optional fields): Minor version bump, no `configVersion` change
- **Breaking** (field rename, type change, removal): Major version bump, `configVersion` increment

### Required Fields

```yaml
configVersion: 1          # number, must be 1

project:
  name: "My Project"      # string, required

publishers:               # string[], required, non-empty
  - markdown

scan:
  include:                # string[], required, non-empty
    - "src/**/*.{js,ts}"
  ignore:                 # string[], required
    - "node_modules"

outputs:
  pages:                  # object[], required, non-empty
    - key: system_overview  # must be a supported page key
      title: "System Overview"
```

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `project.docs_title_prefix` | string | Prefix for document titles |
| `plugins` | string[] | Plugin paths or package names |
| `module_roots` | string[] | Module root directories |
| `notion` | object | Notion publisher configuration |
| `notion.branches` | string[] | Branch filter for Notion publishing |
| `notion.includeBranchInTitle` | boolean | Include branch name in page titles |
| `confluence` | object | Confluence publisher configuration |
| `confluence.branches` | string[] | Branch filter for Confluence publishing |
| `github_wiki` | object | GitHub Wiki publisher configuration |
| `github_wiki.branches` | string[] | Branch filter for GitHub Wiki publishing |
| `github_wiki.sidebar` | boolean | Generate `_Sidebar.md` (default: `true`) |
| `github_wiki.footer` | boolean | Generate `_Footer.md` (default: `true`) |
| `discord` | object | Discord notification configuration |
| `discord.enabled` | boolean | Enable/disable Discord notifications |
| `discord.notifyOn` | string | `"always"`, `"significant"`, or `"never"` |
| `discord.significantThreshold` | number | 0–100, coverage threshold |
| `discord.branches` | string[] | Branch filter for Discord |
| `features` | object | Feature flags (boolean values) |
| `ai` | object | AI configuration |
| `ai.enabled` | boolean | Enable AI-powered documentation |
| `ai.mode` | string | `"hybrid"`, `"full"`, or `"off"` |
| `ai.temperature` | number | 0–2, generation temperature |
| `ai.max_tokens` | number | >0, max tokens per request |
| `documentation` | object | Documentation output settings |
| `documentation.output_dir` | string | Output directory (default: `.repolens`) |
| `documentation.include_artifacts` | boolean | Include AI context artifacts |
| `documentation.sections` | string[] | Section filter |
| `domains` | object | Business domain mapping |

### Supported Page Keys

```
system_overview, module_catalog, api_surface, arch_diff,
route_map, system_map, executive_summary, business_domains,
architecture_overview, data_flows, change_impact, developer_onboarding
```

### Domains Format

```yaml
domains:
  authentication:
    match: ["auth", "login", "session"]
    description: "User authentication and authorization"
  payments:
    match: ["payment", "billing", "stripe"]
    description: "Payment processing"
```

## Plugin Interface

### Contract

Plugins are ES modules that export a `register()` function:

```javascript
export function register() {
  return {
    name: "my-plugin",        // string, REQUIRED
    version: "1.0.0",         // string, optional (defaults to "0.0.0")
    renderers: { ... },       // optional
    publishers: { ... },      // optional
    hooks: { ... },           // optional
  };
}
```

### Renderers

```javascript
renderers: {
  my_document: {
    render(context) { return "# Markdown content"; },  // REQUIRED
    title: "My Document",                                // REQUIRED
  }
}
```

The `context` object contains: `scanResult`, `config`, `aiContext`, `moduleContext`, `flows`, `diffData`, `graphqlResult`, `tsResult`, `depGraph`, `driftResult`.

### Publishers

```javascript
publishers: {
  my_target: {
    publish(cfg, renderedPages) { /* ... */ },  // REQUIRED
  }
}
```

### Hooks

```javascript
hooks: {
  afterScan(scanResult) { return modifiedScanResult; },
  afterRender(documents) { return modifiedDocuments; },
  afterPublish(result) { return modifiedResult; },
}
```

**Hook behavior:**
- Hooks run **serially** in plugin load order
- If a hook returns a non-null/non-undefined value, it replaces the input for subsequent hooks
- If a hook returns `null` or `undefined`, the original value is preserved (no change)
- Hook errors are caught and logged — they do not crash the pipeline
- Renderer and publisher errors are caught and logged — they do not crash the pipeline

### Failure Modes

| Scenario | Behavior |
|----------|----------|
| Plugin module not found | Warning logged, plugin skipped |
| No `register()` export | Warning logged, plugin skipped |
| Invalid descriptor | Warning logged, plugin skipped |
| `register()` throws | Warning logged, plugin skipped |
| Hook throws | Warning logged, continues to next hook |
| Renderer throws | Warning logged, document skipped |
| Publisher throws | Warning logged, publish continues |

### Guaranteed Stability

- The `register()` return shape will not change in v1.x
- The `context` object passed to renderers will only gain new fields (never remove)
- Hook names (`afterScan`, `afterRender`, `afterPublish`) are frozen
- Plugin loading behavior (graceful skip on failure) is frozen

## Environment Variables

### Publishing

| Variable | Required For |
|----------|-------------|
| `NOTION_TOKEN` | Notion publishing |
| `NOTION_PARENT_PAGE_ID` | Notion publishing |
| `CONFLUENCE_URL` | Confluence publishing |
| `CONFLUENCE_EMAIL` | Confluence publishing |
| `CONFLUENCE_API_TOKEN` | Confluence publishing |
| `CONFLUENCE_SPACE_KEY` | Confluence publishing |
| `CONFLUENCE_PARENT_PAGE_ID` | Confluence publishing |
| `DISCORD_WEBHOOK_URL` | Discord notifications |

### AI

| Variable | Description |
|----------|-------------|
| `REPOLENS_AI_ENABLED` | `"true"` to enable AI features |
| `REPOLENS_AI_API_KEY` | API key for AI provider |
| `REPOLENS_AI_BASE_URL` | API base URL |
| `REPOLENS_AI_MODEL` | Model name |
| `REPOLENS_AI_PROVIDER` | Provider type |
| `REPOLENS_AI_TIMEOUT_MS` | Request timeout |

AI settings can also be set in `.repolens.yml` under `ai.*`. Environment variables take precedence over config file values.

### Telemetry

| Variable | Description |
|----------|-------------|
| `REPOLENS_TELEMETRY_ENABLED` | `"true"` to enable error tracking |
| `REPOLENS_SENTRY_DSN` | Custom Sentry DSN (optional) |
| `VERBOSE` | Enable verbose output (same as `--verbose` flag) |

## Output Guarantees

### Documentation Files

- `publish` always generates Markdown files in the output directory (default: `.repolens/`)
- Each enabled page key produces one `.md` file
- File format is standard Markdown with tables, headers, and code blocks
- Artifacts (if enabled) are written to `.repolens/artifacts/`

### Backwards Compatibility

- New page keys may be added in minor versions
- Existing page keys will not be removed or renamed in v1.x
- Document content format may improve (better formatting, more detail) but structural changes (heading hierarchy, section names) are stable
