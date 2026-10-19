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
| `REPOLENS_PR_COMMENT` | No | `false` or `0` skips the architecture diff comment even on `pull_request`. The GitHub Action sets this from the `pr-comment` input |

## Telemetry

| Variable | Required | Description |
|----------|----------|-------------|
| `REPOLENS_TELEMETRY_ENABLED` | No | Enable Sentry error tracking (`true`/`false`) |

---

**Local Development:** Create `.env` file in project root  
**GitHub Actions:** Add as repository secrets in Settings → Secrets and variables → Actions
