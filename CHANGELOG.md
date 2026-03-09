# Changelog

All notable changes to RepoLens will be documented in this file.

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
- Simplified workflow template to use `npx repolens@latest`

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