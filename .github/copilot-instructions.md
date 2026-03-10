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
**Version:** 0.6.4  
**Status:** Production-ready, pre-v1.0 stability guarantees  
**License:** MIT  
**Repository:** https://github.com/CHAPIBUNNY/repolens  
**Author:** Charl van Zyl

## Core Value Proposition

RepoLens transforms repositories into documented, understandable systems that serve multiple audiences:
1. **Scanning** - Fast-glob file matching with performance guardrails
2. **Analyzing** - Framework/tool detection + domain inference + flow analysis
3. **Context Building** - Structured artifacts for AI synthesis (no raw code)
4. **AI Synthesis** (Optional) - Natural language explanations for non-technical readers
5. **Rendering** - 11 audience-aware documents (technical + non-technical)
6. **Publishing** - Multi-output delivery (Notion + Confluence + Markdown) with branch-aware safety

## Architecture

### Project Structure

```
bin/
  repolens.js             # CLI entry point
src/
  cli.js                  # Main CLI orchestration + banner
  doctor.js               # Repository validation
  init.js                 # Scaffolding for new repos
  migrate.js              # Workflow migration (legacy → current format)
  core/
    config.js             # Configuration loading and validation
    config-schema.js      # Schema versioning (configVersion: 1)
    diff.js               # Git diff operations
    scan.js               # Repository scanning logic + metadata extraction
  analyzers/
    domain-inference.js   # Business domain mapping from paths
    context-builder.js    # Structured AI context assembly
    flow-inference.js     # Data flow detection via heuristics
  ai/
    provider.js           # Provider-agnostic AI text generation
    prompts.js            # Strict prompt templates preventing hallucination
    document-plan.js      # Canonical document structure definition
    generate-sections.js  # AI-powered section generation with fallbacks
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
    publish.js            # Publishing pipeline + diagram URL validation
  renderers/
    render.js             # System overview, module catalog, API surface, route map
    renderDiff.js         # Architecture diff rendering
    renderMap.js          # System map (Unicode dependency diagrams)
  utils/
    logger.js             # Logging utilities
    retry.js              # Retry logic for API calls (exponential backoff)
    branch.js             # Multi-platform branch detection
    update-check.js       # Version update notifications
    validate.js           # Configuration validation & security
    metrics.js            # Documentation coverage & health scoring
    rate-limit.js         # Token bucket rate limiter for APIs
    secrets.js            # Secret detection & sanitization
    telemetry.js          # Opt-in error tracking (Sentry)
tests/                    # Vitest test suite (90 tests across 11 files)
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
  e2e/
    migration.test.js     # End-to-end migration tests
```

### Key Commands

- `repolens init` - Scaffold configuration and GitHub Actions workflow
- `repolens doctor` - Validate repository setup (config, environment, etc.)
- `repolens publish` - Scan repo, generate docs (with optional AI), publish to outputs
- `repolens migrate` - Migrate legacy workflows to current format
- `repolens feedback` - Send feedback to the RepoLens team
- `repolens version` - Display version
- `repolens help` - Show usage

## Feature Highlights

### AI-Assisted Documentation Intelligence
- **Philosophy**: Not a "flashy code intelligence toy" — a documentation intelligence system for engineers AND stakeholders
- **Two Modes**: Deterministic (default, free, fast) or AI-Enhanced (optional, provider-agnostic)
- **11 Document Types**: 3 non-technical, 4 mixed-audience, 4 technical
- **Zero Hallucination**: AI receives only structured JSON context, never raw code
- **Strict Prompts**: Word limits, required sections, concrete prose, no speculation
- **Provider Agnostic**: OpenAI, Anthropic, Azure, local models (Ollama)
- **Graceful Fallback**: Deterministic docs generated if AI fails or disabled

### Multi-Platform Publishing
- **Notion**: Create/update pages with branch-aware namespacing
- **Confluence**: Atlassian Cloud REST API v1, storage format (HTML-like), Basic Auth (email + API token)
- **Markdown**: Write to `.repolens/` directory
- **Discord**: Rich embed notifications via webhooks (publish metrics, coverage stats)

### Business Domain Inference
- **Purpose**: Map code structure to business functions
- **Default Domains**: Authentication, Market Data, Content, Portfolio, Payments, API Layer, UI/Hooks/State, Utilities
- **Pattern Matching**: Folder/file names to domain keywords (e.g., "auth" → Authentication)
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
- **Coverage**: 90 tests passing across 11 test files
- Run: `npm test`

### Configuration
- Config file: `.repolens.yml` (auto-discovered from cwd or parent directories)
- YAML format with js-yaml parser
- Schema version: `configVersion: 1` (for future migrations)
- Supported publishers: `notion`, `markdown`, `confluence`
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

### AI Enhancement (optional)
- `REPOLENS_AI_ENABLED` - Enable AI-powered sections (true/false)
- `REPOLENS_AI_API_KEY` - API key for AI provider
- `REPOLENS_AI_BASE_URL` - API base URL (default: https://api.openai.com/v1)
- `REPOLENS_AI_MODEL` - Model name (e.g., gpt-4-turbo-preview)
- `REPOLENS_AI_TEMPERATURE` - Generation temperature (default: 0.3)
- `REPOLENS_AI_MAX_TOKENS` - Max tokens per request (default: 2000)

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

- Additional publishers (GitHub Wiki, Obsidian)
- Enhanced diff visualization with visual diffs
- Interactive configuration wizard (`repolens init --interactive`)
- Watch mode for local development (`repolens watch`)
- Plugin system for custom renderers
- GraphQL schema detection
- TypeScript type graph analysis
