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

## GitHub Wiki Publisher

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_TOKEN` | Yes | Personal access token or Actions `${{ secrets.GITHUB_TOKEN }}` |
| `GITHUB_REPOSITORY` | No | `owner/repo` (auto-detected from git remote in Actions) |

## AI Enhancement

| Variable | Required | Description |
|----------|----------|-------------|
| `REPOLENS_AI_ENABLED` | No | Enable AI-powered sections (`true`/`false`) |
| `REPOLENS_AI_API_KEY` | No | API key for AI provider |
| `REPOLENS_AI_BASE_URL` | No | API base URL (default: `https://api.openai.com/v1`) |
| `REPOLENS_AI_MODEL` | No | Model name (e.g., `gpt-5-mini`) |
| `REPOLENS_AI_TEMPERATURE` | No | Generation temperature (omitted by default for GPT-5 compatibility) |
| `REPOLENS_AI_MAX_TOKENS` | No | Max completion tokens per request (default: `2000`) |

## Telemetry

| Variable | Required | Description |
|----------|----------|-------------|
| `REPOLENS_TELEMETRY_ENABLED` | No | Enable Sentry error tracking (`true`/`false`) |

---

**Local Development:** Create `.env` file in project root  
**GitHub Actions:** Add as repository secrets in Settings → Secrets and variables → Actions
