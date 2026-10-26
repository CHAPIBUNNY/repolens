# 🔐 Environment Variables

## Notion Publisher

| Variable | Required | Description |
|----------|----------|-------------|
| `NOTION_TOKEN` | Yes | Integration token from notion.so/my-integrations |
| `NOTION_PARENT_PAGE_ID` | Yes | Page ID where docs will be created |
| `NOTION_VERSION` | No | API version (default: `2022-06-28`) |

## Confluence Publisher

| Variable | Required | Description |
|----------|----------|-------------|
| `CONFLUENCE_URL` | Yes | Base URL (e.g., `https://your-company.atlassian.net/wiki`) |
| `CONFLUENCE_EMAIL` | Yes | Atlassian account email |
| `CONFLUENCE_API_TOKEN` | Yes | API token from [Atlassian](https://id.atlassian.com/manage-profile/security/api-tokens) |
| `CONFLUENCE_SPACE_KEY` | Yes | Target space key (e.g., `DOCS`, `ENG`) |
| `CONFLUENCE_PARENT_PAGE_ID` | No | Parent page ID (docs created at space root if omitted) |

## Discord Notifications

| Variable | Required | Description |
|----------|----------|-------------|
| `DISCORD_WEBHOOK_URL` | No | Discord webhook URL for team notifications |

## Obsidian Publisher

Obsidian publishing does not use environment variables. Set `obsidian.vault` and an optional `obsidian.folder` in `.repolens.yml`. RepoLens only writes files inside that vault.

## GitHub Wiki Publisher

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_TOKEN` | Yes | Personal access token or Actions `${{ secrets.GITHUB_TOKEN }}` |
| `GITHUB_REPOSITORY` | No | `owner/repo` (auto-detected from git remote in Actions) |

## AI Enhancement

| Variable | Required | Description |
|----------|----------|-------------|
| `REPOLENS_AI_ENABLED` | No | Enable AI-powered sections (`true`/`false`) |
| `REPOLENS_AI_PRESET` | No | Quick setup preset: `github`, `openai`, `anthropic`, `google` (overrides provider/baseUrl/model) |
| `REPOLENS_AI_PROVIDER` | No | Provider: `openai_compatible` (default), `anthropic`, `google`, `github` |
| `REPOLENS_AI_API_KEY` | No | API key for AI provider (not needed for `github` provider) |
| `REPOLENS_AI_BASE_URL` | No | API base URL (auto-set per provider; override for custom endpoints) |
| `REPOLENS_AI_MODEL` | No | Model name (e.g., `gpt-5-mini`, `gpt-4o-mini`, `claude-sonnet-4-20250514`) |
| `REPOLENS_AI_TEMPERATURE` | No | Generation temperature (omitted by default for GPT-5 compatibility) |
| `REPOLENS_AI_MAX_TOKENS` | No | Max completion tokens per request (default: `2000`) |

### AI Presets (Quick Setup)

Instead of configuring provider, base URL, and model separately, use a preset:

```bash
# GitHub Models (free in GitHub Actions)
REPOLENS_AI_PRESET=github

# OpenAI
REPOLENS_AI_PRESET=openai
REPOLENS_AI_API_KEY=sk-...

# Anthropic
REPOLENS_AI_PRESET=anthropic
REPOLENS_AI_API_KEY=sk-ant-...

# Google Gemini
REPOLENS_AI_PRESET=google
REPOLENS_AI_API_KEY=...
```

> **GitHub Models (free):** Set `REPOLENS_AI_PRESET=github` in GitHub Actions — uses `GITHUB_TOKEN` automatically, no separate API key required. See [AI.md](AI.md) for details.

## MCP server

| Variable | Required | Description |
|----------|----------|-------------|
| `REPOLENS_WORKSPACE` | No | Absolute directory the MCP server is allowed to read. Defaults to the process working directory. Tool paths must stay inside it |
| `REPOLENS_LOG_STDERR` | No | `repolens mcp` sets this to `1` so logs stay off stdout |

## Pull request comments

| Variable | Required | Description |
|----------|----------|-------------|
| `REPOLENS_PR_COMMENT` | No | `false` or `0` skips the architecture diff comment even on `pull_request`. The GitHub Action sets this from the `pr-comment` input. `command: comment` always comments. When `pr-comment` is true, the action posts from its own source and passes `false` into the published package so the pull request gets one comment |
| `REPOLENS_BADGE_OUT` | No | Path for badge JSON when `command` is `badge`. Default `repolens-badge.json`. The SVG is written beside it |
| `REPOLENS_BADGE_URL` | No | Public http(s) URL of that JSON. shields.io fetches it. Embedded in the markdown snippet |
| `REPOLENS_BADGE_LINK` | No | Page the badge links to. The gallery score pages link back to themselves |

## GitHub App (`repolens app`)

The webhook is self-hosted. None of these are CI secrets. See [GITHUB_APP.md](GITHUB_APP.md).

| Variable | Required | Description |
|----------|----------|-------------|
| `REPOLENS_APP_ID` | Yes, to listen | GitHub App ID |
| `REPOLENS_WEBHOOK_SECRET` | Yes, to listen | Verifies `X-Hub-Signature-256` |
| `REPOLENS_APP_PRIVATE_KEY` | One of the key vars | PEM text. A literal `\n` becomes a newline |
| `REPOLENS_APP_PRIVATE_KEY_PATH` | One of the key vars | Path to the PEM file. Used when set |
| `REPOLENS_APP_PORT` | No | Listen port (default `8787`) |
| `REPOLENS_APP_HOST` | No | Listen address (default `127.0.0.1`) |
| `REPOLENS_APP_WEBHOOK_PATH` | No | Path GitHub posts to (default `/api/github/webhooks`) |

`repolens app --manifest` prints the manifest and does not read these.

## Telemetry

| Variable | Required | Description |
|----------|----------|-------------|
| `REPOLENS_TELEMETRY_ENABLED` | No | Enable Sentry error tracking (`true`/`false`) |

---

**Local Development:** Create `.env` file in project root  
**GitHub Actions:** Add as repository secrets in Settings → Secrets and variables → Actions

`repolens publish` skips a publisher whose credentials are unset. `repolens publish --strict` exits 2 instead, and names each missing variable. Markdown has no credentials. `init --quick` does not enable Notion or Confluence; add those in the wizard or in `publishers` when the variables above are set.
