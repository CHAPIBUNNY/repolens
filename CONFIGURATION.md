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

# Discord notifications (optional)
discord:
  enabled: true                  # Default: true (if DISCORD_WEBHOOK_URL set)
  notifyOn: significant          # Options: always, significant, never
  significantThreshold: 10       # Notify if change >10% (default)
  branches:                      # Which branches to notify (default: all)
    - main
    - develop

# GitHub integration (optional)
github:
  owner: "your-username"
  repo: "your-repo-name"

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

# Feature flags (optional, experimental)
features:
  architecture_diff: true
  route_map: true
  visual_diagrams: true
```

## Configuration Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `configVersion` | number | **Yes** | Schema version (must be `1`) |
| `project.name` | string | Yes | Project name |
| `project.docs_title_prefix` | string | No | Prefix for documentation titles (default: project name) |
| `publishers` | array | Yes | Output targets: `notion`, `confluence`, `github_wiki`, `markdown` (+ plugin publishers) |
| `plugins` | array | No | Plugin paths or npm package names |
| `notion.branches` | array | No | Branch whitelist for Notion publishing. Supports globs. |
| `notion.includeBranchInTitle` | boolean | No | Add `[branch-name]` to titles (default: `true`) |
| `confluence.branches` | array | No | Branch whitelist for Confluence publishing. Supports globs. |
| `github_wiki.branches` | array | No | Branch whitelist for GitHub Wiki publishing. Supports globs. |
| `github_wiki.sidebar` | boolean | No | Generate `_Sidebar.md` navigation (default: `true`) |
| `github_wiki.footer` | boolean | No | Generate `_Footer.md` (default: `true`) |
| `discord.enabled` | boolean | No | Enable Discord notifications (default: `true` if webhook set) |
| `discord.notifyOn` | string | No | Notification policy: `always`, `significant`, `never` (default: `significant`) |
| `discord.significantThreshold` | number | No | Change % threshold for notifications (default: `10`) |
| `discord.branches` | array | No | Branch filter for notifications. Supports globs. (default: all) |
| `github.owner` | string | No | GitHub org/username |
| `github.repo` | string | No | Repository name |
| `scan.include` | array | Yes | Glob patterns for files to scan |
| `scan.ignore` | array | Yes | Glob patterns to exclude |
| `module_roots` | array | No | Root directories for module detection |
| `outputs.pages` | array | Yes | Documentation pages to generate |
| `features` | object | No | Feature flags (boolean values) |
| `ai.enabled` | boolean | No | Enable AI-powered documentation |
| `ai.mode` | string | No | AI mode: `hybrid`, `full`, or `off` |
| `ai.temperature` | number | No | Generation temperature (0–2). Not supported by all models (e.g. gpt-5-mini ignores it) |
| `ai.max_tokens` | number | No | Max completion tokens per request (>0) |
