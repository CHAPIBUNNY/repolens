# ⚙️ Configuration Reference

## Complete Example

```yaml
configVersion: 1  # Schema version for future migrations

project:
  name: "my-awesome-app"
  docs_title_prefix: "MyApp"

# Configure output destinations
publishers:
  - notion
  - confluence
  - github_wiki
  - obsidian
  - markdown

# Notion-specific settings (optional)
notion:
  branches:
    - main              # Only main branch publishes
    - staging           # Also staging
    - release/*         # Glob patterns supported
  includeBranchInTitle: false  # Clean titles without [branch-name]

# Confluence-specific settings (optional)
confluence:
  branches:
    - main              # Only main branch publishes to Confluence

# Obsidian vault (optional, local files only — no network)
obsidian:
  vault: "/path/to/vault"       # Absolute, or relative to the repository
  folder: "RepoLens/my-app"     # Subdirectory inside the vault
  branches:
    - main
  index: true                   # Map-of-content note (default: true)
  frontmatter: true             # YAML properties (default: true)
  wikilinks: true               # Rewrite markdown links (default: true)

# GitHub Wiki (optional). Credentials come from GITHUB_TOKEN, not this file.
github_wiki:
  branches:
    - main
  sidebar: true
  footer: true

# Discord notifications (optional)
discord:
  enabled: true                  # Default: true (if DISCORD_WEBHOOK_URL set)
  notifyOn: significant          # Options: always, significant, never
  significantThreshold: 10       # Notify if change >10% (default)
  branches:                      # Which branches to notify (default: all)
    - main
    - develop

# File scanning configuration
scan:
  include:
    - "src/**/*.{ts,tsx,js,jsx}"
    - "app/**/*.{ts,tsx,js,jsx}"
    - "pages/**/*.{ts,tsx,js,jsx}"
    - "lib/**/*.{ts,tsx,js,jsx}"
  ignore:
    - "node_modules/**"
    - ".next/**"
    - "dist/**"
    - "build/**"
    - "coverage/**"

# Module organization
module_roots:
  - "src"
  - "app"
  - "lib"
  - "pages"

# Documentation pages to generate
outputs:
  pages:
    - key: "system_overview"
      title: "System Overview"
      description: "High-level snapshot and tech stack"
    - key: "module_catalog"
      title: "Module Catalog"
      description: "Complete module inventory"
    - key: "api_surface"
      title: "API Surface"
      description: "REST endpoints and methods"
    - key: "route_map"
      title: "Route Map"
      description: "Frontend routes and pages"
    - key: "system_map"
      title: "System Map"
      description: "Visual dependency graph"

# Docs by RepoLens badge on generated Markdown (default: on)
# branding: false
# branding:
#   badge: false

# Feature flags (optional). Keys are document-plan keys.
# false drops that document, except system_overview, module_catalog, and route_map.
# Ignored when documentation.sections is set.
features:
  executive_summary: true
  code_health: true
```

## Configuration Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `configVersion` | number | **Yes** | Schema version (must be `1`) |
| `project.name` | string | Yes | Project name |
| `project.docs_title_prefix` | string | No | Prefix for documentation titles (default: project name) |
| `publishers` | array | Yes | Output targets: `notion`, `confluence`, `github_wiki`, `obsidian`, `markdown` (+ plugin publishers) |
| `plugins` | array | No | Plugin paths or npm package names |
| `notion.branches` | array | No | Branch whitelist for Notion publishing. Supports globs. |
| `notion.includeBranchInTitle` | boolean | No | Add `[branch-name]` to titles (default: `true`) |
| `confluence.branches` | array | No | Branch whitelist for Confluence publishing. Supports globs. |
| `github_wiki.branches` | array | No | Branch whitelist for GitHub Wiki publishing. Supports globs. |
| `github_wiki.sidebar` | boolean | No | Generate `_Sidebar.md` navigation (default: `true`) |
| `github_wiki.footer` | boolean | No | Generate `_Footer.md` (default: `true`) |
| `obsidian.vault` | string | No | Obsidian vault path. Absolute, or relative to the repo. Required when the `obsidian` publisher runs. |
| `obsidian.folder` | string | No | Folder inside the vault (default: `RepoLens/<project>`). Must stay inside the vault. |
| `obsidian.branches` | array | No | Branch whitelist for Obsidian publishing. Supports globs. |
| `obsidian.index` | boolean | No | Write a `RepoLens.md` index note with links to every page (default: `true`) |
| `obsidian.frontmatter` | boolean | No | Add YAML frontmatter (title, aliases, tags) (default: `true`) |
| `obsidian.wikilinks` | boolean | No | Rewrite inline markdown links to wikilinks and name notes by title (default: `true`). Labels are limited to 500 characters and cannot contain `[`, `]`, or newlines. Targets are limited to 2048 characters and cannot contain parentheses or whitespace. Fenced code and external URLs are left unchanged. |
| `discord.enabled` | boolean | No | Enable Discord notifications (default: `true` if webhook set) |
| `discord.notifyOn` | string | No | Notification policy: `always`, `significant`, `never` (default: `significant`) |
| `discord.significantThreshold` | number | No | Change % threshold for notifications (default: `10`) |
| `discord.branches` | array | No | Branch filter for notifications. Supports globs. (default: all) |
| `scan.include` | array | Yes | Glob patterns for files to scan. Absolute patterns are rejected. |
| `scan.ignore` | array | Yes | Glob patterns to exclude. The key is `ignore`. `scan.exclude` is not a config field. |
| `module_roots` | array | No | Root directories for module detection. The schema allows omitting it. `repolens doctor` fails when it is missing or empty. |
| `outputs.pages` | array | Yes | Required schema list. Each `key` must be one of the supported page keys below. This list does not choose which documents are generated. |
| `documentation.output_dir` | string | No | Directory for the numbered document set (default: `.repolens`). Must stay inside the repository. |
| `documentation.sections` | string[] | No | When set, only these document-plan keys are generated. |
| `documentation.include_artifacts` | boolean | No | Write JSON artifacts under the output directory (default: on). |
| `features` | object | No | When `documentation.sections` is unset, a feature flag set to `false` drops that document. `system_overview`, `module_catalog`, and `route_map` are always kept. |
| `branding` | boolean or object | No | Footer badge on generated Markdown. Default: on. `false` or `{ badge: false }` disables it. |
| `ai.enabled` | boolean | No | Enable AI-powered documentation |
| `ai.mode` | string | No | AI mode: `hybrid`, `full`, or `off` |
| `ai.temperature` | number | No | Generation temperature (0–2). Not supported by all models (e.g. gpt-5-mini ignores it) |
| `ai.max_tokens` | number | No | Max completion tokens per request (>0) |

## What actually gets generated

`publish` builds the document plan in `src/ai/document-plan.js` (17 documents). `documentation.sections` filters that plan when it is set. Otherwise `features` can turn individual documents off. With neither filter, all 17 are generated. Each generated Markdown document ends with the Docs by RepoLens badge unless `branding` is off.

`outputs.pages` is still required, and its keys are the frozen schema allowlist:

`system_overview`, `module_catalog`, `api_surface`, `arch_diff`, `route_map`, `system_map`, `executive_summary`, `business_domains`, `architecture_overview`, `data_flows`, `change_impact`, `developer_onboarding`

`graphql_schema`, `type_graph`, `dependency_graph`, `architecture_drift`, `security_hotspots`, and `code_health` are generated and published. Schema v1 rejects them inside `outputs.pages`.

There is no top-level `github` config object. GitHub Wiki uses the `github_wiki` publisher plus `GITHUB_TOKEN` (and optional `GITHUB_REPOSITORY`).

## Where files are written

`publish` always writes the numbered set into `documentation.output_dir` (default `.repolens/`): `00-executive-summary.md` through `16-code-health.md`.

The Markdown publisher writes a second set of snake_case files in `.repolens/`, such as `executive_summary.md` and `architecture_diff.md` (the `arch_diff` key). It runs when `publishers` includes `markdown`, and also when `publishers` does not include `notion`. An Obsidian-only list therefore still writes those `.repolens/` files.

Obsidian writes into `obsidian.vault` / `obsidian.folder`. With `wikilinks: true` (the default), note names are titles (`Executive Summary.md`) plus an index note `RepoLens.md`. A manifest, `.repolens-obsidian.json`, records the notes RepoLens manages. The vault directory must already exist. The folder is created. Paths that leave the vault are rejected. Identical content is not rewritten.
