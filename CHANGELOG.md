# Changelog

All notable changes to RepoLens will be documented in this file.

## 1.5.1

### 🐛 Bug Fixes

- **[object Object] rendering fix**: All 6 structured AI renderers now use safe coercion helpers (`safeStr`, `toBulletList`, `toHeadingSections`) that handle strings, arrays, objects, and null values robustly. Prevents `[object Object]` from appearing in Notion/Confluence/Markdown output when AI returns unexpected shapes.

### 🔧 Improvements — Robustness

- **Fetch timeout**: All HTTP requests via `fetchWithRetry` now enforce a 30-second timeout (configurable via `timeoutMs`). Prevents publishers from hanging indefinitely on stalled connections. `AbortError` is converted to a friendly timeout message.
- **Per-document error isolation**: Extended analysis (GraphQL, TypeScript, dependency graph, drift detection) now wraps each phase in try/catch. A failing analyzer no longer blocks the entire doc generation pipeline.
- **Partial-success publishing**: Publisher orchestration no longer throws on the first failure. If Notion fails but Confluence/Markdown succeed, all remaining publishers still run. Failures are logged as warnings. Only throws if *all* publishers fail.

### 📊 Test Coverage

- **251 tests** passing across **18 test files** (up from 224/17).
- New `tests/robustness.test.js` with 27 tests covering: rate limiter, context builder, flow inference, Discord integration, PR comment module, telemetry, write-doc-set file I/O, fetch timeout, doc generation error isolation, and partial-success publishing.

## 1.5.0

### 🚀 New Features (Tier 3 — Differentiation)

- **Document caching**: Hash-based caching skips redundant API calls for unchanged documents. Notion, Confluence, and GitHub Wiki publishers now receive only changed pages; Markdown always gets the full set. Cache persists in `.repolens/doc-hashes.json`.
- **Structured AI output**: AI sections now request JSON-mode responses with schema validation. If JSON parsing or schema validation fails, a single re-prompt is attempted before falling back to plain-text AI, then deterministic generation. All 6 AI document types have JSON schemas and Markdown renderers.
- **Multi-provider AI**: Added native adapters for Anthropic (Messages API) and Google Gemini alongside existing OpenAI-compatible support. Set `REPOLENS_AI_PROVIDER` to `anthropic`, `google`, or `openai_compatible` (default). Azure OpenAI uses the OpenAI-compatible adapter.
- **Monorepo awareness**: Automatic detection of npm/yarn workspaces, pnpm workspaces, and Lerna configurations. Scan results include workspace metadata. System Overview renderer shows package inventory table. AI context includes monorepo structure.
- **CODEOWNERS integration**: Parses `CODEOWNERS` / `.github/CODEOWNERS` / `docs/CODEOWNERS` files. Maps file ownership to modules via last-match-wins pattern matching. Module Catalog now displays an "Owners" column when CODEOWNERS is present. Ownership data is included in artifacts.

### 📊 Test Coverage

- **219 tests** passing across **17 test files** (up from 188/16).
- New `tests/tier3.test.js` with 31 tests covering caching, monorepo detection, CODEOWNERS parsing, multi-provider AI config, and structured output rendering.

## 1.4.0

### 🐛 Bug Fixes (Tier 1 — Production)

- **Confluence CDATA injection**: Code blocks containing `]]>` no longer break Confluence XML storage format. Applied standard CDATA escape pattern (`]]]]><![CDATA[>`).
- **Discord branding**: Replaced 3 leftover "RABITAI" references with "RepoLens" in Discord webhook embeds (title, footer, error title).
- **CLI branding**: Updated 2 remaining "RABITAI" banner strings to "RepoLens" in CLI output and help text.
- **Markdown publisher missing mappings**: Added 9 missing document-type filename mappings (`executive_summary`, `business_domains`, `architecture_overview`, `data_flows`, `developer_onboarding`, `graphql_schema`, `type_graph`, `dependency_graph`, `architecture_drift`). All 15 document plan keys now map to output filenames.
- **Relative link rewriting**: Notion and Confluence publishers now strip relative markdown links (`./path.md`, `../path.md`) that can't resolve in external platforms. Links are replaced with their display text.

### 🔧 Improvements (Tier 2 — Robustness)

- **Generic domain defaults**: Replaced 12 fintech-specific domain hints with 15 universally applicable domains (Authentication, Analytics, Content Management, Search, Notifications, Payments, API Layer, UI Components, Hooks, State, Utilities, Data Layer, Config, Testing, Background Jobs). Domain inference no longer maps "chart" to "Market Data" in non-finance apps.
- **Real import-based system map**: `renderSystemMap()` now uses actual import edges from the dependency graph analyzer when available, instead of heuristic guessing. Diagram labels indicate whether relationships are from "Real import analysis" or "Heuristic inference".
- **AI context size limiting**: Added `truncateContext()` function to AI prompts with a 12K character cap. Progressive pruning: routes/pages to 15, domains to 8, top modules to 10, then hard-truncate. Prevents token overflow on large codebases.
- **Doctor env var validation**: `repolens doctor` now checks for publisher-specific environment variables (NOTION_TOKEN, CONFLUENCE_URL/EMAIL/API_TOKEN, GITHUB_TOKEN, REPOLENS_AI_API_KEY) and warns when required vars are missing for configured publishers.
- **Truncation warnings**: Renderers now display notes when output is truncated — modules >100 in catalog, routes >200 in route map, files/routes >25 and modules >40 in architecture diff.
- **Watch mode tests**: Added 3 new tests for `src/watch.js` covering no-directory handling, watcher setup, and node_modules filtering.

### 📊 Test Coverage

- **188 tests** passing across **16 test files** (up from 185/15).

## 1.3.1

### 📝 Documentation Overhaul

- **README restructured for marketing & onboarding** — 942 → 270 lines. Pain-focused opening, compact feature table, scannable layout. Previously buried the value proposition under spec-sheet detail.
- **New [ONBOARDING.md](ONBOARDING.md)** — Full step-by-step guide extracted from README (publishers, AI, Notion, Confluence, GitHub Wiki, Discord, CI/CD). Previously 350+ lines inside README.
- **Security & Telemetry sections condensed** — ~200 lines of detail replaced with 3-line summaries linking to SECURITY.md and TELEMETRY.md.
- **22-item feature checklist → 8-row "Why RepoLens" table** — Scannable, benefit-focused instead of spec-sheet.
- **Unified documentation table** — All 10 supporting docs linked from one place.
- **Fixed 11 version references** across docs (1.3.0 → 1.3.1).
- **npm version badge** added to README header.

## 1.3.0

### ✨ New Feature: `repolens demo`

- **Zero-config local preview**: New `demo` command generates documentation locally without any API keys or publisher configuration. Works on any repository, even without a `.repolens.yml` — uses sensible default scan patterns.
- **Instant onboarding**: Run `npx @chappibunny/repolens demo` on any repo to see what RepoLens generates. Output written to `.repolens/` directory.
- **Config-aware**: If a `.repolens.yml` exists, demo uses it. Otherwise, defaults to scanning common source patterns (`js`, `ts`, `py`, `go`, `rs`, `java`, etc.) with standard ignore paths.

### 📝 Documentation

- Added demo command to all documentation: README, STABILITY, ROADMAP, copilot-instructions
- Added "Quick Preview" section to README usage guide
- Updated all version references to 1.3.0

## 1.2.0

### ✨ Config Migration

- **`repolens migrate` now patches `.repolens.yml`**: Automatically adds `configVersion: 1` to legacy config files that are missing it. Creates a `.repolens.yml.backup` before modifying. Supports both `.yml` and `.yaml` extensions, dry-run mode, and graceful handling of parse errors or missing configs.

### � Bug Fixes

- **GitHub Wiki empty pages**: Fixed branch mismatch where `git init` created a `main` branch but GitHub Wiki serves from `master`. Now explicitly initializes with `master` and pushes to `refs/heads/master`. Also added content validation to skip pages with empty content.

### �📝 Documentation

- Updated all documentation to reflect v1.2.0 version references
- Updated TROUBLESHOOTING.md with `migrate` auto-fix hint for missing `configVersion`
- Updated KNOWN_ISSUES.md planned improvements (removed shipped features)
- Updated ROADMAP.md with v1.1.0 shipped items

## 1.1.0

### ✨ GitHub Wiki Publisher UX Enhancement

Major upgrade to the wiki output quality — better information hierarchy, audience-aware navigation, and richer page structure.

- **Audience-grouped Home page**: Pages organized by reader (Stakeholders, Engineers, New Contributors, Change Tracking) instead of a flat list
- **Page descriptions**: Each link on Home includes a one-line summary of the page's purpose
- **Status rail**: Home page now shows a metadata table (project, branch, page count, publisher, source)
- **Recommended reading order**: Guided path through the docs for first-time readers
- **Grouped sidebar**: Navigation split into Overview and Architecture sections (plus Custom Pages)
- **Page metadata headers**: Every page gets a `[← Home](Home)` back-link, audience tag, and branch indicator
- **Cleaner footer**: Compact format with branch context and Home link
- **New constants**: `PAGE_DESCRIPTIONS`, `AUDIENCE_GROUPS`, `SIDEBAR_GROUPS`, `PAGE_AUDIENCE`
- **New helpers**: `getPageDisplayTitle()`, `getCustomPageKeys()`, `wikiLink()`, `pageHeader()`

### 🐛 Bug Fixes
- **Temperature still sent to GPT-5**: `DEFAULT_TEMPERATURE = 0.2` always leaked into API requests even after v1.0.1 fixes — the fallback chain (`temperature ?? aiConfig.temperature ?? DEFAULT_TEMPERATURE`) guaranteed it was never `undefined`. Removed the default entirely; temperature is now only sent when explicitly configured via `REPOLENS_AI_TEMPERATURE` env var or `ai.temperature` in config.

## 1.0.1

### 🐛 Bug Fixes
- **GPT-5 API compatibility**: Use `max_completion_tokens` instead of deprecated `max_tokens` parameter
- **GPT-5 temperature handling**: Omit `temperature` from API requests for models that only support the default value (e.g. gpt-5-mini)
- Removed all hardcoded `temperature: 0.2` overrides from AI section generators
- Removed `REPOLENS_AI_TEMPERATURE` from CI workflow and `.env.example`
- Updated `init` scaffolding to omit temperature from default config

### 🔧 Improvements
- Upgraded GitHub Actions: checkout v4.2.2, setup-node v4.2.0, Node.js 22

## 1.0.0

### 🎉 Stable Release

RepoLens v1.0.0 marks the first stable release with a frozen public API. All CLI commands, configuration schema, and plugin interfaces are now covered by semantic versioning guarantees. See [STABILITY.md](STABILITY.md) for the full contract.

### ✨ New Features
- **GitHub Wiki Publisher**: Publish documentation directly to your repository's Wiki tab
  - Git-based: clones wiki repo, writes pages, commits and pushes
  - Generates `Home.md` index, `_Sidebar.md` navigation, `_Footer.md`
  - Branch filtering via `github_wiki.branches` in `.repolens.yml`
  - Auto-detects repository from `GITHUB_REPOSITORY` env or git remote
  - Token sanitization in error messages (never leaks `GITHUB_TOKEN`)
  - Config: `sidebar` and `footer` toggles
  - 17 tests covering publishing, branch filtering, config validation, and security

### 🐛 Bug Fixes
- **GPT-5 API compatibility**: Use `max_completion_tokens` instead of deprecated `max_tokens` parameter
- **GPT-5 temperature handling**: Omit `temperature` from API requests for models that only support the default value (e.g. gpt-5-mini)
- **Git identity in wiki publisher**: Set committer name/email (`RepoLens Bot`) so CI runners can commit
- **Publisher allowlist**: Added `github_wiki` to `validate.js` publisher validation (was only in `config-schema.js`)
- **Doctor false-success**: `repolens doctor` now correctly exits with code 2 when `runDoctor()` reports failures (previously always printed "validation passed")
- **Feedback exit code**: `repolens feedback` now exits with code 1 when feedback fails to send (previously exited 0)
- **Unknown flags**: `repolens --unknown-flag` now prints an error instead of silently running publish
- **scan.ignore security bypass**: Security validator now checks `scan.ignore` patterns (was incorrectly checking non-existent `scan.exclude`)
- **Domains type mismatch**: Both validators now expect `domains` as an object (was array in security validator, object in schema validator)
- **Plugin publisher crash isolation**: Plugin publisher errors are now caught and logged instead of crashing the pipeline

### ✅ Config Stability
- `configVersion: 1` is now **required** (was optional in schema validator)
- Added `confluence` config section validation (branches array)
- Added `ai.temperature` range validation (0–2)
- Added `ai.max_tokens` range validation (>0)
- AI config values from `.repolens.yml` are now used as fallbacks when env vars are not set

### 🔧 Improvements
- Standardized exit codes: `EXIT_SUCCESS=0`, `EXIT_ERROR=1`, `EXIT_VALIDATION=2` as named constants
- Replaced all `console.log`/`console.warn` in production code with logger utilities
- Removed stale "v0.4.0" references from CLI help text and migrate command
- Sentry DSN moved to `REPOLENS_SENTRY_DSN` env var (with backwards-compatible default)
- Hardcoded email in `init` scaffolding replaced with `your-email@example.com` placeholder

### 📄 Documentation
- Added [STABILITY.md](STABILITY.md): Complete public API contract (CLI, config schema, plugin interface, exit codes, env vars)

## 0.9.0

### ✨ New Features
- **Plugin System** (`src/plugins/`): Extensible architecture for custom renderers and publishers
  - `loader.js`: Resolves and imports plugins from local paths or npm packages
  - `manager.js`: `PluginManager` class — registry, getters, and lifecycle hook runner
  - Plugin interface: `register()` → `{ name, version, renderers, publishers, hooks }`
  - **Custom Renderers**: Plugins can register new document types with `render(context)` functions
  - **Custom Publishers**: Plugins can register new output targets with `publish(cfg, renderedPages)` functions
  - **Lifecycle Hooks**: `afterScan`, `afterRender`, `afterPublish` — transform data or trigger side effects
  - Hooks run in plugin load order; errors are caught per-plugin without breaking the pipeline
  - Config: `plugins: ["./my-plugin.js", "@org/repolens-plugin-foo"]` in `.repolens.yml`
  - Config schema updated: `plugins` array validated, custom publisher names accepted

### 🧪 Tests
- Added 21 new plugin tests + 21 publisher parser tests (185 tests across 15 files)

### 🔧 Output Quality
- **Notion Publisher**: Full table support (table blocks with `table_row` children), blockquote → callout, dividers, numbered lists, h3 headings, inline rich text (`**bold**`, `*italic*`, `` `code` ``)
- **Confluence Publisher**: Rewritten as line-by-line parser — proper `<table>` HTML output, blockquotes → info panels, merged `<ul>`/`<ol>` lists, fixed code block HTML entity escaping bug
- **Renderers**: Tables replace bullet-point lists across all 8 renderers, descriptive prose, removed ASCII banner art
- **Fallback Generators**: All 6 deterministic fallbacks rewritten with tables, descriptive paragraphs, and module descriptions

## 0.8.0

### ✨ New Features
- **GraphQL Schema Detection** (`src/analyzers/graphql-analyzer.js`): Detects `.graphql`/`.gql` schema files, inline SDL via gql tagged templates, 11 library patterns (Apollo, Yoga, Mercurius, Nexus, Pothos, type-graphql, Relay, urql, etc.), and resolver patterns. Parses queries, mutations, subscriptions, object types, enums, inputs, interfaces, unions, scalars, and directives.
- **TypeScript Type Graph Analysis** (`src/analyzers/typescript-analyzer.js`): Parses interfaces (with extends), type aliases (with reference extraction), classes (extends + implements), enums, and generic constraints. Builds relationship graph with deduplication, filtering to project-declared types only.
- **Dependency Graph with Cycle Detection** (`src/analyzers/dependency-graph.js`): Parses ES imports, dynamic imports, CommonJS require, and re-exports. Builds directed adjacency graph with cycle detection via iterative DFS (3-color marking). Tracks hub modules, orphan files, and external dependencies.
- **Architecture Drift Detection** (`src/analyzers/drift-detector.js`): Compares current architecture against stored baseline snapshots. Detects changes across 8 categories (modules, APIs, pages, dependencies, frameworks, circular deps, GraphQL types, file count). Categorizes drifts by severity: 🔴 critical, 🟡 warning, 🟢 info. Baselines auto-saved to `.repolens/architecture-baseline.json`.
- **Extended Analysis Renderers** (`src/renderers/renderAnalysis.js`): Markdown renderers for all 4 new document types with tables, Unicode relationship trees, and severity-grouped reports.
- **4 New Document Types**: `graphql_schema`, `type_graph`, `dependency_graph`, `architecture_drift` — bringing total to 15 audience-aware documents.

### 🧪 Tests
- Added 31 new tests for extended analysis features (121 tests across 12 files)

## 0.7.0

### ✨ New Features
- **Interactive Init Wizard**: `repolens init --interactive` — step-by-step configuration wizard with scan presets (Next.js, Express, generic), publisher selection, AI provider setup, and branch filtering
- **Watch Mode**: `repolens watch` — watches source directories for changes and regenerates Markdown docs with 500ms debounce (no API calls)
- **Enhanced Error Messages**: Centralized error catalog with actionable guidance — every error now shows what went wrong, why, and how to fix it
- **Performance Monitoring**: Scan, render, and publish timing summary printed after every `publish` run
- **Coverage Scoring Improvements**: New section completeness metric (12 document types tracked), updated health score weights, and `metrics.json` snapshots saved to `.repolens/`

## 0.6.4

### 🔧 Maintenance
- Removed internal infrastructure branding from user-facing documentation
- Re-published to npm with corrected README and CHANGELOG

## 0.6.3

### ✨ New Features
- **User Feedback**: Added `repolens feedback` CLI command for sending feedback directly to the RepoLens team
  - Interactive prompts for name, email, and message
  - Works even when telemetry is disabled — feedback is always accepted

### 🔧 Maintenance
- Updated version references across all documentation
- Added `feedback` to CLI help and command listings

## 0.6.2

### 🐛 Bug Fixes
- **CI/CD**: Fixed release workflow failing with `Cannot find module @rollup/rollup-linux-x64-gnu`
  - Root cause: macOS-generated `package-lock.json` doesn't resolve Linux platform-specific optional dependencies
  - Fix: Changed all CI install steps to `rm -rf node_modules package-lock.json && npm install`
  - Applied to both `publish-docs.yml` and `release.yml` workflows

### 🔧 Maintenance
- Updated version references across codebase
- Updated test assertions for version 0.6.2

## 0.6.1

### 🐛 Bug Fixes
- **Confluence Publisher**: Fixed `version` showing as `[object Object]1`
  - Root cause: `existingPage.version` was the full version object, not just the number
  - Fix: Normalize version to use cached structure with extracted version number
- **Confluence Publisher**: Fixed code block formatting in storage format
  - Implemented 3-step extract→convert→restore pipeline
  - Properly handles fenced code blocks in Markdown→Confluence conversion

### 📦 Package
- Renamed npm package from `@rabitai/repolens` to `@chappibunny/repolens`
- Updated all references across codebase, workflows, and documentation
- Published to npm registry under new scope

## 0.6.0 (Team Features & Observability)

### ✨ New Features

**Discord Integration** (`src/integrations/discord.js`):
- Rich embed notifications with coverage, health score, and change metrics
- Threshold-based notifications (default: >10% change)
- Branch filtering with glob pattern support
- Secure webhook configuration via `DISCORD_WEBHOOK_URL` environment variable
- Color-coded embeds: success (green), warning (yellow), error (red), info (blue)

**Metrics Collection System** (`src/utils/metrics.js`):
- Coverage calculation: weighted average (modules 50%, APIs 30%, pages 20%)
- Health score algorithm: 0-100 rating (40% coverage + 30% freshness + 30% quality)
- Staleness detection: flags documentation >90 days old
- Quality analysis: identifies undocumented modules/APIs/pages with severity levels
- Historical tracking: persists metrics to `.repolens/metrics-history.json`
- Trend indicators: up/down/stable trend detection (>1% threshold)

**Configuration Extensions** (`src/core/config-schema.js`):
- Discord configuration: `discord.notifyOn`, `discord.significantThreshold`, `discord.branches`, `discord.enabled`

**Publishing Integration** (`src/publishers/index.js`):
- Automatic metrics collection after publishing
- Discord notifications sent after successful publish (if configured)
- Branch-aware notification filtering
- Graceful error handling (doesn't fail publish if notifications fail)

## 0.5.0 (Phase 3: Security Audit)

### 🔒 Security Hardening

**Security Utilities** (1,296 lines of new code):
- **Secrets Detection** (`src/utils/secrets.js`):
  * Detects 15+ secret patterns (OpenAI, GitHub, AWS, Notion, etc.)
  * Entropy-based heuristic detection for unknown patterns
  * Automatic sanitization in all logger and telemetry output
  * Functions: `detectSecrets()`, `sanitizeSecrets()`, `isLikelySecret()`
  
- **Config Validation** (`src/utils/validate.js`):
  * Validates configuration against injection attacks
  * Detects: directory traversal, shell injection, command substitution
  * Scans config tree for accidentally included secrets
  * Circular reference handling with depth limit
  * Path validation preventing `..` and absolute paths
  
- **Rate Limiting** (`src/utils/rate-limit.js`):
  * Token bucket algorithm (3 req/sec for Notion and AI APIs)
  * Exponential backoff with jitter (3 retries)
  * Wrapper functions: `executeNotionRequest()`, `executeAIRequest()`
  * Batch request processing

**Runtime Integration**:
- Config loader validates all inputs before loading
- Logger sanitizes all console output automatically
- Telemetry sanitizes error messages before sending to Sentry
- All Notion API calls rate-limited to 3 req/sec
- All AI API calls rate-limited to 3 req/sec

**GitHub Actions Hardening**:
- Actions pinned to commit SHAs (supply chain protection)
- Minimal permissions (`contents: read` or `contents: write` only)
- Security job with npm audit and secrets scanning
- Fail-early strategy on security issues

**Comprehensive Testing**:
- 43 new security tests (fuzzing, injection, boundary conditions)
- Total: 90 tests passing (47 main + 43 security)
- Attack vectors tested: SQL injection, command injection, path traversal, YAML bomb, NoSQL, LDAP, XML injection

**Documentation**:
- New `SECURITY.md` with threat model and security features
- Updated `README.md` with security section
- Updated `PRODUCTION_CHECKLIST.md` with security validation
- Security badge in README

### 📊 Testing
- All 90 tests passing
- 0 vulnerabilities in dependencies (519 packages audited)

## 0.4.3

### 🐛 Bug Fixes
- **Migration Tool**: Fixed over-aggressive npm install removal
  - Now only removes `npm install/ci` from legacy `cd tools/repolens` multi-line blocks
  - Preserves legitimate dependency installation steps in release workflows
  - Fixes YAML corruption that broke workflows with standalone npm ci/install steps
  - Added test case to verify legitimate npm install steps are preserved

## 0.4.2

### 🐛 Bug Fixes
- **Migration Tool**: Fixed duplicate `run:` keys issue when adding environment variables
  - Updated pattern to capture and preserve existing run command
  - Properly positions `env:` block before `run:` with correct indentation
  - Fixes GitHub Actions validation error: "'run' is already defined"
  - Added test case to prevent regression

## 0.4.1

### ✨ New Features

**Migration Command**:
- Added `repolens migrate` command to automatically upgrade workflow files from legacy formats to v0.4.0+
- Auto-detects legacy patterns: `cd tools/repolens`, missing `@latest` suffix, missing Node.js setup, missing environment variables
- Shows preview diff of changes before applying
- Creates backup files (*.backup) for safety
- Supports `--dry-run` flag to preview changes without applying
- Supports `--force` flag to skip interactive confirmation
- Handles multiple workflow files in `.github/workflows/`
- Comprehensive test coverage (7 test cases)

**Migration Detection**:
- Detects outdated `cd tools/repolens` directory changes
- Detects `npx repolens` without `@latest` suffix
- Detects missing `actions/setup-node@v4` setup
- Detects missing environment variables (NOTION_TOKEN, REPOLENS_AI_API_KEY)
- Migrates to `@chappibunny/repolens` scoped package
- Automatically adds AI environment variables to existing env sections
- Skips already-migrated workflows (no-op when up to date)

**Documentation**:
- Added comprehensive migration section to [MIGRATION.md](MIGRATION.md)
- Updated [README.md](README.md) with migration instructions
- Added migration examples to CLI help text
- Updated [RELEASE.md](RELEASE.md) with correct workflow format

### 🐛 Bug Fixes
- Fixed outdated workflow format in RELEASE.md that caused `cd: tools/repolens: No such file or directory` errors

### 📚 Documentation
- Prominently documented workflow migration in MIGRATION.md
- Added troubleshooting section for common migration issues
- Clarified v0.3.0 → v0.4.0 upgrade path
- Added step-by-step migration guide for existing users

---

## 0.4.0

### 💥 Breaking Changes
- **Major architectural transformation**: RepoLens is now an AI-assisted documentation intelligence system
- **New document types**: Added 6 new audience-aware documents (11 total, formerly 6)
- **Three-layer architecture**: deterministic extraction → structured artifacts → AI synthesis
- **Config schema changes**: New sections added: `features`, `ai`, `documentation`, `domains`
- **Default behavior unchanged**: AI features are opt-in via environment variables (deterministic mode by default)

### ✨ New Features - AI-Assisted Documentation

**Multi-Audience Documentation**:
- **Executive Summary**: Non-technical project overview for leadership (500 words)
- **Business Domains**: Functional area descriptions readable by all stakeholders (150 words per domain)
- **Architecture Overview**: Layered technical analysis for engineers (600 words)
- **Data Flows**: How information moves through the system (200 words per flow)
- **Developer Onboarding**: Getting started guide for new contributors (800 words)
- **Change Impact**: Architecture diff with natural language context

**AI Integration**:
- Provider-agnostic design works with any OpenAI-compatible API
- Supported providers: OpenAI (GPT-4, GPT-3.5), Anthropic Claude, Azure OpenAI, local models (Ollama)
- Configurable temperature, max tokens, timeout, and model selection
- Non-blocking AI calls with graceful timeout handling
- Zero hallucination policy: AI receives only structured JSON context, never raw code
- Strict prompts prevent fabrication and enforce word limits

**Intelligent Analysis**:
- **Domain Inference**: Automatically maps folders/files to business domains (Authentication, Market Data, Content, etc.)
- **Context Builder**: Extracts structured artifacts for AI synthesis (no raw code sent to AI)
- **Flow Inference**: Detects major data flows through heuristic pattern matching
- **Deterministic Fallback**: Always generates documentation even if AI unavailable or disabled

**Document Orchestration**:
- New document generation pipeline: scan → generateDocumentSet → writeDocumentSet → publish
- Artifacts saved as JSON in `.repolens/artifacts/` for inspection and debugging
- Backward compatible: Builds legacy renderedPages format for existing Notion integrations

### 🎨 Improvements

**Configuration**:
- New `features` section enables/disables specific documents
- New `ai` section controls AI behavior (enabled, mode, temperature, max_tokens)
- New `documentation` section configures output directory and artifacts
- New `domains` section defines custom business domain mappings
- Extended `SUPPORTED_PAGE_KEYS` with new document types
- All new sections optional for backward compatibility

**Environment Variables**:
- `REPOLENS_AI_ENABLED`: Enable/disable AI features (default: false)
- `REPOLENS_AI_API_KEY`: API key for AI provider
- `REPOLENS_AI_BASE_URL`: Custom provider endpoint (default: OpenAI)
- `REPOLENS_AI_MODEL`: Model to use (default: gpt-4-turbo-preview)
- `REPOLENS_AI_TEMPERATURE`: Creativity level 0.0-1.0 (default: 0.3)
- `REPOLENS_AI_MAX_TOKENS`: Token limit per request (default: 2000)
- `REPOLENS_AI_TIMEOUT_MS`: Request timeout (default: 30000ms)

**Documentation**:
- Created comprehensive AI.md guide (350+ lines)
- Added .env.example with all environment variables documented
- Added .repolens.example.yml with complete configuration examples
- Updated README.md with AI features onboarding
- Cost estimates provided for different repo sizes
- Provider setup guides for OpenAI, Anthropic, Azure, local models

**Cost Management**:
- Configurable token limits prevent runaway costs
- Selective document generation (enable only what you need)
- Usage tips in documentation for cost optimization
- Estimates: Small repos $0.10-$0.30, Medium $0.30-$0.80, Large $0.80-$2.00 per run

### 🔧 Technical Changes

**New Modules**:
- `src/analyzers/domain-inference.js` (155 lines): Business domain mapping from paths
- `src/analyzers/context-builder.js` (145 lines): Structured AI context assembly
- `src/analyzers/flow-inference.js` (185 lines): Data flow detection via heuristics
- `src/ai/provider.js` (130 lines): Provider-agnostic AI text generation
- `src/ai/prompts.js` (280 lines): Strict prompt templates preventing hallucination
- `src/ai/document-plan.js` (95 lines): Canonical document structure definition
- `src/ai/generate-sections.js` (240 lines): AI-powered section generation with fallbacks
- `src/docs/generate-doc-set.js` (95 lines): Document generation orchestration
- `src/docs/write-doc-set.js` (75 lines): Write documentation set to disk with artifacts

**Modified Modules**:
- `src/cli.js`: Updated publish flow to use new document generation pipeline
- `src/core/config-schema.js`: Extended validation for new config sections

**Testing**:
- All 32 existing tests passing
- No breaking changes to existing functionality
- Deterministic mode extensively tested

### 📦 Package Changes
- Total additions: 2116+ lines of production code
- New files: 10 (analyzers, AI layer, docs orchestration)
- Modified files: 4 (cli, config schema, documentation)
- Zero new runtime dependencies (uses existing node-fetch, fs, path)
- Optional AI features add no bundle weight when disabled

### 🎯 Philosophy Shift

RepoLens is no longer just a "flashy code intelligence toy" — it's now a **documentation intelligence system** that serves both engineers and stakeholders:

- **Engineers** get technical architecture docs with code-level detail
- **Product/Ops/Leadership** get readable system docs explaining what the code does
- **Deterministic by default** ensures reliability and zero cost baseline
- **AI-enhanced optionally** adds natural language explanations when needed
- **Zero hallucination** via structured context and strict prompts
- **Provider flexibility** prevents vendor lock-in

## 0.3.0

### 💥 Breaking Changes
- **Removed Mermaid diagram system**: Replaced complex SVG/mermaid.ink pipeline with simple Unicode architecture diagrams
- System map now renders as beautiful ASCII art using box-drawing characters
- No longer requires 50MB @mermaid-js/mermaid-cli dependency
- No longer generates or commits SVG files to repository
- Diagrams now always work reliably in Notion and Markdown without external dependencies

### ✨ New Features
- **Automatic update notifications**: CLI checks for new versions and notifies users
- **Version checking in doctor command**: `repolens doctor` now shows if updates are available
- **24-hour cache**: Update checks cached to avoid excessive npm registry calls
- **Non-blocking**: Update check runs in background, doesn't slow down commands

### 🎨 Improvements
- **Unicode Architecture Diagrams**: Clean, always-working diagrams with emoji icons (🎯, ⚙️, 📋, 🔌, 🛠️, ✅, 📦)
- **Simpler workflow**: Removed Mermaid CLI installation and SVG commit steps from GitHub Actions
- **Faster publishing**: No SVG generation or git operations needed
- **Better reliability**: No URL length limits, no image loading issues, no external service dependencies
- **Interactive credential collection**: `repolens init` now prompts for Notion credentials and auto-creates .env file
- **Smart CI detection**: Prompts skip in CI but work via npx

### 🔧 Technical Changes
- Added `src/utils/update-check.js` with version comparison logic
- Integrated update checking at CLI startup (non-blocking)
- Enhanced doctor command with forced version checking
- Simplified `renderSystemMap()` to return plain markdown with Unicode diagrams
- Removed `generateMermaidImageUrl()`, `prepareDiagramUrl()`, and mermaid.ink fallback logic
- Simplified `replacePageContent()` in notion.js - no longer handles image embedding
- Simplified markdown publisher - no longer generates SVG files
- Cleaned up GitHub Actions workflow - removed write permissions and diagram commits

### 📦 Package Changes
- Removed test artifacts from repository (cleaner npm package)
- Updated .gitignore to exclude test files
- Simplified workflow template to use `npx @chappibunny/repolens@latest`

## 0.2.0

- Added interactive credential collection to `repolens init`
- Improved documentation clarity for non-technical users
- Added emoji icons to all documentation pages
- Auto-detection of Notion secrets for seamless publishing
- Branch-aware publishing with title namespacing
- URL length validation for Notion image embeds
- Package.json metadata extraction for tech stack detection

## 0.1.1

- Initial RepoLens CLI
- Added `init` command
- Added `doctor` command
- Added `publish` command
- Added `version` and `help` commands
- Added Notion publisher
- Added Markdown publisher
- Added route map generation
- Added system map generation
- Added architecture diff generation
- Added PR comment publishing
- Added repo structure autodetection in `init`
- Added `.env.example` generation
- Added `README.repolens.md` generation
- Added test coverage for config, init, doctor, markdown publisher, and CLI