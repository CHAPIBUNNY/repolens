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
- `init --quick` detects languages (Python, Go, Rust, Java, JavaScript, and others) and writes `scan.include` plus `module_roots` that fit the repository. `demo` without a config uses the same detection
- Uses `fast-glob` to match your `scan.include` patterns
- `demo` and `publish` exit 2 when nothing matches, before any empty docs are written. `doctor` fails the same way. `watch` exits 2 when `module_roots` are missing or `scan.include` matches no files
- Filters out `scan.ignore` patterns
- Reads package.json for framework/tool detection
- Analyzes file paths for Next.js routes, API endpoints

**Analyze Phase:**
- Extracts frameworks (Next.js, React, Vue, Express, etc.)
- Detects build tools (Vite, Webpack, Turbo, esbuild)
- Identifies test frameworks (Vitest, Jest, Playwright)
- Scores code health for JavaScript/TypeScript, Python, and Go (regex complexity, not an AST)
- Builds an import graph for JavaScript/TypeScript, Python, and Go. Comments, strings, TypeScript type-only imports, Python `TYPE_CHECKING` blocks, and Node.js built-ins are skipped. Go `*_test.go` files are not graph nodes. Go hub rows are packages, not files
- Infers module relationships and dependencies. Pattern names cite the path token or import that matched. Test files are not evidence, and neither are the generic folder names `src` and `lib`. A package with `main`, `module`, or `exports` is a library, so it gets no CLI pattern. "API route pattern" requires an `api`, `routes`, `router`, `endpoint`, `controller`, or `handler` directory

**Render Phase:**
- Groups files into modules based on `module_roots`. A file directly under a root belongs to the root, so a flat `src/` is one module
- Draws Unicode diagrams from import edges (`src/renderers/renderMap.js`). Mermaid is not generated
- Creates technical profiles with actual stack insights
- Renders Markdown documentation (17 documents by default; Route Map and GraphQL Schema are skipped when nothing was found)

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
        ├── src/analyzers/       14 files
        ├── src/renderers/       4 files
        ├── src/publishers/      7 files (notion, confluence, github-wiki,
        │                         markdown, obsidian, index, publish)
        ├── src/utils/           21 files (includes route-params.js)
        ├── src/mcp/             server.js, tools.js, workspace.js
        ├── src/delivery/        comment.js, architecture-comment.js, comment-constants.js
        ├── src/github-app/      manifest, signature, auth, checkout, handler, server, run
        ├── src/integrations/    discord.js
        └── src/plugins/         loader.js, manager.js
```

## Project Structure

```
repolens/
├── action.yml               # Composite action. publish/demo/doctor use npm; comment and badge use this repo
├── app.yml                  # GitHub App manifest (YAML). Same fields as github-app-manifest.json
├── github-app-manifest.json # GitHub App manifest (JSON) for the registration form
├── llms.txt                 # Short description for assistants (also generated on the gallery)
├── llms-full.txt            # Longer install, CLI, MCP, action, and badge description
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
│   │   ├── dependency-graph.js    # Import graph with cycle detection (JS/TS, Python, Go; Go hubs per package; hubs ignore tests and examples; runtime vs dev packages)
│   │   ├── import-parsers.js      # Comment-aware JS/TS, Python (skips TYPE_CHECKING), and Go import parsers
│   │   ├── drift-detector.js      # Architecture drift detection
│   │   ├── monorepo-detector.js   # npm, yarn, pnpm, and Lerna workspaces
│   │   ├── codeowners.js          # CODEOWNERS ownership
│   │   ├── jsdoc-analyzer.js      # JSDoc and TSDoc on the API surface
│   │   ├── security-patterns.js   # Security hotspots (fixed-string innerHTML ignored; examples and build scripts are low severity)
│   │   ├── complexity-analyzer.js # Complexity and code health (JS/TS, Python, Go)
│   │   └── maturity.js            # Maturity from version, history, tests, CI, docs, and dependency health
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
│   ├── badge.js             # shields.io code-health JSON, square SVG, markdown snippet
│   ├── delivery/
│   │   ├── comment.js       # Short PR comment used by publish
│   │   ├── architecture-comment.js  # Sticky architecture diff (files, modules, deps, health)
│   │   └── comment-constants.js     # Comment marker and footer links
│   ├── github-app/          # `repolens app`: manifest, signature check, installation token, webhook
│   │   ├── manifest.js
│   │   ├── signature.js
│   │   ├── auth.js
│   │   ├── checkout.js
│   │   ├── handler.js
│   │   ├── server.js
│   │   └── run.js
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
│       ├── project-name.js  # Project name from package.json or the real directory (never `.`)
│       ├── ai-notice.js     # Which sections the "unlock AI" notice offers
│       ├── path-roles.js    # Test, tooling, and build/example path checks shared by analyzers
│       ├── github-repo.js   # owner/name checks
│       ├── interactive.js   # TTY prompts
│       ├── yaml.js          # Size-capped YAML parsing (js-yaml 5, Core schema, merge key, maxAliases)
│       └── route-params.js  # Linear `[param]` and route-group replacements
├── tests/                   # Vitest test suite
├── gallery/                 # Static showcase generator, flat Material pages (not published to npm)
├── docs/                    # Handbook (ROADMAP, STABILITY, RELEASE, …)
├── .repolens.yml            # Dogfooding config
├── package.json
├── CHANGELOG.md
├── SECURITY.md
└── CONTRIBUTING.md
```
