# RepoLens - GitHub Copilot Instructions

```
    ██████╗ ███████╗██████╗  ██████╗ ██╗     ███████╗███╗   ██╗███████╗
    ██╔══██╗██╔════╝██╔══██╗██╔═══██╗██║     ██╔════╝████╗  ██║██╔════╝
    ██████╔╝█████╗  ██████╔╝██║   ██║██║     █████╗  ██╔██╗ ██║███████╗
    ██╔══██╗██╔══╝  ██╔═══╝ ██║   ██║██║     ██╔══╝  ██║╚██╗██║╚════██║
    ██║  ██║███████╗██║     ╚██████╔╝███████╗███████╗██║ ╚████║███████║
    ╚═╝  ╚═╝╚══════╝╚═╝      ╚═════╝ ╚══════╝╚══════╝╚═╝  ╚═══╝╚══════╝
                        🔍 Repository Intelligence CLI 📊
```

## Project Overview

RepoLens is an AI-assisted documentation intelligence system that generates architecture documentation for both technical and non-technical audiences. It analyzes codebases, infers business context and data flows, and creates audience-aware documentation using optional AI enhancement. It operates autonomously via GitHub Actions and can be triggered locally.

**npm Package:** `@chappibunny/repolens`  
**Version:** 1.10.0  
**Status:** Production-ready, stable (v1.0+ with semver guarantees)  
**License:** MIT  
**Repository:** https://github.com/CHAPIBUNNY/repolens  
**Author:** Charl van Zyl

## Core Value Proposition

RepoLens transforms repositories into documented, understandable systems that serve multiple audiences:
1. **Scanning** - Fast-glob file matching with performance guardrails
2. **Analyzing** - Framework/tool detection + domain inference + flow analysis
3. **Context Building** - Structured artifacts for AI synthesis (no raw code)
4. **AI Synthesis** (Optional) - Natural language explanations for non-technical readers
5. **Rendering** - 15 audience-aware documents (technical + non-technical)
6. **Publishing** - Multi-output delivery (Notion + Confluence + GitHub Wiki + Markdown) with branch-aware safety

## Architecture

### Project Structure

```
bin/
  repolens.js             # CLI entry point
src/
  cli.js                  # Main CLI orchestration + banner
  doctor.js               # Repository validation + env var checks
  init.js                 # Scaffolding for new repos (+ interactive wizard)
  migrate.js              # Workflow + config migration (legacy → current format)
  watch.js                # Watch mode for local development
  core/
    config.js             # Configuration loading and validation
    config-schema.js      # Schema versioning (configVersion: 1)
    diff.js               # Git diff operations
    scan.js               # Repository scanning logic + metadata extraction
  analyzers/
    domain-inference.js   # Business domain mapping from paths
    context-builder.js    # Structured AI context assembly
    flow-inference.js     # Data flow detection via heuristics
    graphql-analyzer.js   # GraphQL schema detection
    typescript-analyzer.js # TypeScript type graph analysis
    dependency-graph.js   # Import graph with cycle detection
    drift-detector.js     # Architecture drift detection
    monorepo-detector.js  # Monorepo workspace detection (npm/yarn/pnpm/Lerna)
    codeowners.js         # CODEOWNERS file parser + ownership mapping
  ai/
    provider.js           # Multi-provider AI text generation (OpenAI, Anthropic, Google, GitHub Models)
    prompts.js            # Strict prompt templates + JSON schemas + structured renderers
    document-plan.js      # Canonical document structure definition
    generate-sections.js  # AI-powered section generation with structured output + fallbacks
  docs/
    generate-doc-set.js   # Document generation orchestration
    write-doc-set.js      # Write documentation set to disk
  delivery/
    comment.js            # PR comment management
  integrations/
    discord.js            # Discord webhook notifications (rich embeds)
  publishers/
    index.js              # Publisher orchestration + branch filtering
    markdown.js           # Markdown file generation
    notion.js             # Notion API integration
    confluence.js         # Confluence REST API integration (storage format)
    github-wiki.js        # GitHub Wiki publisher (git-based)
    publish.js            # Publishing pipeline + diagram URL validation
  renderers/
    render.js             # System overview, module catalog, API surface, route map (with truncation warnings)
    renderDiff.js         # Architecture diff rendering (with truncation warnings)
    renderMap.js          # System map (real import-based Unicode dependency diagrams)
    renderAnalysis.js     # Extended analysis renderers (GraphQL, TS, deps, drift)
  utils/
    logger.js             # Logging utilities
    errors.js             # Enhanced error messages with actionable guidance
    retry.js              # Retry logic for API calls (exponential backoff)
    branch.js             # Multi-platform branch detection
    update-check.js       # Version update notifications
    validate.js           # Configuration validation & security
    metrics.js            # Documentation coverage & health scoring
    rate-limit.js         # Token bucket rate limiter for APIs
    secrets.js            # Secret detection & sanitization
    telemetry.js          # Opt-in error tracking + performance timers
    doc-cache.js          # Hash-based document cache for skip-unchanged publishing
  plugins/
    loader.js             # Plugin resolution and dynamic import
    manager.js            # Plugin registry and lifecycle orchestration
tests/                    # Vitest test suite (380 tests across 22 files)
  branch.test.js          # Branch detection tests
  cli.test.js             # CLI command tests
  config-discovery.test.js # Config auto-discovery tests
  config.test.js          # Configuration validation tests
  doctor.test.js          # Doctor command tests
  init.test.js            # Init scaffolding tests
  integration.test.js     # Integration tests
  markdown.test.js        # Markdown publisher tests
  migrate.test.js         # Migration tests
  security-fuzzing.test.js # Security fuzzing tests
  extended-analysis.test.js # Extended analysis tests (GraphQL, TS, deps, drift)
  plugins.test.js         # Plugin system tests (loader, manager, config)
  github-wiki.test.js     # GitHub Wiki publisher tests
  publisher-parsers.test.js # Publisher parser tests (Notion, Confluence)
  watch.test.js           # Watch mode tests (real filesystem events, debounce, node_modules filter)
  http-integration.test.js # Mock HTTP server integration tests (retry, timeout, headers, publishers)
  rate-limit-stress.test.js # Concurrent rate-limit stress tests (token bucket, batch, deadlock)
  renderers.test.js         # Renderer unit tests (render.js, renderMap.js, renderDiff.js)
  deterministic-enrichment.test.js # Enriched deterministic fallback tests (all 6 AI-enhanced doc types)
  tier3.test.js           # T3 feature tests (cache, monorepo, codeowners, AI providers, structured output)
  robustness.test.js      # Robustness tests (rate-limit, context-builder, flow-inference, discord, telemetry, timeout, partial-publish)
  e2e/
    migration.test.js     # End-to-end migration tests
docs/                     # Secondary documentation (moved from root)
  AI.md                   # AI feature documentation
  ARCHITECTURE.md         # System architecture
  CONFIGURATION.md        # Config file reference
  DEVELOPMENT.md          # Developer guide
  ENVIRONMENT.md          # Environment variables reference
  INSTALLATION.md         # Installation methods
  KNOWN_ISSUES.md         # Known issues tracker
  MIGRATION.md            # Version migration guide
  ONBOARDING.md           # Step-by-step onboarding
  PRODUCTION_CHECKLIST.md # Production deployment checklist
  RELEASE.md              # Release process
  ROADMAP.md              # Feature roadmap
  STABILITY.md            # API stability guarantees
  TELEMETRY.md            # Telemetry documentation
  TROUBLESHOOTING.md      # Common issues and solutions
assets/                   # Static assets
  Avatar.png              # Project avatar/logo
scripts/                  # Helper scripts
  demo-interactive.sh     # Interactive demo script
```

### Key Commands

- `repolens init` - **Interactive wizard** — configure publishers, AI, credentials (default)
- `repolens init --quick` - Minimal scaffolding, skip wizard
- `repolens doctor` - Validate repository setup (config, environment, etc.)
- `repolens publish` - Scan repo, generate docs (with optional AI), publish to outputs
- `repolens demo` - Generate local docs without API keys (quick preview)
- `repolens watch` - Watch for file changes and regenerate docs (Markdown only)
- `repolens migrate` - Migrate legacy workflows + config files (adds `configVersion: 1` if missing)
- `repolens uninstall` - Remove all RepoLens-generated files
- `repolens feedback` - Send feedback to the RepoLens team
- `repolens version` - Display version
- `repolens help` - Show usage

## Feature Highlights

### AI-Assisted Documentation Intelligence
- **Philosophy**: Not a "flashy code intelligence toy" — a documentation intelligence system for engineers AND stakeholders
- **Two Modes**: Deterministic (default, free, fast) or AI-Enhanced (optional, provider-agnostic)
- **15 Document Types**: 3 non-technical, 4 mixed-audience, 4 technical, 4 extended-analysis
- **Zero Hallucination**: AI receives only structured JSON context, never raw code
- **Context Size Limiting**: `truncateContext()` enforces 12K char cap with progressive field pruning (routes→15, domains→8, modules→10)
- **Strict Prompts**: Word limits, required sections, concrete prose, no speculation
- **Multi-Provider**: Native adapters for OpenAI (+ compatible), Anthropic (Messages API), Google Gemini, GitHub Models (free tier); Azure uses OpenAI adapter
- **Structured Output**: JSON mode with schema validation per document type, one re-prompt on failure, then graceful fallback
- **Graceful Fallback**: Structured JSON → plain-text AI → deterministic docs (three-tier cascade)
- **Enriched Deterministic Mode**: Even without AI, fallbacks produce rich output using dep graph stats, data flows, routes, monorepo info, drift results, and module type classifications

### Multi-Platform Publishing
- **Notion**: Create/update pages with branch-aware namespacing; relative link rewriting (strips `./` and `../` links)
- **Confluence**: Atlassian Cloud REST API v1, storage format (HTML-like), Basic Auth (email + API token); CDATA-safe code blocks; relative link rewriting
- **GitHub Wiki**: Audience-grouped Home page, grouped sidebar, page metadata headers, `master` branch push for compatibility
- **Markdown**: Write to `.repolens/` directory; all 15 document types mapped to filenames
- **Discord**: Rich embed notifications via webhooks (publish metrics, coverage stats)

### Business Domain Inference
- **Purpose**: Map code structure to business functions
- **Default Domains** (15 generic): Authentication & Identity, Analytics & Reporting, Content Management, Search & Discovery, Notifications, Payments & Billing, API Layer, UI Components, React Hooks, State Management, Shared Utilities, Data Layer, Configuration, Testing, Background Jobs
- **Pattern Matching**: Folder/file names to domain keywords (e.g., "auth" → Authentication & Identity)
- **Customizable**: Define domains in `.repolens.yml` with match patterns and descriptions
- **Output**: Groups modules by domain in business-friendly documentation

### Data Flow Analysis
- **Purpose**: Understand how information moves through the system
- **Heuristics**: Pattern-based detection (market data, auth, content, API integration flows)
- **Detects**: Flow steps, involved modules, dependencies, criticality
- **Output**: Natural language flow descriptions in Data Flows document

### Structured Context Building
- **Problem**: Sending raw code to AI causes hallucination
- **Solution**: Three-layer architecture: Scan → Structured Artifacts → AI Synthesis
- **Artifacts**: JSON files with project stats, domains, modules, routes, tech stack, patterns
- **Benefits**: AI can't invent code that doesn't exist, stays grounded in facts
- **Storage**: `.repolens/artifacts/` for debugging and inspection

### Branch-Aware Publishing
- **Problem**: Multiple branches publishing to same Notion/Confluence pages causes conflicts
- **Solution**: `.repolens.yml` → `notion.branches` array filters which branches publish
- **Title Namespacing**: Non-main branches get `[branch-name]` suffix
- **Cache Scoping**: Branch-specific cache keys prevent cross-branch pollution

### Smart Tech Stack Detection
- **Source**: Reads package.json dependencies + devDependencies
- **Detects**: Frameworks (Next.js, React, Vue, Express), languages (TypeScript), build tools (Vite, Webpack), test frameworks (Vitest, Jest, Playwright)
- **Output**: "Technical Profile" section with actual stack insights (not generic "MVP based on heuristics")

### Unicode Architecture Diagrams
- **Approach**: Simple box-drawing characters with emoji icons (🎯, ⚙️, 📋, 🔌, 🛠️, ✅, 📦)
- **Real Import Analysis**: System map uses actual import edges from dependency graph when available, falls back to heuristic inference
- **Benefits**: Always works, no external dependencies, no URL length limits
- **Removed**: Mermaid CLI, SVG generation, mermaid.ink fallback complexity
- **Reliability**: 100% success rate in Notion, Confluence, and Markdown

### Security Features
- **Secret Detection**: Scans for API keys, tokens, passwords, connection strings (OpenAI, GitHub, AWS, Notion, etc.)
- **Config Validation**: Schema validation with injection prevention
- **CI Security Gates**: Dependency audit + secret scanning before every publish and release
- **Telemetry Sanitization**: Secrets stripped before any data leaves the system

### Telemetry & Metrics
- **Error Tracking**: Opt-in Sentry integration (`REPOLENS_TELEMETRY_ENABLED=true`)
- **Usage Metrics**: Documentation coverage, health scoring, staleness detection
- **Rate Limiting**: Token bucket algorithm for API calls (Notion: 3 req/s)

### Plugin System
- **Purpose**: Extend RepoLens with custom renderers, publishers, and lifecycle hooks
- **Loading**: Plugins declared in `.repolens.yml` `plugins` array (local paths or npm packages)
- **Registration**: ES module exporting `register()` → returns descriptor with `name`, `version`, optional `renderers`, `publishers`, `hooks`
- **Renderers**: Custom document types with `render(context)` + `title`; merged into document generation pipeline
- **Publishers**: Custom output targets with `publish(cfg, renderedPages)`; invoked alongside core publishers
- **Hooks**: `afterScan`, `afterRender`, `afterPublish` — chained in load order, error-isolated per plugin
- **Validation**: Strict descriptor validation at load time; graceful failure on missing/broken plugins

## Coding Conventions

### Module System
- **ES Modules only** (`type: "module"` in package.json)
- Use `import/export` syntax
- File imports require `.js` extension

### Dependencies
- **Runtime**: dotenv, fast-glob, js-yaml, node-fetch, @sentry/node
- **Optional**: @mermaid-js/mermaid-cli (50MB, interactive install)
- **Dev**: vitest
- Keep dependencies minimal - favor Node.js built-ins

### Error Handling
- Use logger utilities (`info`, `error`, `warn`) from `src/utils/logger.js`
- Exit with appropriate codes: `0` success, `1` errors, `2` validation failures
- Provide user-friendly error messages with actionable guidance

### Testing
- Framework: Vitest (`vitest run --no-watch --reporter=verbose`)
- Test files: `tests/*.test.js` and `tests/e2e/*.test.js`
- Mock file system operations using Vitest mocks
- Test config discovery, validation, rendering, branch detection, migration, security fuzzing
- **Coverage**: 380 tests passing across 22 test files
- Run: `npm test`

### Configuration
- Config file: `.repolens.yml` (auto-discovered from cwd or parent directories)
- YAML format with js-yaml parser
- Schema version: `configVersion: 1` (for future migrations)
- Supported publishers: `notion`, `markdown`, `confluence`, `github_wiki`
- Supported page keys: `system_overview`, `module_catalog`, `api_surface`, `arch_diff`, `route_map`, `system_map`, `executive_summary`, `business_domains`, `architecture_overview`, `data_flows`, `change_impact`, `developer_onboarding`

### Async/Await
- Use async/await throughout (not callbacks or raw promises)
- Handle errors with try/catch blocks
- Propagate errors to CLI error handler

### File Operations
- Use `node:fs/promises` for async file operations
- Use `node:path` for cross-platform path handling
- Prefer `path.resolve()` and `path.join()` over string concatenation

### API Integration
- Notion API: Use retry logic from `src/utils/retry.js`
- Confluence API: Basic Auth (email:api_token), storage format content
- Rate limiting: Token bucket algorithm in `src/utils/rate-limit.js` (3 req/s default)
- Retry: Exponential backoff (3 retries) via `src/utils/retry.js`
- Environment variables: Load via dotenv, document in `.env.example`

## Publishing Workflow

1. **Scan**: Parse repository structure with fast-glob, extract metadata from package.json
2. **Render**: Generate Markdown documentation with Unicode architecture diagrams
3. **Publish**:
   - **Notion**: Create/update pages via Notion API
   - **Confluence**: Create/update pages via REST API v1 (storage format with code block handling)
   - **GitHub Wiki**: Clone wiki repo, write audience-grouped pages, push to `master` branch
   - **Markdown**: Write to `.repolens/` directory
4. **Notify**: Send Discord webhook with publish metrics
5. **Deliver**: Optionally post PR comments with diffs

## CI/CD Workflows

### Publish Documentation (`publish-docs.yml`)
- **Trigger**: Push to any branch + manual dispatch
- **Jobs**: Security audit → Publish docs
- **Install**: `npm install` (NOT `npm ci` — avoids rollup optional dep issues on Linux)
- **Run**: `node bin/repolens.js publish` (uses local code, not npx from npm)
- **Env**: Notion, Confluence, Discord, AI secrets from GitHub Actions secrets

### Release (`release.yml`)
- **Trigger**: Push of `v*` tags
- **Jobs**: Security audit → Release (test, pack, GitHub Release, npm publish)
- **Install**: `npm install` (NOT `npm ci`)
- **npm Publish**: Uses `NODE_AUTH_TOKEN` from `NPM_TOKEN` secret
- **Important**: Always use `npm install` instead of `npm ci` in CI, AND delete `package-lock.json` before install — `npm install` with a macOS-generated lockfile still fails to resolve platform-specific optional dependencies like `@rollup/rollup-linux-x64-gnu` on Linux runners

## Git Integration

- Uses git CLI commands via child_process
- Diff generation: `git diff` for architecture changes
- Branch detection: Multi-source priority (GITHUB_REF_NAME, CI_COMMIT_REF_NAME, CIRCLE_BRANCH, git command)

## Best Practices

1. **Config Discovery**: Always support auto-discovery of `.repolens.yml` from cwd or parents
2. **Idempotent Operations**: Publishing should be safe to run multiple times
3. **Clear Logging**: Use logger for all user-facing messages with context
4. **Validation First**: Run validation (`doctor` command) before expensive operations
5. **Graceful Degradation**: Continue on non-critical failures, log warnings (e.g., mermaid-cli optional)
6. **Exit Codes**: 0 for success, 1 for errors, 2 for validation failures
7. **Performance Guardrails**: Warn at 10k files, fail at 50k files
8. **Branch Safety**: Default to safe behavior (publish all branches) with opt-in filtering
9. **Secret Safety**: Never log or embed secrets — use `src/utils/secrets.js` for detection
10. **CI Install**: Always use `npm install` (not `npm ci`) in GitHub Actions workflows

## Development Workflow

```bash
# Link locally for development
npm link

# Run tests
npm test

# Test installation
npm run pack:check
npm run test:install

# Test specific features
npm run test:notion
npm run init:test

# Release workflow (auto-publishes to npm via GitHub Actions)
npm run release:patch  # or minor or major
git push --follow-tags
```

## Common Patterns

### Config Loading
```javascript
import { loadConfig } from "./core/config.js";
const config = await loadConfig(configPath);
```

### Scanning Repository
```javascript
import { scanRepo } from "./core/scan.js";
const scanResult = await scanRepo(config);
// Returns: { filesCount, modules, api, pages, metadata }
```

### Publishing
```javascript
import { publishDocs } from "./publishers/index.js";
await publishDocs(docs, config);
```

### Branch Detection
```javascript
import { getCurrentBranch, shouldPublishToNotion } from "./utils/branch.js";
const branch = getCurrentBranch();
if (shouldPublishToNotion(branch, config)) {
  // Publish to Notion
}
```

### Discord Notifications
```javascript
import { sendDiscordNotification } from "./integrations/discord.js";
await sendDiscordNotification(webhookUrl, {
  repoName, branch, pagesPublished, coverage
});
```

### Telemetry
```javascript
import { initTelemetry, captureError, trackUsage } from "./utils/telemetry.js";
initTelemetry(); // Only activates if REPOLENS_TELEMETRY_ENABLED=true
```

## Environment Variables

### Required (for publishing)
- `NOTION_TOKEN` - Notion integration token
- `NOTION_PARENT_PAGE_ID` - Parent page for Notion docs

### Confluence (optional)
- `CONFLUENCE_URL` - Base URL (e.g., https://company.atlassian.net/wiki)
- `CONFLUENCE_EMAIL` - Atlassian account email
- `CONFLUENCE_API_TOKEN` - API token from Atlassian
- `CONFLUENCE_SPACE_KEY` - Target space key
- `CONFLUENCE_PARENT_PAGE_ID` - Parent page ID

### Discord (optional)
- `DISCORD_WEBHOOK_URL` - Webhook URL for notifications

### GitHub Wiki (optional)
- `GITHUB_TOKEN` - Personal access token or Actions token (requires repo scope)

### AI Enhancement (optional)
- `REPOLENS_AI_ENABLED` - Enable AI-powered sections (true/false)
- `REPOLENS_AI_PRESET` - Quick setup preset: `github`, `openai`, `anthropic`, `google` (overrides provider/baseUrl/model)
- `REPOLENS_AI_PROVIDER` - AI provider: `openai_compatible` (default), `anthropic`, `google`, `github`
- `REPOLENS_AI_API_KEY` - API key for AI provider (not needed for `github` provider)
- `REPOLENS_AI_BASE_URL` - API base URL (auto-set per provider; override for custom endpoints)
- `REPOLENS_AI_MODEL` - Model name (e.g., gpt-5-mini, gpt-4o-mini)
- `REPOLENS_AI_TEMPERATURE` - Generation temperature (only sent when explicitly set; omitted by default for GPT-5 compatibility)
- `REPOLENS_AI_MAX_TOKENS` - Max completion tokens per request (default: 2000)

### Telemetry (optional)
- `REPOLENS_TELEMETRY_ENABLED` - Enable Sentry error tracking (true/false)

## Avoid

- ❌ CommonJS (`require`, `module.exports`)
- ❌ Synchronous file operations (use async)
- ❌ Hardcoded paths (use config or auto-discovery)
- ❌ console.log (use logger utilities)
- ❌ Large dependencies (keep bundle small, ~4MB limit)
- ❌ Breaking changes to config schema without migration and `configVersion` bump
- ❌ `npm ci` in CI workflows (use `npm install` — see CI/CD section)
- ❌ `npx @chappibunny/repolens@latest` in CI (use `node bin/repolens.js` for local code)

## Future Enhancements

- Obsidian vault publisher
- Enhanced diff visualization with visual diffs
- VS Code extension for architecture visualization
- Cross-repository architecture analysis
- ~~Plugin system for custom renderers~~ ✅ Shipped in v0.9.0
- ~~GitHub Wiki publisher~~ ✅ Shipped in v1.1.0
- ~~Interactive configuration wizard~~ ✅ Shipped (now default for `repolens init`)
- ~~Watch mode for local development (`repolens watch`)~~ ✅ Shipped
- ~~Generic domain defaults (replace fintech bias)~~ ✅ Shipped in v1.4.0
- ~~Real import-based system map~~ ✅ Shipped in v1.4.0
- ~~AI context size limiting~~ ✅ Shipped in v1.4.0
- ~~Doctor env var validation~~ ✅ Shipped in v1.4.0
- ~~Renderer truncation warnings~~ ✅ Shipped in v1.4.0
- ~~Confluence CDATA injection fix~~ ✅ Shipped in v1.4.0
- ~~Relative link rewriting (Notion + Confluence)~~ ✅ Shipped in v1.4.0
- ~~Document caching (skip-unchanged publishing)~~ ✅ Shipped in v1.5.0
- ~~Structured AI output (JSON mode + schema validation)~~ ✅ Shipped in v1.5.0
- ~~Multi-provider AI (Anthropic, Google Gemini)~~ ✅ Shipped in v1.5.0
- ~~Monorepo workspace detection~~ ✅ Shipped in v1.5.0
- ~~CODEOWNERS integration~~ ✅ Shipped in v1.5.0
