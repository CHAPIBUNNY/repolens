# Migration Guide

This guide helps you upgrade RepoLens across breaking changes and major versions.

**Current Version:** 1.16.1  

## Upgrading to 1.16.1

No `configVersion` change. Existing `.repolens.yml` files keep working.

Scans now skip snapshot, sample, fixture, example, e2e-fixture, and `generated` directories unless `scan.include_dev_artifacts: true`. File counts drop on repos that commit those trees. Cycle text can say "Priority: Low — mutual recursion, probably intentional; verify" or "Priority: Medium" instead of treating every cycle as "Priority: High refactor". A cycle across three or more folders is still "Priority: High refactor".

The GitHub Action passes `--force` to `npx`. That only changes how npm treats the checked-out repo's `devEngines`. It does not change the scan.

## Upgrading to 1.16.0

No `configVersion` change. Existing `.repolens.yml` files keep working.

`repolens app` is a new command. It does nothing until you register a GitHub App and set `REPOLENS_APP_ID`, `REPOLENS_WEBHOOK_SECRET`, and a private key. `repolens app --manifest` only prints JSON.

YAML loading moved to js-yaml 5. `true` and `false` are still booleans. `yes` and `no` are still strings. The merge key (`<<`) still works. An empty file is still rejected as "not a mapping".

`@sentry/node` 11 warns on Node 18 (`EBADENGINE`) and still installs. The CLI keeps running if that import fails. Vitest 5 runs the suite on Node 20 and 22. Node 18 CI runs `scripts/node18-runtime.js`, as it did when Vitest 4 could not start there. `engines` stays `>=18`.

## Upgrading to 1.15.5

No config migration. `configVersion` stays `1`.

Generated text changes. A flat `src/` (or any module root with files directly in it) is one module, not one module per file, so module counts drop and `src` appears as a module. A package with `main`, `module`, or `exports` is described as a library, not a command-line tool. Hub lists, coupling advice, and security severity ignore tests, examples, and build scripts. External packages are split into runtime and development tooling. `Route Map` (`05-route-map.md`) and `GraphQL Schema` (`11-graphql-schema.md`) are not written when nothing was detected, so the numbered set can have gaps. List them in `documentation.sections` to keep them. If a script reads those two files, check that it handles a missing file.

## Upgrading to 1.15.4

No config migration. `configVersion` stays `1`.

Generated text changes. The project name is the `package.json` name when one exists. Maturity in the Executive Summary shows `N/M indicators`. Circular dependencies move from the pattern list to a **Findings** list. Self-imports leave the external package list. `zod` is now 4.x, which only matters if you import RepoLens internals.

## Upgrading to 1.15.3

No config migration. `configVersion` stays `1`.

Python `TYPE_CHECKING` imports are no longer dependency edges. Node.js built-ins disappear from the external package list. Go hub tables name packages instead of files. Architecture patterns ignore test paths, and a file named `_api.py` is not reported as an API route.

## Upgrading to 1.15.2

No config migration. `configVersion` stays `1`.

The dependency graph now includes Python and Go imports. Type-only TypeScript imports and imports that appear only in comments or strings are no longer edges. `repolens badge` and `repolens comment` are part of this release, as are the GitHub Action `comment` and `badge` modes. Pin `CHAPIBUNNY/repolens@v1.15.2` for those modes. Tag `v1.15.1` does not contain them.

## Upgrading to 1.15.1

No config migration. `configVersion` stays `1`.

`watch` exits 2 when `scan.include` matches no files, instead of printing `Waiting for changes...` and waiting. Code health now scores Python and Go files. JavaScript and TypeScript scoring is unchanged.

## Upgrading to 1.15.0

No config migration. Existing `.repolens.yml` files keep working.

If `init --quick` from 1.14.x left JavaScript-only `scan.include` patterns in a Python, Go, Rust, or Java repository, edit those patterns or run `repolens init --quick` again in a fresh checkout. `doctor`, `demo`, and `publish` now exit with a failure when the globs match 0 files instead of writing empty docs.

`publish --strict` is new and optional. Per-command help is `repolens <command> --help`. A bare `repolens` prints help.

## Upgrading to 1.14.3

No config migration. `configVersion` stays `1`.

- The MCP Registry name is `io.github.CHAPIBUNNY/repolens`. Update any client or `server.json` copy that still uses the lowercase username
- `server.json` description is 100 characters or fewer
- The release workflow does not publish an npm version that is already published

## Upgrading to 1.14.0

No config migration. `configVersion` stays `1`.

- `repolens mcp` is a new command. Existing `publish`, `demo`, and `doctor` commands are unchanged
- Generated Markdown gains a footer badge. Set `branding: false` to keep the previous files byte-for-byte aside from normal content changes
- The GitHub Action is opt-in. Workflows generated by `repolens init` are not rewritten to use `action.yml`

**Last Updated:** October 2026

---

## Upgrading to 1.13.0

No required migration. Schema stays at `configVersion: 1`. Existing `.repolens.yml` files keep working.

Obsidian is optional. Add it only if you want notes in a local vault:

```yaml
publishers:
  - obsidian
  - markdown

obsidian:
  vault: "/path/to/vault"    # must already exist
  folder: "RepoLens/my-app"  # created inside the vault
```

There is no network call and no new environment variable. `repolens doctor` warns when `obsidian` is listed and `obsidian.vault` is empty. It does not fail the run for that warning.

Release notes from 1.3.0 through 1.13.0 are in [CHANGELOG.md](../CHANGELOG.md). The sections below stay as historical upgrade notes.

---

## Migrating to v0.6.x

### Package Rename

The npm package was renamed from `@rabitai/repolens` to `@chappibunny/repolens` in v0.6.1.

**Update your workflows:**
```yaml
# Old
run: npx @rabitai/repolens@latest publish

# New
run: npx @chappibunny/repolens@latest publish
```

**Update global installs:**
```bash
npm uninstall -g @rabitai/repolens
npm install -g @chappibunny/repolens
```

Or run `npx @chappibunny/repolens migrate` to auto-update workflow files.

### Confluence Publisher (New in v0.6.0+)

Add Confluence to your publishers if you want to publish to Atlassian Confluence:

```yaml
# .repolens.yml
publishers:
  - markdown
  - notion
  - confluence

confluence:
  branches:
    - main
```

**Required environment variables:**
```bash
CONFLUENCE_URL=https://your-company.atlassian.net/wiki
CONFLUENCE_EMAIL=trades@rabitaitrades.com
CONFLUENCE_API_TOKEN=your-api-token
CONFLUENCE_SPACE_KEY=DOCS
CONFLUENCE_PARENT_PAGE_ID=123456789
```

### Dashboard Removed (v0.6.2)

The interactive HTML dashboard (`renderDashboard.js`) and GitHub Pages deployment workflow (`deploy-dashboard.yml`) have been removed. If you had dashboard configuration in `.repolens.yml`, you can safely remove it:

```yaml
# Remove these if present (no longer used)
# dashboard:
#   enabled: true
#   githubPages: true
```

---

## Migrating from v0.3.x to v0.4.0+

### Critical: Update GitHub Actions Workflow

**If you see this error:**
```
Run cd tools/repolens
cd: tools/repolens: No such file or directory
```

**Your workflow has an outdated format.** Run `npx @chappibunny/repolens migrate` or update manually:

**Old format (v0.3.0 and earlier):**
```yaml
- name: Generate documentation
  run: |
    cd tools/repolens
    npm install
    npx @chappibunny/repolens publish
```

**New format (v0.4.0+):**
```yaml
- name: Setup Node.js
  uses: actions/setup-node@v4
  with:
    node-version: 20

- name: Generate and publish documentation
  env:
    NOTION_TOKEN: ${{ secrets.NOTION_TOKEN }}
    NOTION_PARENT_PAGE_ID: ${{ secrets.NOTION_PARENT_PAGE_ID }}
    REPOLENS_AI_API_KEY: ${{ secrets.REPOLENS_AI_API_KEY }}
  run: npx @chappibunny/repolens@latest publish
```

### AI Features (Optional, added in v0.4.0)

AI features are opt-in. Add to `.repolens.yml`:

```yaml
ai:
  enabled: true
  mode: hybrid
  max_tokens: 2500

features:
  executive_summary: true
  business_domains: true
  architecture_overview: true
  data_flows: true
  developer_onboarding: true
  change_impact: true
```

Add a GitHub secret for your AI provider:
```bash
# Settings → Secrets → Actions
REPOLENS_AI_API_KEY=sk-...
```

**Available AI document types:**
- `executive_summary` — Non-technical project overview for leadership
- `business_domains` — Functional area descriptions
- `architecture_overview` — Layered technical analysis
- `data_flows` — How information moves through the system
- `developer_onboarding` — Getting started guide for new contributors
- `change_impact` — Architecture diff with natural language context

**Cost:** ~$0.10-$0.40 per run with gpt-5-mini

### Backward Compatibility

v0.4.0 is 100% backward compatible:
- Existing `.repolens.yml` configs work without modification
- AI features are opt-in (deterministic mode is default)
- All 6 original document types unchanged
- No new required dependencies

---

## Using the Migration Tool

```bash
# Preview changes without applying
npx @chappibunny/repolens migrate --dry-run

# Apply migration with confirmation
npx @chappibunny/repolens migrate

# Apply without confirmation
npx @chappibunny/repolens migrate --force
```

The migration tool:
- Auto-detects legacy patterns (`cd tools/repolens`, missing `@latest`, etc.)
- Updates package references to `@chappibunny/repolens@latest`
- Adds missing Node.js setup steps
- Adds missing environment variables
- Creates `.backup` files before modifying
- Shows diff preview before applying

---

## How Updates Work

### Automatic Notifications

RepoLens checks for updates automatically:

```
┌────────────────────────────────────────────────────────────┐
│                   📦 Update Available                      │
├────────────────────────────────────────────────────────────┤
│  Current: 0.5.0    → Latest: 1.16.1                       │
│                                                            │
│  Run one of these commands to update:                     │
│                                                            │
│  • npm install -g @chappibunny/repolens@latest (global)  │
│  • npm install @chappibunny/repolens@latest (local)      │
│  • npx @chappibunny/repolens@latest <command>  (latest)  │
└────────────────────────────────────────────────────────────┘
```

### Manual Version Check

```bash
npx @chappibunny/repolens doctor
```

### Installation Methods

**GitHub Actions (recommended):**
```yaml
run: npx @chappibunny/repolens@latest publish
```

**Global:**
```bash
npm install -g @chappibunny/repolens@latest
```

**Local:**
```bash
npm install @chappibunny/repolens@latest
```

---

## Version History

Versions after 1.2.0 are summarized in [CHANGELOG.md](../CHANGELOG.md) and [ROADMAP.md](ROADMAP.md). 1.13.0 adds the Obsidian vault publisher. 1.14.0 adds the MCP server, the GitHub Action, and the docs badge. 1.14.1 corrects the MCP Registry name to `io.github.CHAPIBUNNY/repolens`. 1.15.0 changes CLI defaults (language-aware `init --quick`, empty-scan exit 2) and does not change `configVersion`. 1.15.1 adds Python and Go code health and makes `watch` exit 2 when the globs match nothing. 1.15.2 adds Python and Go import graphs, `repolens badge`, `repolens comment`, and the gallery explained pages. 1.15.3 skips Python `TYPE_CHECKING` imports, Node.js built-ins, and test-only pattern evidence. 1.15.4 fixes project naming, maturity, domain and pattern labels, cycle reporting, self-imports, the AI notice, and noise data flows. 1.15.5 fixes module grouping, library detection, hubs, security severity, and empty pages. 1.16.0 adds `repolens app` and does not change `configVersion`. 1.16.1 skips snapshot, sample, fixture, example, and generated trees unless `scan.include_dev_artifacts` is true, and it does not change `configVersion`. Nothing in 1.3.0–1.16.1 requires a config migration. `branding` is optional.

The unreleased architecture comment (`repolens comment`, action `command: comment`) and code-health badge (`repolens badge`, action `command: badge`) do not change `configVersion` or `.repolens.yml`. Existing workflows keep working. Opt in by adding the workflows in the README. Fork pull requests do not gain a new required secret.

### v1.2.0 (March 2026)
- `repolens migrate` now also patches `.repolens.yml` (adds `configVersion: 1` if missing)
- Documentation version references updated across all files

### v1.1.0 (March 2026)
- GitHub Wiki publisher with audience-grouped Home, sidebar, and page metadata
- Temperature bug fix for GPT-5 compatibility

### v1.0.1 (March 2026)
- GPT-5 API compatibility (`max_completion_tokens`, temperature handling)

### v1.0.0 (March 2026)
- Stable release with frozen CLI, config schema, and plugin interface
- 185 tests across 15 files
- Semver guarantees (see STABILITY.md)

### v0.9.0
- Plugin system for custom renderers, publishers, and lifecycle hooks
- Plugin loader, manager, and config validation

### v0.8.0
- Extended analysis: GraphQL, TypeScript type graph, dependency graph, architecture drift
- 15 document types (4 new extended-analysis)

### v0.7.0
- Structured context builder (three-layer architecture: scan → artifacts → AI)
- Zero-hallucination AI pipeline

### v0.6.x (July 2025)
- Confluence publisher, Discord notifications, metrics system
- Package renamed to `@chappibunny/repolens`
- Dashboard removed
- CI/CD fixes for cross-platform dependency resolution

### v0.5.0
- Security hardening: secret detection, input validation, rate limiting
- 43 security tests added (90 total)
- GitHub Actions pinned to commit SHAs

### v0.4.0
- AI-assisted documentation (11 document types)
- Business domain inference, data flow analysis
- Migration tool (`repolens migrate`)

### v0.3.0
- Unicode architecture diagrams (replaced Mermaid)
- Automatic update notifications
- Interactive credential collection

### v0.2.0
- Branch-aware publishing, package.json metadata extraction
- Interactive onboarding

### v0.1.1
- Initial release: `init`, `doctor`, `publish` commands
- Notion and Markdown publishers

---

## Troubleshooting

### Update notification not showing

**Cause:** Checks are cached for 24 hours.  
**Fix:** Run `npx @chappibunny/repolens doctor` to force a check.

### "Command not found: repolens"

```bash
# Use npx (no install needed)
npx @chappibunny/repolens@latest publish

# Or install globally
npm install -g @chappibunny/repolens@latest
```

### Old version still running after update

```bash
npm cache clean --force
npm uninstall -g repolens
npm install -g @chappibunny/repolens@latest
```

### GitHub Actions using old version

Update workflow to use `@latest`:
```yaml
run: npx @chappibunny/repolens@latest publish
```
