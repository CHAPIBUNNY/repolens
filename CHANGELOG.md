# Changelog

All notable changes to RepoLens will be documented in this file.

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