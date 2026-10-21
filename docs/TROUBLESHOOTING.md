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

Verify: `npx @chappibunny/repolens version` should print the latest version.

---

### `npm ci` fails in GitHub Actions

```
npm error could not resolve … @rollup/rollup-linux-x64-gnu
```

**Cause:** npm 10 can crash with `Cannot read properties of null (reading 'edgesOut')` when it re-resolves Vitest 4.1 optional peers, and a lockfile built with npm 10 can omit Rolldown's Linux packages.

**Fix:** Keep `package-lock.json` and install with `npm ci`, which is what `.github/workflows/test.yml`, `repolens.yml`, and `release.yml` do. Regenerate the lockfile with npm 11 or newer (`npx npm@11 install`) before committing it. Do not delete the lockfile in CI.

See [RELEASE.md](RELEASE.md) and the CI note in [KNOWN_ISSUES.md](KNOWN_ISSUES.md).

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
- Missing `configVersion: 1` — run `npx @chappibunny/repolens migrate` to auto-fix
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

### Obsidian: vault missing, or the folder escapes the vault

**Cause:** `obsidian` is in `publishers`, but `obsidian.vault` is unset, the directory does not exist, or `obsidian.folder` is absolute, contains `..`, or resolves through a symlink outside the vault.

**Fix:**

1. Create the vault directory in Obsidian first. RepoLens does not create the vault root.
2. Set `obsidian.vault` to that directory (absolute, or relative to the repo) and an optional `obsidian.folder` such as `RepoLens/my-app`.
3. Run `npx @chappibunny/repolens doctor`. A missing vault is a warning, not a failed doctor run. Publish fails if the vault cannot be resolved.

Obsidian publishing does not read environment variables and does not make network calls. Listing only `obsidian` still writes Markdown files under `.repolens/`, because that publisher also runs when `notion` is not selected.

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

## Architecture comment and badge

### The pull request has no RepoLens comment

**Cause:** The workflow used `CHAPIBUNNY/repolens@v1.15.1` with `command: comment`. That tag does not contain the comment mode. Or the pull request is from a fork. Or checkout used the default fetch depth, so the base commit is missing and the job failed earlier.

**Fix:**

- Use `CHAPIBUNNY/repolens@main` (or the next release tag) with `command: comment`
- Set `fetch-depth: 0`
- Set `permissions: contents: read` and `pull-requests: write`
- For a fork, open the job summary. RepoLens writes the diff there and exits 0

### shields.io shows "invalid response"

**Cause:** `badge-url` is not a public HTTPS URL, or the JSON file was not uploaded. shields.io fetches the URL itself. A workflow artifact URL is not a stable public URL.

**Fix:** Commit `repolens-badge.json` to GitHub Pages (or another public host) and set `badge-url` to that file. The JSON must include `schemaVersion`, `label`, `message`, and `color`.

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

### Architecture Diff comment missing, or GitHub API `403`

**Cause:** The workflow token cannot create an issue comment on the pull request. `contents: read` alone is not enough, and `contents: write` is the wrong scope for that comment.

**Fix:** Use the permissions written by `repolens init`:

```yaml
permissions:
  contents: read
  pull-requests: write
```

Pull requests opened from a fork still run with a read-only token. RepoLens logs the comment failure and continues publishing.

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

## Target directory, empty scans, and git

### `Target directory not found: <path>`

`--target` must already exist. RepoLens exits 2 before scanning. Create the directory, or run the command from inside the repository and omit `--target`.

### `not a git repository`

The directory has no `.git`. RepoLens still scans files. It does not print `git diff failed, returning empty diff`, and it does not report a code-health average of 100/100 when no source files were analyzed.

### `No directories to watch`

`repolens watch` exits 2 when none of the `module_roots` directories exist. Point `module_roots` at folders that are in the repository, or create those folders.

### `No files matched scan.include`

`repolens watch` also exits 2 when the configured directories exist but `scan.include` matches no source files. That happens after `init --quick` in an empty directory (`module_roots` is `.`, which exists, and the globs match nothing). Add source files or edit the globs, then run watch again. Watch does not print `Waiting for changes...` in that case.

### `Code health: no source files analyzed`

Code health scores JavaScript, TypeScript, Python, and Go. Other languages are scanned for documentation but do not get a health score. Python tests (`test_*.py`, `*_test.py`, `tests/`) and Go tests (`*_test.go`) are left out of the score.

### `Missing publisher credentials (--strict)`

`repolens publish --strict` exits 2 when Notion, Confluence, or GitHub Wiki is configured without its environment variables, or when `obsidian` is configured without `obsidian.vault`. Without `--strict`, those publishers are skipped. Markdown needs no credentials. `init --quick` writes Markdown only; the wizard adds the others.

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

Exit codes for `repolens doctor`: `0` = all checks pass, `2` = blocking failures found (missing files, invalid config, or 0 files matched). The same code `2` is used for a missing `--target`, `demo`/`publish` scanning 0 files, `watch` with nothing to watch, and `publish --strict` with missing publisher credentials. Code `1` is a runtime error or an unknown command. `repolens --help` and `repolens <command> --help` list the same codes.

---

## MCP server

### The client shows a broken connection or garbled output

**Cause:** Something wrote logs to stdout. The MCP protocol uses stdout.

**Fix:** Start the server with `repolens mcp` or `repolens-mcp`. Both set `REPOLENS_LOG_STDERR=1`. Do not pipe other commands into the same stdout.

### A tool says the path escapes the workspace

**Cause:** `root` or `outputDir` resolved outside `REPOLENS_WORKSPACE` (or the process working directory).

**Fix:** Open the client in the repository you want to read, or set `REPOLENS_WORKSPACE` to that directory. `outputDir` must be a relative path inside the repository.

### Generated docs include a badge you do not want

Set this in `.repolens.yml`:

```yaml
branding: false
```

## Still Stuck?

- **Run diagnostics:** `npx @chappibunny/repolens doctor`
- **Check known issues:** [KNOWN_ISSUES.md](KNOWN_ISSUES.md)
- **Open an issue:** [github.com/CHAPIBUNNY/repolens/issues](https://github.com/CHAPIBUNNY/repolens/issues)
- **Discussions:** [github.com/CHAPIBUNNY/repolens/discussions](https://github.com/CHAPIBUNNY/repolens/discussions)
