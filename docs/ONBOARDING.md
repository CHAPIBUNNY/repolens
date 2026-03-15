# RepoLens — Onboarding Guide

Complete step-by-step setup for RepoLens: publishers, AI enhancement, Notion, Confluence, GitHub Wiki, Discord notifications, and CI/CD automation.

> **Quick start:** For a 60-second setup, see the [Quick Start](README.md#-quick-start-60-seconds) in the README.

---

## Step 1: Initialize RepoLens

Run this in your project root:

```bash
npx @chappibunny/repolens init
```

**What it creates:**
- `.repolens.yml` — Configuration file
- `.github/workflows/repolens.yml` — Auto-publishing workflow
- `.env.example` — Environment variable template
- `README.repolens.md` — Quick reference guide

**Default configuration works for:**
- Next.js projects
- React applications
- Node.js backends
- Monorepos with common structure

---

## Step 2: Configure Publishers

Open `.repolens.yml` and verify the `publishers` section:

```yaml
publishers:
  - markdown    # Always works, no setup needed
  - notion      # Requires NOTION_TOKEN and NOTION_PARENT_PAGE_ID
  - confluence  # Requires CONFLUENCE_URL, CONFLUENCE_EMAIL, CONFLUENCE_API_TOKEN, CONFLUENCE_SPACE_KEY
```

**Markdown Only** (simplest):
```yaml
publishers:
  - markdown
```

**Notion Only**:
```yaml
publishers:
  - notion
```

**Confluence Only**:
```yaml
publishers:
  - confluence
```
Documentation lands in `.repolens/` directory. Commit these files or ignore them.

**Notion + Markdown** (recommended):
```yaml
publishers:
  - notion
  - markdown
```
Docs published to Notion for team visibility, plus local Markdown backups.

**Confluence + Markdown**:
```yaml
publishers:
  - confluence
  - markdown
```
Docs published to Confluence for enterprise teams, plus local Markdown backups.

**All Publishers**:
```yaml
publishers:
  - notion
  - confluence
  - markdown
```
Maximum visibility: Notion for async collaboration, Confluence for enterprise docs, Markdown for local backups.

**GitHub Wiki** (ideal for open source):
```yaml
publishers:
  - github_wiki
  - markdown
```
Docs live alongside your code — accessible from the repo's Wiki tab. Requires `GITHUB_TOKEN`.

---

## Step 3: Enable AI Features (Optional)

AI-enhanced documentation adds natural language explanations for non-technical audiences.

### Choose an AI Provider

RepoLens works with multiple AI providers:
- **GitHub Models** (free tier — recommended for GitHub Actions, uses `GITHUB_TOKEN`)
- **OpenAI** (gpt-5-mini, gpt-5.4, gpt-5-nano)
- **Anthropic Claude** (native adapter)
- **Google Gemini** (native adapter)
- **Azure OpenAI** (enterprise deployments)
- **Local Models** (Ollama, LM Studio, etc.)

### Option A: GitHub Models (Free — Recommended)

Every GitHub repo gets free access to AI models. No API key signup needed.

In your GitHub Actions workflow:
```yaml
env:
  REPOLENS_AI_ENABLED: true
  REPOLENS_AI_PROVIDER: github
  GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

For local development, create a [personal access token](https://github.com/settings/tokens) and add to `.env`:
```bash
REPOLENS_AI_ENABLED=true
REPOLENS_AI_PROVIDER=github
GITHUB_TOKEN=ghp_xxxxxxxxxxxxx
```

### Option B: OpenAI / Other Providers

Create `.env` in your project root:
```bash
# Enable AI features
REPOLENS_AI_ENABLED=true
REPOLENS_AI_API_KEY=sk-xxxxxxxxxxxxx

# Optional: Customize provider
REPOLENS_AI_BASE_URL=https://api.openai.com/v1
REPOLENS_AI_MODEL=gpt-5-mini
REPOLENS_AI_MAX_TOKENS=2000
```

### Configure AI in .repolens.yml

```yaml
ai:
  enabled: true              # Enable AI features
  mode: hybrid               # hybrid, full, or off
  max_tokens: 2000           # Token limit per request

features:
  executive_summary: true    # Non-technical overview
  business_domains: true     # Functional area descriptions
  architecture_overview: true # Layered technical analysis
  data_flows: true           # System data flow explanations
  developer_onboarding: true # Getting started guide
  change_impact: true        # Architecture diff with context
```

**Cost Estimates** (with gpt-5-mini):
- Small repo (<50 files): $0.10–$0.30 per run
- Medium repo (50–200 files): $0.30–$0.80 per run
- Large repo (200+ files): $0.80–$2.00 per run
- **Free** with GitHub Models (gpt-4o-mini, rate-limited)

**For GitHub Actions**, add as repository secrets:
- For GitHub Models: no extra secrets needed — `GITHUB_TOKEN` is automatic
- For OpenAI/other: Name: `AI_KEY`, Value: your API key

See [AI.md](AI.md) for complete AI documentation and provider setup.

---

## Step 4: Set Up Notion Integration (Optional)

### Create Notion Integration
1. Go to [notion.so/my-integrations](https://www.notion.so/my-integrations)
2. Click **"+ New Integration"**
3. Name it **"RepoLens"**
4. Select your workspace
5. Copy the **Internal Integration Token** (starts with `secret_`)

### Create Parent Page
1. Create a new page in Notion (e.g., "📚 Architecture Docs")
2. Click **"..."** menu → **"Add connections"** → Select **"RepoLens"**
3. Copy the page URL: `https://notion.so/workspace/PAGE_ID?xxx`
4. Extract the `PAGE_ID` (32-character hex string)

### Add Environment Variables

**For Local Development:**
```bash
NOTION_TOKEN=secret_xxxxxxxxxxxxx
NOTION_PARENT_PAGE_ID=xxxxxxxxxxxxx
NOTION_VERSION=2022-06-28
```

**For GitHub Actions:**
1. Go to your repo → **Settings** → **Secrets and variables** → **Actions**
2. Add secrets: `NOTION_TOKEN` and `NOTION_PARENT_PAGE_ID`

---

## Step 5: Set Up Confluence Integration (Optional)

### Generate API Token
1. Go to [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
2. Click **"Create API token"**
3. Name it **"RepoLens"** and copy the token

### Find Your Space Key
1. Navigate to your Confluence space
2. Go to **Space Settings** → **Space details**
3. Note the **Space Key** (e.g., `DOCS`, `ENG`, `TECH`)

### Get Parent Page ID (Optional)
1. Navigate to the page where you want docs nested
2. Click **"..."** menu → **"Page information"**
3. Copy the page ID from the URL: `pageId=123456789`

### Add Environment Variables

**For Local Development:**
```bash
CONFLUENCE_URL=https://your-company.atlassian.net/wiki
CONFLUENCE_EMAIL=your-email@example.com
CONFLUENCE_API_TOKEN=your-api-token-here
CONFLUENCE_SPACE_KEY=DOCS
CONFLUENCE_PARENT_PAGE_ID=123456789  # Optional
```

**For Confluence Server/Data Center** (self-hosted):
```bash
CONFLUENCE_URL=https://confluence.yourcompany.com
CONFLUENCE_EMAIL=your-username
CONFLUENCE_API_TOKEN=your-personal-access-token
CONFLUENCE_SPACE_KEY=DOCS
CONFLUENCE_PARENT_PAGE_ID=123456789  # Optional
```

**For GitHub Actions:**
Add secrets: `CONFLUENCE_URL`, `CONFLUENCE_EMAIL`, `CONFLUENCE_API_TOKEN`, `CONFLUENCE_SPACE_KEY`, and optionally `CONFLUENCE_PARENT_PAGE_ID`.

---

## Step 6: Configure Branch Publishing (Recommended)

Prevent documentation conflicts by limiting which branches publish:

```yaml
notion:
  branches:
    - main
  includeBranchInTitle: false

confluence:
  branches:
    - main
```

**Options:**
- `branches: [main]` — Only main publishes (recommended)
- `branches: [main, staging, release/*]` — Multiple branches with glob support
- Omit `branches` entirely — All branches publish (may cause conflicts)

Markdown publisher always runs on all branches (local files don't conflict).

---

## Step 7: Customize Scan Patterns (Optional)

```yaml
scan:
  include:
    - "src/**/*.{ts,tsx,js,jsx}"
    - "app/**/*.{ts,tsx,js,jsx}"
    - "lib/**/*.{ts,tsx,js,jsx}"
  ignore:
    - "node_modules/**"
    - ".next/**"
    - "dist/**"
    - "build/**"

module_roots:
  - "src"
  - "app"
  - "lib"
```

**Performance Note:** RepoLens warns at 10k files and limits at 50k files.

---

## Step 8: Generate and Verify

Run locally:
```bash
npx @chappibunny/repolens publish
```

**Expected output:**
```
RepoLens 🔍
────────────────────────────────────────────────────
[RepoLens] Scanning repository...
[RepoLens] Detected 42 modules
[RepoLens] Publishing documentation...
[RepoLens] ✓ System Overview published
[RepoLens] ✓ Module Catalog published
[RepoLens] ✓ API Surface published
[RepoLens] ✓ Route Map published
[RepoLens] ✓ System Map published
```

**Verify Markdown output:**
```bash
ls .repolens/
# system_overview.md  module_catalog.md  api_surface.md  route_map.md  system_map.md
```

**Verify Notion output:**
Open your Notion parent page and confirm child pages were created (System Overview, Module Catalog, API Surface, Route Map, System Map — plus AI documents if enabled).

---

## Step 9: Enable GitHub Actions

Commit the workflow for automatic updates:
```bash
git add .github/workflows/repolens.yml .repolens.yml
git commit -m "Add RepoLens documentation automation"
git push
```

**What happens next:**
- Every push to `main` regenerates docs
- Pull requests get architecture diff comments
- Documentation stays evergreen automatically

**Pro Tip:** Add `.repolens/` to `.gitignore` if you don't want to commit local Markdown files.

---

## Step 10: Discord Notifications (Optional)

Get notified when documentation changes significantly — rich embeds with coverage, health score, and change percentage.

### Setup

1. **Create a webhook** in your Discord server:
   - Server Settings → Integrations → Webhooks → New Webhook
   - Copy the webhook URL

2. **Add to environment**:
   ```bash
   DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/xxx/xxx
   ```

3. **Configure in `.repolens.yml`** (optional):
   ```yaml
   discord:
     enabled: true
     notifyOn: significant       # Options: always, significant, never
     significantThreshold: 10    # Notify if change >10%
     branches:
       - main
       - develop
   ```

4. **Add GitHub Actions secret**: `DISCORD_WEBHOOK_URL`

**Notification includes:** branch info, files scanned, coverage %, health score, change %, and direct links to published docs.

---

## Next Steps

- [Configuration Reference](CONFIGURATION.md) — Full `.repolens.yml` schema
- [Environment Variables](ENVIRONMENT.md) — All env vars by feature
- [Architecture](ARCHITECTURE.md) — Pipeline and project structure
- [Security](../SECURITY.md) — Threat model and hardening details
- [Troubleshooting](TROUBLESHOOTING.md) — Common issues and fixes
