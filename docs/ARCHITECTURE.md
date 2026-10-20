# 🏗️ Architecture & Design

## How RepoLens Works

```
1. SCAN           2. ANALYZE         3. RENDER           4. PUBLISH
──────────────────────────────────────────────────────────────────
Read files   →   Detect tech     →  Generate docs   →   Notion pages
from patterns    stack patterns      with insights       + Confluence pages
                                                         + GitHub Wiki
                                                         + Obsidian vault
                                                         + Markdown files
```

**Scan Phase:**
- Uses `fast-glob` to match your `scan.include` patterns
- Filters out `scan.ignore` patterns
- Reads package.json for framework/tool detection
- Analyzes file paths for Next.js routes, API endpoints

**Analyze Phase:**
- Extracts frameworks (Next.js, React, Vue, Express, etc.)
- Detects build tools (Vite, Webpack, Turbo, esbuild)
- Identifies test frameworks (Vitest, Jest, Playwright)
- Infers module relationships and dependencies

**Render Phase:**
- Groups files into modules based on `module_roots`
- Draws Unicode diagrams from import edges (`src/renderers/renderMap.js`). Mermaid is not generated
- Creates technical profiles with actual stack insights
- Renders Markdown documentation (17 documents by default)

**Publish Phase:**
- Numbered files: `00-executive-summary.md` through `16-code-health.md` in `documentation.output_dir` (default `.repolens/`)
- Markdown publisher: snake_case files such as `executive_summary.md` in `.repolens/`
- Notion: Creates/updates pages via API with retry logic
- Confluence: Creates/updates pages via REST API v1 (storage format)
- GitHub Wiki: Clones the wiki repo and pushes audience-grouped pages
- Obsidian: Writes notes into a local vault folder (wikilinks, frontmatter, no network)

## Module Dependency Detection

RepoLens infers relationships by analyzing import patterns:

```typescript
// In src/publishers/notion.js
import { renderSystemOverview } from "../renderers/render.js";
// → Publishers depend on Renderers

// In src/renderers/render.js  
import { scanRepo } from "../core/scan.js";
// → Renderers depend on Core

// Result: Dependency graph shows Publishers → Renderers → Core
```

## System Map

```text
bin/repolens.js
  └── src/cli.js
        ├── src/core/            4 files (config, schema, diff, scan)
        ├── src/analyzers/       12 files
        ├── src/renderers/       4 files
        ├── src/publishers/      7 files (notion, confluence, github-wiki,
        │                         markdown, obsidian, index, publish)
        ├── src/utils/           15 files
        ├── src/mcp/             server.js, tools.js, workspace.js
        ├── src/delivery/        1 file
        ├── src/integrations/    discord.js
        └── src/plugins/         loader.js, manager.js
```

## Project Structure

```
repolens/
├── action.yml               # Composite GitHub Action (published npm package)
├── server.json              # MCP Registry metadata
├── smithery.yaml            # Smithery stdio launch
├── bin/
│   ├── repolens.js          # CLI executable wrapper
│   └── repolens-mcp.js      # stdio MCP alias
├── src/
│   ├── cli.js               # Command orchestration + banner
│   ├── mcp/                 # MCP tools and stdio server
│   │   ├── server.js
│   │   ├── tools.js
│   │   └── workspace.js
│   ├── init.js              # Scaffolding command (+ interactive wizard)
│   ├── doctor.js            # Validation command
│   ├── migrate.js           # Workflow migration (legacy → current)
│   ├── watch.js             # Watch mode for local development
│   ├── core/
│   │   ├── config.js        # Config loading + validation
│   │   ├── config-schema.js # Schema version tracking
│   │   ├── diff.js          # Git diff operations
│   │   └── scan.js          # Repository scanning + metadata extraction
│   ├── analyzers/
│   │   ├── domain-inference.js    # Business domain mapping
│   │   ├── context-builder.js     # Structured AI context assembly
│   │   ├── flow-inference.js      # Data flow detection
│   │   ├── graphql-analyzer.js    # GraphQL schema detection
│   │   ├── typescript-analyzer.js # TypeScript type graph analysis
│   │   ├── dependency-graph.js    # Import graph with cycle detection
│   │   ├── drift-detector.js      # Architecture drift detection
│   │   ├── monorepo-detector.js   # npm, yarn, pnpm, and Lerna workspaces
│   │   ├── codeowners.js          # CODEOWNERS ownership
│   │   ├── jsdoc-analyzer.js      # JSDoc and TSDoc on the API surface
│   │   ├── security-patterns.js   # Security hotspots
│   │   └── complexity-analyzer.js # Cyclomatic complexity and code health
│   ├── ai/
│   │   ├── provider.js          # Provider-agnostic AI generation
│   │   ├── prompts.js           # Strict prompt templates
│   │   ├── document-plan.js     # Document structure definition
│   │   └── generate-sections.js # AI section generation + fallbacks
│   ├── docs/
│   │   ├── generate-doc-set.js  # Document generation orchestration
│   │   ├── write-doc-set.js     # Write docs to disk
│   │   └── branding.js          # Docs by RepoLens footer
│   ├── renderers/
│   │   ├── render.js           # System overview, catalog, API, routes
│   │   ├── renderDiff.js       # Architecture diff rendering
│   │   ├── renderMap.js        # Unicode dependency diagrams
│   │   └── renderAnalysis.js   # Extended analysis renderers
│   ├── publishers/
│   │   ├── index.js         # Publisher orchestration + branch filtering
│   │   ├── publish.js       # Publishing pipeline
│   │   ├── notion.js        # Notion API integration
│   │   ├── confluence.js    # Confluence REST API integration
│   │   ├── github-wiki.js   # GitHub Wiki publisher (git-based)
│   │   ├── obsidian.js      # Obsidian vault publisher (local files, no network)
│   │   └── markdown.js      # Local Markdown generation
│   ├── integrations/
│   │   └── discord.js       # Discord webhook notifications
│   ├── delivery/
│   │   └── comment.js       # PR comment delivery
│   ├── plugins/
│   │   ├── loader.js        # Plugin resolution and dynamic import
│   │   └── manager.js       # Plugin registry and lifecycle orchestration
│   └── utils/
│       ├── logger.js        # Logging utilities
│       ├── retry.js         # API retry logic (exponential backoff)
│       ├── branch.js        # Branch detection (multi-platform)
│       ├── validate.js      # Configuration validation & security
│       ├── metrics.js       # Documentation coverage & health scoring
│       ├── rate-limit.js    # Token bucket rate limiter for APIs
│       ├── secrets.js       # Secret detection & sanitization
│       ├── telemetry.js     # Opt-in error tracking + performance timers
│       ├── errors.js        # Enhanced error messages with guidance
│       ├── update-check.js  # Version update notifications
│       ├── doc-cache.js     # Hash cache for unchanged pages
│       ├── safe-path.js     # Output path containment
│       ├── github-repo.js   # owner/name checks
│       ├── interactive.js   # TTY prompts
│       └── yaml.js          # Size-capped YAML parsing
├── tests/                   # Vitest test suite
├── gallery/                 # Static showcase generator, flat Material pages (not published to npm)
├── docs/                    # Handbook (ROADMAP, STABILITY, RELEASE, …)
├── .repolens.yml            # Dogfooding config
├── package.json
├── CHANGELOG.md
├── SECURITY.md
└── CONTRIBUTING.md
```
