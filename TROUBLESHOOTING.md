# Troubleshooting

Common issues and solutions when installing or using RepoLens.

> **Quick fix for most problems:** Run `npx @chappibunny/repolens doctor` to diagnose your setup.

---

## Installation Issues

### `ENOTEMPTY: directory not empty` during `npm install`

```
npm error code ENOTEMPTY
npm error syscall rename
npm error ENOTEMPTY: directory not empty, rename '…/node_modules/some-package' -> '…/node_modules/.some-package-…'
```

**Cause:** Corrupted or stale `node_modules` directory — often from interrupted installs, version switches, or packages with special characters in folder names.

**Fix:**

```bash
rm -rf node_modules package-lock.json
npm install
```

If that doesn't work, also clear the npm cache:

```bash
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

---

### `command not found: repolens`

**Cause:** RepoLens is not installed globally, or the npm bin directory is not in your PATH.

**Fix — Option A:** Use npx (no global install needed):

```bash
npx @chappibunny/repolens publish
```

**Fix — Option B:** Install globally:

```bash
npm install -g @chappibunny/repolens
```

---

### Old version still running after update

**Cause:** npm cache or a stale global install.

**Fix:**

```bash
npm cache clean --force
npm uninstall -g @chappibunny/repolens
npm install -g @chappibunny/repolens@latest
```

Verify: `repolens version` should print the latest version.

---

### `npm ci` fails in GitHub Actions

```
npm error could not resolve … @rollup/rollup-linux-x64-gnu
```

**Cause:** `npm ci` with a macOS-generated lockfile fails to resolve platform-specific optional dependencies on Linux runners.

**Fix:** Use `npm install` instead of `npm ci` in your workflow, and delete `package-lock.json` before install:

```yaml
- run: rm -f package-lock.json && npm install
```

See the [CI/CD section](README.md#-release-process) in the README for more details.

---

## Configuration Issues

### `Config file not found`

**Cause:** No `.repolens.yml` in the current directory or any parent.

**Fix:**

```bash
npx @chappibunny/repolens init
```

This scaffolds a default `.repolens.yml` in your project root.

---

### `Failed to parse .repolens.yml`

**Cause:** Invalid YAML syntax (wrong indentation, mismatched quotes, tabs instead of spaces).

**Fix:** Validate your YAML at [yamllint.com](https://www.yamllint.com/) or use a YAML linter in your editor.

---

### `Configuration validation failed`

**Cause:** Missing required fields or invalid values in `.repolens.yml`.

**Fix:** Run the doctor command to see exactly what's wrong:

```bash
npx @chappibunny/repolens doctor
```

Common issues:
- Missing `configVersion: 1`
- Empty `publishers` array
- Empty `scan.include` patterns
- Invalid `ai.temperature` value (must be 0–2)

---

## Scanning Issues

### `No files matched scan patterns`

**Cause:** Your `scan.include` patterns don't match any files in the repository.

**Fix:** Check your patterns match your project structure:

```yaml
scan:
  include:
    - "src/**"
    - "app/**"
    - "lib/**"
```

Test your patterns:

```bash
npx fast-glob "src/**/*.{js,ts,jsx,tsx}"
```

---

### `Repository exceeds file limit (50,000)`

**Cause:** Too many files matched — likely including `node_modules` or build output.

**Fix:** Add exclusions to your config:

```yaml
scan:
  ignore:
    - "node_modules/**"
    - "dist/**"
    - ".next/**"
    - "build/**"
```

---

## Publishing Issues

### Notion: `NOTION_TOKEN not set`

**Cause:** The `NOTION_TOKEN` environment variable is missing.

**Fix:**

1. Create a Notion integration at [notion.so/my-integrations](https://www.notion.so/my-integrations)
2. Share your target page with the integration
3. Set the token:
   - **Locally:** Add to `.env` file: `NOTION_TOKEN=ntn_...`
   - **GitHub Actions:** Add to repository secrets: Settings → Secrets → Actions → `NOTION_TOKEN`

---

### Confluence: `Confluence credentials not configured`

**Cause:** Missing one or more Confluence environment variables.

**Fix:** Set all required variables:

```bash
CONFLUENCE_URL=https://your-company.atlassian.net/wiki
CONFLUENCE_EMAIL=your-email@company.com
CONFLUENCE_API_TOKEN=your-api-token
CONFLUENCE_SPACE_KEY=DOCS
CONFLUENCE_PARENT_PAGE_ID=123456789
```

Generate an API token at [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens).

---

### GitHub Wiki: `Missing GITHUB_TOKEN`

**Cause:** No `GITHUB_TOKEN` available for wiki publishing.

**Fix:**

- **GitHub Actions:** Add `GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}` to your workflow env
- **Locally:** Create a PAT with `repo` scope at [github.com/settings/tokens](https://github.com/settings/tokens) and set `GITHUB_TOKEN=ghp_...`

Also ensure the Wiki tab is enabled in your repository settings (Settings → General → Features → Wikis).

---

### Discord: `Discord webhook URL is invalid`

**Cause:** Malformed or expired webhook URL.

**Fix:** Create a new webhook in Discord (Server Settings → Integrations → Webhooks) and update `DISCORD_WEBHOOK_URL`.

---

## AI Issues

### `Unsupported value: 'temperature' does not support X with this model`

**Cause:** Some models (e.g. `gpt-5-mini`) only accept the default temperature value and reject any explicit value.

**Fix:** Don't set `REPOLENS_AI_TEMPERATURE` or `ai.temperature` in your config. RepoLens omits temperature from API requests by default, letting the model use its own default. Only set temperature if your specific model supports it.

---

### `AI features are disabled`

**Cause:** AI is not enabled — this is the default.

**Fix:** Set `REPOLENS_AI_ENABLED=true` in your environment or `.env` file.

---

### `Missing API key`

**Cause:** AI is enabled but no API key is configured.

**Fix:** Set `REPOLENS_AI_API_KEY=sk-...` (or your provider's key format).

---

### `Request timeout`

**Cause:** AI provider took too long to respond.

**Fix:** Increase the timeout:

```bash
REPOLENS_AI_TIMEOUT_MS=120000  # 2 minutes
```

---

### `Rate limit exceeded`

**Cause:** Too many requests to the AI provider in a short time.

**Fix:**
- Wait and retry — RepoLens has built-in exponential backoff
- Reduce `ai.max_tokens` to lower per-request cost
- Use a cheaper model (`gpt-5-nano`) for lower-priority docs

---

### Poor AI output quality

**Fix:**
- Use `gpt-5.4` for highest quality
- Increase `ai.max_tokens` (default: 2500)
- Add more detail to `domains` configuration in `.repolens.yml`
- AI receives only structured context, never raw code — richer scan data produces better output

---

### AI costs too high

**Fix:**
- Switch to `gpt-5-nano` instead of `gpt-5-mini`
- Reduce the number of documents in `outputs.pages`
- Run AI-enhanced docs less frequently (e.g., only on main branch merges)
- Disable AI entirely — deterministic docs are always generated as fallback

---

## CI/CD Issues

### `Invalid workflow file`

**Cause:** YAML syntax error in your GitHub Actions workflow.

**Fix:**

```bash
npx @chappibunny/repolens migrate
```

This migrates legacy workflow patterns to the current format. Review the diff before committing.

---

### GitHub Actions using old RepoLens version

**Cause:** Workflow pinned to an older version.

**Fix:** Update your workflow to use `@latest`:

```yaml
- run: npx @chappibunny/repolens@latest publish
```

Or install from the repo directly:

```yaml
- run: npm install && node bin/repolens.js publish
```

---

### `Permission denied` writing files

**Cause:** The CI runner or local user doesn't have write access to the output directory.

**Fix:**
- Check that `.repolens/` is writable
- In CI, ensure the checkout step has write permissions:

```yaml
permissions:
  contents: write
```

---

## Doctor Command

Run the built-in diagnostic tool to check your setup:

```bash
npx @chappibunny/repolens doctor
```

This validates:

| Check | Required |
|---|---|
| `.repolens.yml` exists and parses | Yes |
| `.github/workflows/repolens.yml` exists | Yes |
| `publishers` array is non-empty | Yes |
| `scan.include` has patterns | Yes |
| `module_roots` has entries | Yes |
| `outputs.pages` has page definitions | Yes |
| `.env.example` exists | Warning only |
| Known repo roots detected | Warning only |
| Version is up to date | Informational |

Exit codes: `0` = all checks pass, `1` = blocking failures found.

---

## Still Stuck?

- **Run diagnostics:** `npx @chappibunny/repolens doctor`
- **Check known issues:** [KNOWN_ISSUES.md](KNOWN_ISSUES.md)
- **Open an issue:** [github.com/CHAPIBUNNY/repolens/issues](https://github.com/CHAPIBUNNY/repolens/issues)
- **Discussions:** [github.com/CHAPIBUNNY/repolens/discussions](https://github.com/CHAPIBUNNY/repolens/discussions)
