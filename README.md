```
    ██████╗ ███████╗██████╗  ██████╗ ██╗     ███████╗███╗   ██╗███████╗
    ██╔══██╗██╔════╝██╔══██╗██╔═══██╗██║     ██╔════╝████╗  ██║██╔════╝
    ██████╔╝█████╗  ██████╔╝██║   ██║██║     █████╗  ██╔██╗ ██║███████╗
    ██╔══██╗██╔══╝  ██╔═══╝ ██║   ██║██║     ██╔══╝  ██║╚██╗██║╚════██║
    ██║  ██║███████╗██║     ╚██████╔╝███████╗███████╗██║ ╚████║███████║
    ╚═╝  ╚═╝╚══════╝╚═╝      ╚═════╝ ╚══════╝╚══════╝╚═╝  ╚═══╝╚══════╝
                        Repository Intelligence CLI
```

[![npm version](https://img.shields.io/npm/v/@chappibunny/repolens)](https://www.npmjs.com/package/@chappibunny/repolens)
[![VS Code Extension](https://img.shields.io/visual-studio-marketplace/v/CHAPIBUNNY.repolens-architecture?label=VS%20Code)](https://marketplace.visualstudio.com/items?itemName=CHAPIBUNNY.repolens-architecture)
[![Tests](https://img.shields.io/badge/tests-185%20passing-brightgreen)](https://github.com/CHAPIBUNNY/repolens/actions)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

**Your architecture docs are already outdated.** RepoLens fixes that.

RepoLens scans your repository, generates living architecture documentation, and publishes it to Notion, Confluence, GitHub Wiki, or Markdown — automatically on every push. Engineers get technical docs. Stakeholders get readable system overviews. Nobody writes a word.

> Stable as of v1.0 — [API guarantees](STABILITY.md) · [Security hardened](SECURITY.md) · v1.5.0

---

## 🎬 Demo

> **Try it now** — no installation required. Run `npx @chappibunny/repolens demo` on any repo for an instant local preview.

[![RepoLens Demo](https://img.youtube.com/vi/Lpyg0dGsiws/maxresdefault.jpg)](https://youtu.be/Lpyg0dGsiws)

▶️ *Click to watch on YouTube*

---

## 🚀 Quick Start (60 seconds)

**Step 1: Install**
```bash
npm install @chappibunny/repolens
```

**Step 2: Initialize** (creates config + GitHub Actions workflow)
```bash
npx @chappibunny/repolens init
```

**Step 3: Configure Publishing** (optional, skip if using Markdown only)

For Notion:
```bash
# Edit .env and add:
NOTION_TOKEN=secret_xxx
NOTION_PARENT_PAGE_ID=xxx
```

For Confluence:
```bash
# Edit .env and add:
CONFLUENCE_URL=https://your-company.atlassian.net/wiki
CONFLUENCE_EMAIL=your-email@example.com
CONFLUENCE_API_TOKEN=your-token
CONFLUENCE_SPACE_KEY=DOCS
```

**Step 4: Publish**
```bash
npx @chappibunny/repolens publish
```

**Done!** Your docs are now live in Notion, Confluence, and/or `.repolens/` directory.

**🔄 Upgrading from v0.3.0 or earlier?**
Run `npx @chappibunny/repolens migrate` to automatically update your workflow files. See [MIGRATION.md](MIGRATION.md) for details.

---

## 📋 What It Generates

**11 document types** for three audiences — no manual writing required:

| Audience | Documents |
|---|---|
| **Stakeholders** (founders, PMs, ops) | Executive Summary · Business Domains · Data Flows |
| **Everyone** | System Overview · Developer Onboarding · Change Impact |
| **Engineers** | Architecture Overview · Module Catalog · API Surface · Route Map · System Map |

**Two modes:** Deterministic (free, fast, always works) or AI-Enhanced (optional — OpenAI, Anthropic, Azure, Ollama).

---

## ✨ Why RepoLens

| | |
|---|---|
| 🤖 **Autonomous** | Runs on every push via GitHub Actions — docs stay evergreen |
| 👥 **Multi-Audience** | Technical docs + stakeholder-readable overviews from one scan |
| 📤 **Multi-Publisher** | Notion, Confluence, GitHub Wiki, Markdown — or all four at once |
| 🧠 **AI-Assisted** | Optional AI with zero-hallucination policy (structured context only) |
| 🔍 **Smart Detection** | Frameworks, domains, data flows, dependencies, drift — all automatic |
| 🔌 **Extensible** | Plugin system for custom renderers, publishers, and hooks |
| 🛡️ **Secure** | Secret detection, injection prevention, rate limiting, supply chain hardening |
| ⚡ **Fast** | Handles repos up to 50k files with performance guardrails |

---

## 📦 Installation

```bash
npm install @chappibunny/repolens
```

Or try instantly without installing: `npx @chappibunny/repolens demo`

For alternative methods, see [INSTALLATION.md](INSTALLATION.md).

---

## 🎨 VS Code Extension

**View your architecture directly in VS Code** — browse modules, visualize dependencies, and explore your codebase structure without leaving the editor.

**Install from Marketplace:**
```
ext install CHAPIBUNNY.repolens-architecture
```

[**→ Get it on Visual Studio Marketplace**](https://marketplace.visualstudio.com/items?itemName=CHAPIBUNNY.repolens-architecture)

**Features:**
- 🏗️ **Architecture Explorer** — Tree view of your system structure
- 📊 **Dependency Visualizer** — Interactive dependency graphs
- 📁 **Module Browser** — Navigate modules by domain and function
- 🔍 **Command Palette** — Quick access to architecture insights
- 📈 **System Metrics** — Real-time architecture health indicators

The extension reads your `.repolens.yml` configuration and provides an interactive UI for exploring the documentation that RepoLens generates.

---

## 🎓 Onboarding Guide

Step-by-step setup for publishers, AI features, Notion, Confluence, GitHub Wiki, Discord, and CI/CD automation.

**[→ Full Onboarding Guide](ONBOARDING.md)**

---

## 🎮 Commands

| Command | Description |
|---|---|
| `repolens init` | Scaffold config + GitHub Actions workflow |
| `repolens init --interactive` | Step-by-step configuration wizard |
| `repolens publish` | Scan, generate, and publish documentation |
| `repolens demo` | Quick local preview — no API keys needed |
| `repolens doctor` | Validate your setup |
| `repolens watch` | Auto-regenerate docs on file changes |
| `repolens migrate` | Upgrade from v0.3.0 workflows ([details](MIGRATION.md)) |
| `repolens feedback` | Send feedback to the team |

---

## 📸 Example Output

### System Map with Dependencies

```mermaid
graph LR
    CLI[bin/repolens<br/>1 file] --> Core[src/core<br/>4 files]
    Publishers[src/publishers<br/>6 files] --> Core
    Publishers --> Renderers[src/renderers<br/>4 files]
    Publishers --> Utils[src/utils<br/>10 files]
    Renderers --> Core
    Delivery[src/delivery<br/>1 file] --> Publishers
    Tests[tests<br/>15 files] -. tests .-> CLI
    Tests -. tests .-> Core
    Tests -. tests .-> Publishers
    
    style CLI fill:#9b59b6,color:#fff
    style Core fill:#f39c12,color:#000
    style Publishers fill:#27ae60,color:#fff
    style Renderers fill:#27ae60,color:#fff
    style Delivery fill:#16a085,color:#fff
    style Utils fill:#95a5a6,color:#000
    style Tests fill:#e67e22,color:#fff
```

### System Overview (Technical Profile)

Generated from your `package.json`:

```markdown
## Technical Profile

**Tech Stack**: Next.js, React  
**Languages**: TypeScript  
**Build Tools**: Vite, Turbo  
**Testing**: Vitest, Playwright  
**Architecture**: Medium-sized modular structure with 42 modules  
**API Coverage**: 18 API endpoints detected  
**UI Pages**: 25 application pages detected  
```

### Architecture Diff in PRs

When you open a pull request, RepoLens posts:

```markdown
## 📐 Architecture Diff

**Modules Changed**: 3
**New Endpoints**: 2
**Routes Modified**: 1

### New API Endpoints
- POST /api/users/:id/verify
- GET /api/users/:id/settings

### Modified Routes
- /dashboard → components/Dashboard.tsx (updated)
```

---

## 🔒 Privacy & Security

- **Telemetry is opt-in and disabled by default** — no code, secrets, or personal data leaves your machine. See [TELEMETRY.md](TELEMETRY.md).
- **Defense-in-depth security** — input validation, secret detection (15+ patterns), rate limiting, injection prevention, supply chain hardening. See [SECURITY.md](SECURITY.md).
- **Report vulnerabilities** to trades@rabitaitrades.com (not public issues). Response within 48 hours.

---

## 📚 Documentation

| Guide | Description |
|---|---|
| [Onboarding Guide](ONBOARDING.md) | Step-by-step setup: publishers, AI, Notion, Confluence, Discord |
| [Configuration](CONFIGURATION.md) | Complete `.repolens.yml` schema and examples |
| [Environment Variables](ENVIRONMENT.md) | All env vars by publisher and feature |
| [Architecture](ARCHITECTURE.md) | Pipeline diagram, project structure |
| [Development](DEVELOPMENT.md) | Setup, tests (185 across 15 files), release process |
| [Security](SECURITY.md) | Threat model, secret detection, validation layers |
| [Telemetry](TELEMETRY.md) | Opt-in privacy-first usage analytics |
| [Troubleshooting](TROUBLESHOOTING.md) | Common issues and fixes |
| [Migration](MIGRATION.md) | Upgrading from v0.3.0 or earlier |
| [Stability](STABILITY.md) | API contract and semver guarantees |

---

## 🤝 Contributing

**Ways to help:**
- **Try it out**: Install and use in your projects
- **Report issues**: Share bugs, edge cases, or UX friction
- **Request features**: Tell us what's missing
- **Build plugins**: Extend RepoLens with custom renderers and publishers
- **Share feedback**: `repolens feedback`

---

## 🗺️ Roadmap

v1.0+ features complete — CLI, config schema, and plugin interface are frozen.

**Completed:**
- [x] VS Code extension ([available on Marketplace](https://marketplace.visualstudio.com/items?itemName=CHAPIBUNNY.repolens-architecture))

**Next:**
- [ ] Obsidian publisher
- [ ] GitHub App

See [ROADMAP.md](ROADMAP.md) for detailed planning.

---

## 📄 License

MIT

---

## 💬 Support & Contact

- **Troubleshooting**: [TROUBLESHOOTING.md](TROUBLESHOOTING.md) — installation, config, publishing, AI, and CI/CD issues
- **Diagnostics**: Run `npx @chappibunny/repolens doctor` to validate your setup
- **Issues**: [GitHub Issues](https://github.com/CHAPIBUNNY/repolens/issues)
- **Discussions**: [GitHub Discussions](https://github.com/CHAPIBUNNY/repolens/discussions)
- **Email**: Contact repository maintainers

---

<div align="center">

**Made with ❤️ by RepoLens for developers who care about architecture**

</div>
