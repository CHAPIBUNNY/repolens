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
[![VS Code Extension](https://img.shields.io/badge/VS_Code-Marketplace-007ACC?logo=visualstudiocode&logoColor=white)](https://marketplace.visualstudio.com/items?itemName=repolensdox.repolensdox)
[![Tests](https://img.shields.io/github/actions/workflow/status/CHAPIBUNNY/repolens/test.yml?label=tests)](https://github.com/CHAPIBUNNY/repolens/actions/workflows/test.yml)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![MCP Registry](https://img.shields.io/badge/MCP_Registry-io.github.CHAPIBUNNY%2Frepolens-6E56CF)](https://registry.modelcontextprotocol.io/v0/servers?search=io.github.CHAPIBUNNY/repolens)
[![Gallery](https://img.shields.io/badge/Gallery-26_real_repos-0B5FFF)](https://chapibunny.github.io/repolens/)
[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/install-mcp?name=repolens&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBjaGFwcGlidW5ueS9yZXBvbGVucyIsIm1jcCJdfQ%3D%3D)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_MCP_Server-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=repolens&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40chappibunny%2Frepolens%22%2C%22mcp%22%5D%7D)

**Links:** [Gallery](https://chapibunny.github.io/repolens/) · [npm](https://www.npmjs.com/package/@chappibunny/repolens) · [MCP Registry](https://registry.modelcontextprotocol.io/v0/servers?search=io.github.CHAPIBUNNY/repolens) · [VS Code extension](https://marketplace.visualstudio.com/items?itemName=repolensdox.repolensdox) · [GitHub Action](action.yml)

**Your architecture docs are already outdated.** RepoLens fixes that.

RepoLens scans your repository, generates living architecture documentation, and publishes it to Notion, Confluence, GitHub Wiki, Obsidian, or Markdown — automatically on every push. Engineers get technical docs. Stakeholders get readable system overviews. Nobody writes a word.

> Stable as of v1.0 — [API guarantees](docs/STABILITY.md) · [Security hardened](SECURITY.md) · version from [`package.json`](package.json)

---

## 🎬 Demo

> **Try it now** — no installation required. Run `npx @chappibunny/repolens demo` on any repo for an instant local preview.

**[See it on real repos](https://chapibunny.github.io/repolens/)** — architecture pages RepoLens generated for Express, FastAPI, Django, Gin, mdBook, and other public projects. Deterministic mode, no API keys.

🎬 **[Watch Demo Video](https://www.loom.com/share/8e077624e69f41319fd93acbbe03871e)** — See RepoLens generate docs in 60 seconds

<table>
<tr>
<td width="50%"><img src="assets/notion-screenshot.png" alt="Notion output" /></td>
<td width="50%"><img src="assets/confluence-screenshot.png" alt="Confluence output" /></td>
</tr>
<tr>
<td align="center"><em>Notion</em></td>
<td align="center"><em>Confluence</em></td>
</tr>
</table>

<details>
<summary>🔍 <strong>Supported Languages</strong> (16 auto-detected)</summary>

`JavaScript` `TypeScript` `Python` `Go` `Rust` `Java` `C` `C++` `C#` `Ruby` `PHP` `Swift` `Kotlin` `Scala` `Shell` `SQL`

Plus framework detection: **Django** · **FastAPI** · **Flask** · **Gin** · **Echo** · **Fiber** · **Actix** · **Rocket** — and all major JS frameworks (React, Next.js, Vue, Angular, Express, NestJS, Svelte, etc.)
</details>

---

## 🚀 Quick Start (60 seconds)

**Step 1: Install** (Node.js 18+)
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

**Done!** Numbered notes and the Markdown publisher’s files are in `.repolens/`. Notion, Confluence, GitHub Wiki, and Obsidian publish only when you configure them. Obsidian needs `obsidian.vault` in `.repolens.yml` and does not use an API key.

**🔄 Upgrading from v0.3.0 or earlier?**
Run `npx @chappibunny/repolens migrate` to automatically update your workflow files. See [MIGRATION.md](docs/MIGRATION.md) for details.

---

## 📋 What It Generates

**17 document types** for three audiences — no manual writing required:

| Audience | Documents |
|---|---|
| **Stakeholders** | Executive Summary |
| **Mixed** | System Overview · Business Domains · Route Map · Data Flows · Change Impact · System Map · Architecture Drift · Code Health |
| **Engineers** | Architecture Overview · Module Catalog · API Surface · Developer Onboarding · GraphQL Schema · TypeScript Type Graph · Dependency Graph · Security Hotspots |

**Two modes:** Deterministic (free, fast, always works) or AI-Enhanced (optional — GitHub Models, OpenAI, Anthropic, Google, Azure, Ollama).

---

## ✨ Why RepoLens

| | |
|---|---|
| 🤖 **Autonomous** | Runs on every push via GitHub Actions — docs stay evergreen |
| 👥 **Multi-Audience** | Technical docs + stakeholder-readable overviews from one scan |
| 📤 **Multi-Publisher** | Notion, Confluence, GitHub Wiki, Obsidian, Markdown — together or one at a time |
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

For alternative methods, see [INSTALLATION.md](docs/INSTALLATION.md).

---

## 🎨 VS Code Extension

**View your architecture directly in VS Code** — browse modules, visualize dependencies, and explore your codebase structure without leaving the editor.

**Install from Marketplace:**
```
ext install repolensdox.repolensdox
```

[**→ Get it on Visual Studio Marketplace**](https://marketplace.visualstudio.com/items?itemName=repolensdox.repolensdox)

**Features:**
- 🏗️ **Architecture Explorer** — Tree view of your system structure
- 📊 **Dependency Visualizer** — Interactive dependency graphs
- 📁 **Module Browser** — Navigate modules by domain and function
- 🔍 **Command Palette** — Quick access to architecture insights
- 📈 **System Metrics** — Real-time architecture health indicators

The extension reads your `.repolens.yml` configuration and provides an interactive UI for exploring the documentation that RepoLens generates.

---

## 🎓 Onboarding Guide

Step-by-step setup for publishers, AI features, Notion, Confluence, GitHub Wiki, Obsidian, Discord, and CI/CD automation.

**[→ Full Onboarding Guide](docs/ONBOARDING.md)**

---

## 🎮 Commands

| Command | Description |
|---|---|
| `npx @chappibunny/repolens init` | **Interactive wizard** — configure publishers, AI, credentials |
| `npx @chappibunny/repolens init --quick` | Minimal setup, skip wizard |
| `npx @chappibunny/repolens publish` | Scan, generate, and publish documentation |
| `npx @chappibunny/repolens demo` | Quick local preview — no API keys needed |
| `npx @chappibunny/repolens doctor` | Validate your setup |
| `npx @chappibunny/repolens watch` | Auto-regenerate docs on file changes |
| `npx @chappibunny/repolens migrate` | Upgrade from v0.3.0 workflows ([details](docs/MIGRATION.md)) |
| `npx @chappibunny/repolens uninstall` | Remove all RepoLens files (config, docs, workflow) |
| `npx @chappibunny/repolens uninstall --force` | Remove without confirmation prompt |
| `npx @chappibunny/repolens feedback` | Send feedback to the team |
| `npx @chappibunny/repolens mcp` | Start the stdio MCP server (`repolens-mcp` is the same server) |

> **Note:** If you installed globally with `npm install -g @chappibunny/repolens`, you can use the shorter `repolens <command>` form.
> **Warning:** Do not run bare `npx repolens` — there is an unrelated `repolens@0.0.1` placeholder package on npm. Always use the scoped name `@chappibunny/repolens`.

---

## MCP server

Cursor, Cline, Claude Desktop, Claude Code, and VS Code Copilot can call RepoLens over stdio. The server is read-only except for `generate_docs`, which writes Markdown inside the workspace. Deterministic mode does not use the network. Paths cannot leave the workspace root.

[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/install-mcp?name=repolens&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBjaGFwcGlidW5ueS9yZXBvbGVucyIsIm1jcCJdfQ%3D%3D)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_MCP_Server-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=repolens&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40chappibunny%2Frepolens%22%2C%22mcp%22%5D%7D)

Copy-paste configs for Cursor, Claude Desktop, and VS Code are in [docs/MCP.md](docs/MCP.md).

```json
{
  "mcpServers": {
    "repolens": {
      "command": "npx",
      "args": ["-y", "@chappibunny/repolens", "mcp"]
    }
  }
}
```

### Use with Cline

Open Cline → MCP Servers → Installed → Configure MCP Servers, paste this into `cline_mcp_settings.json`, and save:

```json
{"mcpServers":{"repolens":{"command":"npx","args":["-y","@chappibunny/repolens","mcp"]}}}
```

Cline starts the server with no install step (Node 18+ required). It reads the directory the server starts in. To point it at a specific repo, add `"env": {"REPOLENS_WORKSPACE": "/absolute/path/to/repo"}`. Six tools appear: `get_system_overview`, `list_modules`, `get_api_surface`, `get_dependency_graph`, `get_architecture_diff`, `generate_docs`. Step-by-step agent instructions are in [llms-install.md](llms-install.md).

If `npx` reports `Unknown command: mcp`, an `.npmrc` with `min-release-age` (or an old npx cache) resolved a release older than 1.14.0. Use `npx -y @chappibunny/repolens@latest mcp` or clear `~/.npm/_npx`.

## GitHub Action

`action.yml` is a composite action named **RepoLens Architecture Docs**. It runs the published npm package (`npx --yes @chappibunny/repolens@1.14.3`). Inputs are `command` (`publish`, `demo`, or `doctor`), `config`, `node-version`, `pr-comment`, and `version`.

```yaml
name: Architecture docs
on:
  pull_request:
  push:
    branches: [main]
permissions:
  contents: read
  pull-requests: write
jobs:
  docs:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@9f698171ed81b15d1823a05fc7211befd50c8ae0 # v6.0.3
      - uses: CHAPIBUNNY/repolens@v1.14.3
        with:
          command: publish
          config: .repolens.yml
          node-version: "20"
          pr-comment: ${{ github.event_name == 'pull_request' && 'true' || 'false' }}
```

The action is listed on the GitHub Marketplace only after a release is published with **Publish this Action to the GitHub Marketplace** checked. Those steps are in [docs/RELEASE.md](docs/RELEASE.md). The tag `v1.14.1` has to exist before `uses: CHAPIBUNNY/repolens@v1.14.3` resolves, and `@chappibunny/repolens@1.14.3` has to be on npm before the action can install it.

## Add the badge to your repo

Generated Markdown includes this line unless `.repolens.yml` sets `branding: false` (or `branding.badge: false`). Add the same badge to a repository README:

```markdown
[![Docs by RepoLens](https://img.shields.io/badge/Docs%20by-RepoLens-0B5FFF)](https://github.com/CHAPIBUNNY/repolens) · [Examples](https://chapibunny.github.io/repolens/)
```

Generated docs also link to the [gallery](https://chapibunny.github.io/repolens/) after the badge.

---

## 📸 Example Output

### System map

Published system maps are Unicode diagrams drawn from import edges. RepoLens does not emit Mermaid.

The publisher set is Notion, Confluence, GitHub Wiki, Obsidian, and Markdown (`src/publishers`, 7 files). 1.14.0 adds the MCP server, the Marketplace action, and the docs badge. 1.14.1 sets the registry name to `io.github.CHAPIBUNNY/repolens`. 1.14.2 adds the gallery link to the badge line, `glama.json`, and `CITATION.cff`. 1.14.3 adds Cline setup docs and `llms-install.md`. Layout and counts are in [ARCHITECTURE.md](docs/ARCHITECTURE.md).

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

- **Telemetry is opt-in and disabled by default** — no code, secrets, or personal data leaves your machine. See [TELEMETRY.md](docs/TELEMETRY.md).
- **Defense-in-depth security** — input validation, secret detection (15+ patterns), rate limiting, injection prevention, supply chain hardening. See [SECURITY.md](SECURITY.md).
- **Report vulnerabilities** to trades@rabitaitrades.com (not public issues). Response within 48 hours.

---

## 📚 Documentation

| Guide | Description |
|---|---|
| [Onboarding Guide](docs/ONBOARDING.md) | Step-by-step setup: publishers, AI, Notion, Confluence, GitHub Wiki, Obsidian, Discord |
| [Configuration](docs/CONFIGURATION.md) | Complete `.repolens.yml` schema and examples |
| [Environment Variables](docs/ENVIRONMENT.md) | All env vars by publisher and feature |
| [Architecture](docs/ARCHITECTURE.md) | Pipeline diagram, project structure |
| [Development](docs/DEVELOPMENT.md) | Setup, tests, and the release process |
| [Security](SECURITY.md) | Threat model, secret detection, validation layers |
| [Telemetry](docs/TELEMETRY.md) | Opt-in privacy-first usage analytics |
| [Troubleshooting](docs/TROUBLESHOOTING.md) | Common issues and fixes |
| [Migration](docs/MIGRATION.md) | Upgrading from v0.3.0 or earlier |
| [Stability](docs/STABILITY.md) | API contract and semver guarantees |
| [MCP server](docs/MCP.md) | stdio server for Cursor, Claude, and VS Code |

---

## 🤝 Contributing

**Ways to help:**
- **Try it out**: Install and use in your projects
- **Report issues**: Share bugs, edge cases, or UX friction
- **Request features**: Tell us what's missing
- **Build plugins**: Extend RepoLens with custom renderers and publishers
- **Share feedback**: `npx @chappibunny/repolens feedback`

---

## 🗺️ Roadmap

v1.0+ features complete — CLI, config schema, and plugin interface are frozen.

**Completed:**
- [x] VS Code extension ([available on Marketplace](https://marketplace.visualstudio.com/items?itemName=repolensdox.repolensdox))
- [x] Obsidian vault publisher (local notes with wikilinks and frontmatter)
- [x] MCP server (`repolens mcp`) for Cursor, Claude, and VS Code
- [x] GitHub Action `RepoLens Architecture Docs` (`action.yml`)
- [x] Docs by RepoLens badge on generated Markdown

**Next:**
- [ ] GitHub App for automated setup and status checks
- [ ] Slack notifications
- [ ] Custom webhook support
- [ ] Cross-repository architecture analysis
- [ ] Security boundary validation
- [ ] Interactive HTML documentation output
- [ ] Architecture decision records (ADR) generation

See [ROADMAP.md](docs/ROADMAP.md) for detailed planning.

---

## 📄 License

MIT

---

## 💬 Support & Contact

- **Troubleshooting**: [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) — installation, config, publishing, AI, and CI/CD issues
- **Diagnostics**: Run `npx @chappibunny/repolens doctor` to validate your setup
- **Issues**: [GitHub Issues](https://github.com/CHAPIBUNNY/repolens/issues)
- **Discussions**: [GitHub Discussions](https://github.com/CHAPIBUNNY/repolens/discussions)
- **Email**: Contact repository maintainers

---

<div align="center">

**Made with ❤️ by RepoLens for developers who care about architecture**

</div>
