# RepoLens Roadmap

This document outlines the planned development path for RepoLens.

## Current Status: v0.2.x — Early Access

Core functionality is complete and stable. Focus is on schema stability, testing, and adoption.

---

## v0.3.0 — Enhanced Analysis

**Target**: Q2 2026

- **Dependency Graph Visualization** - Generate module dependency graphs with cycle detection
- **Architecture Drift Detection** - Compare current architecture against reference snapshots
- **Custom Renderer Plugins** - Allow users to define custom documentation renderers
- **Enhanced API Detection** - Support GraphQL schemas, tRPC, and gRPC definitions

---

## v0.4.0 — Intelligence Layer

**Target**: Q3 2026

- **Service Boundary Inference** - Automatically detect microservice boundaries
- **Architecture Recommendations** - Suggest improvements based on best practices
- **Complexity Metrics** - Calculate and track architectural complexity scores
- **Change Impact Analysis** - Predict which modules are affected by changes

---

## v1.0.0 — Stable Release

**Target**: Q4 2026

**Stability Guarantees:**
- ✅ Stable CLI commands and flags
- ✅ Stable `.repolens.yml` schema (v1)
- ✅ Stable publisher interface
- ✅ Comprehensive integration test suite
- ✅ Migration guides for any breaking changes

**Additional Features:**
- **npm Registry Publishing** - Available via `npm install -g repolens`
- **VS Code Extension** - In-editor architecture visualization
- **GitHub App** - Automated setup and status checks
- **Plugin Ecosystem** - Third-party renderer and publisher support

---

## v1.1.0+ — Growth & Scale

**Post-v1.0 Features:**

### Documentation
- Interactive HTML documentation output
- Architecture decision records (ADR) generation
- API changelog generation

### Analysis
- Cross-repository architecture analysis
- Monorepo-aware module detection
- Security boundary validation

### Integration
- Confluence publisher
- GitHub Wiki publisher
- Slack notifications
- Custom webhook support

### Developer Experience
- Interactive configuration wizard
- Watch mode for local development
- Performance profiling and optimization
- Architecture testing framework

---

## Feature Requests

Have a feature request? Open an issue on [GitHub](https://github.com/CHAPIBUNNY/repolens/issues) with the `enhancement` label.

---

## Contributing

RepoLens is currently in early access. As we approach v1.0, we'll open up contribution guidelines.

For questions or discussions, contact the maintainers.
