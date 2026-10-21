# Known Issues & Limitations

This document tracks known issues, limitations, and edge cases in RepoLens. We're committed to transparency about what works, what doesn't, and what we're working on.

**Last Updated:** October 2026  
**Version:** 1.15.2

---

## Empty scans on non-JavaScript repos (fixed in 1.15.0)

`init --quick` in 1.14.x wrote JavaScript-only globs (`src/**/*.{ts,tsx,js,jsx,md}`) and `module_roots` such as `app`, `lib`, and `components`. On a Python repository such as psf/requests, `demo` then matched 0 files, wrote near-empty docs, and exited 0.

1.15.0 detects the language and writes fitting globs. `doctor` fails when 0 files match. `demo` and `publish` exit 2 and do not write those docs.

## Watch hangs when nothing matches (fixed in 1.15.1)

After `init --quick` in an empty directory, `module_roots` is `.` (the directory exists) and `scan.include` matches no source files. 1.15.0 `watch` still printed `Waiting for changes...` and waited. 1.15.1 exits 2 and tells you to add source files or fix the globs.

## Dependency graph skipped Python and Go (fixed in 1.15.2)

The import graph only read JavaScript and TypeScript. A Python or Go repository (click, httpx, cobra, chi) rendered `No source files were found to analyze for import dependencies.` 1.15.2 parses Python `import` / `from` (including relative imports) and Go imports against `go.mod`. Go `*_test.go` files are not separate modules.

Imports inside comments were edges, which made `tj/commander.js` look circular. Type-only TypeScript imports (`import type`, `export type ... from`) were real cycles in sindresorhus/ky. A template literal produced an external package with an empty name. 1.15.2 ignores comments, strings, type-only imports, and empty specifiers.

Path keywords used to be substrings, so httpx `_main.py` was "AI/LLM integration" and `test/hooks.ts` was "Custom React hooks" without a React import. 1.15.2 matches tokens and cites the path or import. React hook wording requires a `react` import.

## Code health skipped Python and Go (fixed in 1.15.1)

Code health used to score only JavaScript and TypeScript, so `demo` on a Python repository such as psf/requests logged `Code health: no source files analyzed` even after the scan found `.py` files. 1.15.1 scores Python and Go as well. Test modules are skipped.

## 🔄 Migration Tool (`repolens migrate`)

### Fixed Issues (v0.4.2 - v0.4.3)

These bugs were discovered in production and have been fixed:

#### ✅ Duplicate `run:` Keys (Fixed in v0.4.2)
**Symptom:** Migration created duplicate `run:` keys in workflow steps, causing YAML validation errors.

**Root Cause:** Pattern insertion didn't capture existing `run:` command when adding environment variables.

**Fix:** Updated regex pattern to `/(- name: .*\n)(\s+)(run:.*)/i` to capture and preserve run command.

**Regression Test:** `tests/e2e/migration.test.js` includes specific test case.

#### ✅ Over-Aggressive npm Install Removal (Fixed in v0.4.3)
**Symptom:** Migration removed ALL `npm ci` and `npm install` commands, corrupting release workflows.

**Root Cause:** Pattern matched any npm install, not just the legacy RepoLens-specific pattern.

**Fix:** Only removes npm install from multi-line `run: |` blocks containing `cd tools/repolens`.

**Pattern:** `/(run:\s*\|[^\n]*\n(?:\s+[^\n]*\n)*?\s+)npm\s+(?:ci|install)\s*\n/g`

**Regression Test:** `tests/e2e/migration.test.js` includes `release-with-npm-ci.yml` fixture.

### Current Limitations

#### Manual Review Still Recommended
**Issue:** Migration covers the legacy workflow patterns it was built for. Unusual multi-step workflows can still need a manual pass. `npm test` is the regression check; this guide does not pin a test total.

**Workaround:** 
1. Run `npx @chappibunny/repolens migrate --dry-run` first
2. Review the diff before applying
3. Check backup files created as `*.backup`
4. Test locally with `npx @chappibunny/repolens@latest publish`

#### Multi-File Workflows Not Supported
**Issue:** If RepoLens publish steps are split across multiple workflow files, migration may miss some.

**Workaround:** Search codebase for `npx repolens` and manually update other files using the migration pattern:
```bash
git grep "npx repolens" .github/workflows/
```

#### Custom Environment Variable Names
**Issue:** If you've renamed `NOTION_TOKEN` or `REPOLENS_AI_API_KEY` in your setup, migration adds the default names.

**Workaround:** After migration, manually update environment variable names to match your GitHub Secrets.

---

## 📊 Publishing

### Branch-Aware Notion Publishing

#### Title Conflicts on Multi-Branch Publishing
**Issue:** If multiple branches publish to the same Notion workspace without `.repolens.yml` → `notion.branches` filter, pages may overwrite each other.

**Current Behavior:** Non-main branches get `[branch-name]` suffix to avoid collisions.

**Best Practice:** Configure branch filtering in `.repolens.yml`:
```yaml
notion:
  branches:
    - main
    - production
```

**Workaround (if not configured):** Create separate Notion pages for each branch or use branch-specific workspace IDs.

#### Cache Collisions on Shared Runners
**Issue:** GitHub Actions cache keys were not branch-scoped in early versions, causing cross-branch pollution.

**Status:** Fixed in v0.4.0 (cache keys now include `${{ github.ref_name }}`).

**Workaround (if using <v0.4.0):** Clear Actions cache manually in GitHub Settings → Actions → Management → Caches.

### Markdown Publisher

#### Large Diagrams in Markdown
**Issue:** Unicode diagrams work well for simple architectures, but can become unwieldy for 50+ modules.

**Current Behavior:** System generates box-drawing diagrams regardless of size.

**Workaround:** Filter modules by domain in `.repolens.yml`:
```yaml
scan:
  ignore:
    - "**/*.test.js"
    - "**/fixtures/**"
```

---

## 🤖 AI-Assisted Documentation

### Provider-Specific Issues

#### OpenAI Rate Limits
**Issue:** Free tier OpenAI accounts may hit rate limits on large repositories.

**Symptom:** `Too Many Requests` errors during document generation.

**Workaround:**
1. Upgrade to OpenAI paid tier, or
2. Point `REPOLENS_AI_PROVIDER=openai_compatible` and `REPOLENS_AI_BASE_URL` at a local server (Ollama, LM Studio), or
3. Run without AI enhancement (deterministic mode, no API key required)

#### Anthropic Context Window Limits
**Issue:** Claude models have 200k token limit; very large repositories may exceed this.

**Symptom:** API errors about context length during synthesis.

**Workaround:** Use structured context mode (default) which sends only JSON artifacts, not raw code.

#### Azure OpenAI Availability
**Issue:** Azure OpenAI requires separate deployment and endpoint configuration.

**Status:** Supported as an OpenAI-compatible endpoint. Set `REPOLENS_AI_PROVIDER=azure` (or `openai_compatible`) and `REPOLENS_AI_BASE_URL` to your deployment URL. The API key is `REPOLENS_AI_API_KEY`. `AZURE_OPENAI_*` names are not read as configuration.

### Hallucination Prevention

#### AI Context Boundaries
**Issue:** Even with structured context, AI may occasionally make logical leaps.

**Status:** Mitigated in v1.4.0 — `truncateContext()` enforces a 12K character cap with progressive field pruning.

**Mitigation:** 
- Prompts enforce word limits and require evidence-based reasoning
- AI receives only JSON artifacts (stats, domains, modules, routes)
- Never receives raw code to prevent fabrication
- Deterministic fallback available (disable AI with no API key)

**Best Practice:** Review generated documentation before publishing to stakeholders.

---

## 🔧 Configuration

### Config Discovery

#### Search Walks to the Filesystem Root
**Issue:** `.repolens.yml` discovery walks parent directories until the filesystem root. It does not stop at the git root.

**Impact:** A config in a parent directory outside the repository can be selected.

**Workaround:** Use `--config` flag explicitly:
```bash
npx @chappibunny/repolens@latest publish --config ../shared/.repolens.yml
```

#### YAML Schema Version Compatibility
**Issue:** `.repolens.yml` must set `configVersion: 1`. Schema v1 is frozen. New publishers, including Obsidian in 1.13.0, are optional fields and do not bump `configVersion`.

**Status:** `repolens migrate` adds `configVersion: 1` to legacy configs. A future breaking schema will be a new `configVersion` and a major release.

**Best Practice:** Pin the npm version if you need a known release. Optional blocks such as `obsidian` can be added without a migration.

---

## 📦 Package Management

### Scoped Package Name
**Issue:** Package was renamed from `repolens` to `@chappibunny/repolens` due to npm name conflict.

**Impact:** Old documentation may reference unscoped name.

**Migration:** Use `npx @chappibunny/repolens migrate` to automatically update workflows.

**Note:** Unscoped `repolens` package (v0.0.1) is a placeholder from another author.

---

## 🛡️ Security

### Secrets in Telemetry
**Issue:** Sentry error tracking could theoretically capture environment variables in stack traces.

**Mitigation:** `beforeSend()` hook in `src/utils/telemetry.js` strips:
- Cookies
- Authorization headers  
- Full file paths (sanitized to project-relative)
- Query parameters

**Best Practice:** Use `REPOLENS_TELEMETRY_ENABLED=false` (default) if handling extremely sensitive data.

### GitHub Token Permissions
**Issue:** Architecture Diff comments are easy to over-permission. The comment is an issue comment on a pull request (`GET` and `POST /repos/{owner}/{repo}/issues/{number}/comments`, `PATCH /repos/{owner}/{repo}/issues/comments/{id}` in `src/delivery/comment.js`). `contents: write` does not grant that API, and it does allow pushing commits.

**Requirement:** GitHub accepts either `issues: write` or `pull-requests: write` for those three endpoints. `repolens init` grants only the pull request scope, because the comment runs only when `GITHUB_EVENT_NAME` is `pull_request`:

```yaml
permissions:
  contents: read
  pull-requests: write
```

`contents: read` checks out the repository. `pull-requests: write` lists, creates, and updates the conversation comment. `issues: write` is not granted. `contents: write` is not granted.

`repolens init` does not overwrite an existing workflow file. Add `pull-requests: write` by hand if `.github/workflows/repolens.yml` is already present.

**Wiki:** GitHub Wiki publishing pushes `{repo}.wiki.git` and still needs `contents: write` on the job that publishes the wiki. Add that permission only when the `github_wiki` publisher is enabled.

**This repository:** Test and security jobs use `contents: read`. The documentation publish job keeps `contents: write` because wiki pushes use that job's `GITHUB_TOKEN`. The release job is the only one with `id-token: write` (npm provenance). The main-branch publish workflow does not run on `pull_request`, so it does not post Architecture Diff comments.

**Fork pull requests:** A `pull_request` workflow from a fork receives a read-only token even when the file requests `pull-requests: write`. The comment logs a warning and publish continues.

---

## 🚀 Performance

### Large Repository Scanning
**Issue:** Repositories with >10,000 files may have slow scan times.

**Current Behavior:** 
- Warning at 10k files
- Hard failure at 50k files

**Workaround:** Narrow `scan.ignore` (the schema key is `ignore`, not `exclude`):
```yaml
scan:
  ignore:
    - "**/node_modules/**"
    - "**/dist/**"
    - "**/build/**"
    - "**/__tests__/**"
```

### AI Generation Speed
**Issue:** Full document generation with AI can take 2-5 minutes for large codebases.

**Expected Behavior:** This is normal due to API rate limits and model processing time.

**Workaround:** 
- Use deterministic mode (no AI) for faster generation
- Cache results in CI (already implemented via Actions cache)

---

## � CI/CD

### npm install and Vitest 4.1
**Issue:** npm 10 can crash with `Cannot read properties of null (reading 'edgesOut')` when it re-resolves Vitest 4.1's optional peer dependencies from scratch.

**Fix:** CI uses `npm ci` with the committed lockfile. To refresh the lockfile, use npm 11 or newer (`npx npm@11 install`). That records every Rolldown platform package so Linux runners can install `@rolldown/binding-linux-x64-gnu`.

---

## Pull request comments from forks

**Issue:** A pull request opened from a fork cannot be commented on with the workflow's `GITHUB_TOKEN`. GitHub downgrades that token to read-only, even when the workflow asks for `pull-requests: write`.

**Expected behavior:** `command: comment` detects the fork (and a 403 from the API) and writes the architecture diff to the job summary. The job succeeds. It does not post a second comment later from the same token.

**Workaround:** Review the job summary, or push the branch to the base repository and re-run. RepoLens does not switch the workflow to `pull_request_target`.

A shallow checkout (`fetch-depth: 1`) does not contain the base commit. The comment then says the code-health delta needs `fetch-depth: 0`. The file list can still be empty. Set `fetch-depth: 0` on `actions/checkout`.

---

## 🔮 Planned Improvements

### Shipped since this list was last current
- [x] Obsidian vault publisher (1.13.0)
- [x] VS Code extension ([Marketplace](https://marketplace.visualstudio.com/items?itemName=repolensdox.repolensdox))
- [x] MCP server, GitHub Action, and docs badge (1.14.0)
- [x] Sticky architecture pull request comment, code-health badge, and gallery explained pages (in the repo, not yet on npm)
- [x] Registry name `io.github.CHAPIBUNNY/repolens` (1.14.1)

### Future
- [ ] Cross-repository architecture analysis
- [ ] Slack notifications
- [ ] Custom webhook support

---

## 📝 Reporting Issues

If you encounter a bug not listed here:

1. **Check Sentry:** If telemetry enabled, error automatically reported
2. **GitHub Issues:** https://github.com/CHAPIBUNNY/repolens/issues
3. **Include:**
   - RepoLens version (`npx @chappibunny/repolens@latest version`)
   - Node.js version (`node --version`)
   - Operating system
   - `.repolens.yml` config (sanitize secrets)
   - Error message and stack trace
   - Steps to reproduce

---

## 🤝 Contributing

Know a workaround? Found a fix? Submit a PR:

1. Fork repository
2. Create branch: `git checkout -b fix/your-issue`
3. Add test case to `tests/` covering the issue
4. Implement fix
5. Verify `npm test` passes
6. Submit PR with clear description

We prioritize issues with:
- ✅ Reproducible test case
- ✅ Clear user impact
- ✅ Proposed solution or workaround
