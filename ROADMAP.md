# RepoLens Roadmap

This document outlines the development path for RepoLens — what's shipped, what's next, and where we're headed.

**Current Version:** 1.0.0  
**npm Package:** `@chappibunny/repolens`  
**Last Updated:** March 2026

---

## What's Shipped (v0.1.0 → v0.9.0)

Everything below is live, tested, and available on npm.

### Core CLI (v0.1.0 – v0.2.0)
- ✅ `init`, `doctor`, `publish`, `migrate`, `feedback`, `version`, `help` commands
- ✅ Auto-discovery of `.repolens.yml` from cwd or parent directories
- ✅ Repository scanning with fast-glob + performance guardrails (warn at 10k, fail at 50k files)
- ✅ Package.json metadata extraction (tech stack, dependencies)
- ✅ Branch-aware publishing with title namespacing
- ✅ Unicode architecture diagrams (replaced Mermaid CLI)

### Multi-Platform Publishing (v0.3.0 – v0.6.0)
- ✅ **Markdown** — Write to `.repolens/` directory
- ✅ **Notion** — Create/update pages via Notion API with branch filtering
- ✅ **Confluence** — Atlassian Cloud REST API v1, storage format, Basic Auth
- ✅ **Discord** — Rich embed webhook notifications (publish metrics, coverage)

### AI-Assisted Documentation Intelligence (v0.4.0 – v0.5.0)
- ✅ 11 audience-aware documents (3 non-technical, 4 mixed, 4 technical)
- ✅ Provider-agnostic AI (OpenAI, Anthropic, Azure, Ollama/local models)
- ✅ Zero-hallucination architecture: structured JSON context only, never raw code
- ✅ Strict prompt templates with word limits and evidence-based reasoning
- ✅ Graceful fallback to deterministic docs if AI fails or is disabled

### Business Domain & Data Flow Analysis (v0.4.0 – v0.5.0)
- ✅ 12 default business domain mappings (Authentication, Market Data, Payments, etc.)
- ✅ Custom domain definitions in `.repolens.yml`
- ✅ Heuristic-based data flow detection (4 flow types)
- ✅ Change impact analysis from git diffs

### Security & Reliability (v0.4.0 – v0.6.0)
- ✅ Secret detection (15+ patterns: OpenAI, GitHub, AWS, Notion, etc.)
- ✅ Input validation with injection prevention (shell, path traversal, command substitution)
- ✅ Rate limiting (token bucket, 3 req/s for APIs)
- ✅ Exponential backoff retry logic
- ✅ Opt-in telemetry with secret sanitization
- ✅ CI security gates (dependency audit + secret scanning)
- ✅ 163 tests across 14 test files (including 43 security/fuzzing tests)

### CI/CD & npm Publishing (v0.5.0 – v0.6.4)
- ✅ GitHub Actions: `publish-docs.yml` (every push) + `release.yml` (tag-based)
- ✅ npm registry publishing (`npm publish --access public`)
- ✅ Workflow migration tool (`repolens migrate`)
- ✅ Cross-platform CI fix for optional dependency resolution
- ✅ User feedback via `repolens feedback` command

### Polish & Reliability (v0.7.0)
- ✅ Interactive configuration wizard (`repolens init --interactive`)
- ✅ Watch mode for local development (`repolens watch`)
- ✅ Enhanced error messages with actionable guidance (centralized error catalog)
- ✅ Performance monitoring (scan/render/publish timing summary)
- ✅ Documentation coverage scoring improvements (section completeness, metrics.json snapshots)

### Extended Analysis (v0.8.0)
- ✅ GraphQL schema detection (schema files, inline SDL, 11 library patterns, resolver detection)
- ✅ TypeScript type graph analysis (interfaces, type aliases, classes, enums, relationship graph)
- ✅ Dependency graph with cycle detection (ES/CJS imports, iterative DFS, hub/orphan analysis)
- ✅ Architecture drift detection (8 categories, severity levels, baseline snapshots)
- ✅ 4 new document types (graphql_schema, type_graph, dependency_graph, architecture_drift)
- ✅ 163 tests across 14 test files

### Plugin System (v0.9.0)
- ✅ Plugin loader: resolve local paths and npm packages
- ✅ Plugin manager: registry, getters, lifecycle hook runner
- ✅ Custom renderers: plugins register new document types with `render(context)` functions
- ✅ Custom publishers: plugins register new output targets with `publish(cfg, renderedPages)` functions
- ✅ Lifecycle hooks: `afterScan`, `afterRender`, `afterPublish` with chained transforms
- ✅ Config support: `plugins` array in `.repolens.yml`
- ✅ 163 tests across 14 test files

---

## v1.0.0 — Stable Release ✅

**Shipped.** Tagged and published to npm.

**Stability Audit:**
- ✅ CLI commands and flags frozen (see [STABILITY.md](STABILITY.md))
- ✅ `.repolens.yml` schema v1 frozen with validation
- ✅ Plugin interface frozen (`register()` → renderers, publishers, hooks)
- ✅ Exit code contract: 0 success, 1 error, 2 validation failure
- ✅ Semantic versioning with breaking change guarantees

**Bug Fixes:**
- ✅ Doctor false-success: now exits code 2 on failure
- ✅ Feedback exit code: exits 1 on send failure
- ✅ Unknown flags no longer silently run publish
- ✅ `scan.ignore` security bypass fixed
- ✅ Domains type mismatch aligned across validators
- ✅ Plugin publisher errors caught instead of crashing pipeline

**Config Stability:**
- ✅ `configVersion: 1` now required
- ✅ Confluence config section validation added
- ✅ AI temperature range 0–2, max_tokens must be >0
- ✅ AI config YAML values used as fallback for env vars

**Improvements:**
- ✅ Standardized exit codes (`EXIT_SUCCESS`/`ERROR`/`VALIDATION`)
- ✅ `console.log`/`warn` replaced with logger in all prod code
- ✅ Sentry DSN moved to `REPOLENS_SENTRY_DSN` env var
- ✅ Default AI model migrated to `gpt-5-mini` (deprecated GPT-4 models removed)

---

## v1.1.0+ — Growth & Scale

### Publishers
- [ ] GitHub Wiki publisher
- [ ] Obsidian vault publisher

### Integrations
- [ ] VS Code extension for in-editor architecture visualization
- [ ] GitHub App for automated setup and status checks
- [ ] Slack notifications
- [ ] Custom webhook support

### Analysis
- [ ] Cross-repository architecture analysis
- [ ] Monorepo-aware module detection
- [ ] Security boundary validation

### Developer Experience
- [ ] Interactive HTML documentation output
- [ ] Architecture decision records (ADR) generation

---

## Feature Requests

Have a feature request? Open an issue on [GitHub](https://github.com/CHAPIBUNNY/repolens/issues) with the `enhancement` label.

---

## Contributing

RepoLens welcomes contributions. See the README for development setup instructions.

For questions or discussions, open a GitHub issue or contact the maintainers.
