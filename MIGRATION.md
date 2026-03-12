# Migration Guide

This guide helps you upgrade RepoLens across breaking changes and major versions.

**Current Version:** 1.3.1  
**Last Updated:** March 2026

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

Or run `repolens migrate` to auto-update workflow files.

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

**Your workflow has an outdated format.** Run `repolens migrate` or update manually:

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
repolens migrate --dry-run

# Apply migration with confirmation
repolens migrate

# Apply without confirmation
repolens migrate --force
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
│  Current: 0.5.0    → Latest: 1.3.1                        │
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
repolens doctor
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
**Fix:** Run `repolens doctor` to force a check.

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
