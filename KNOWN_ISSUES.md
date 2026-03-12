# Known Issues & Limitations

This document tracks known issues, limitations, and edge cases in RepoLens. We're committed to transparency about what works, what doesn't, and what we're working on.

**Last Updated:** March 2026  
**Version:** 1.3.1

---

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
**Issue:** While migration is highly reliable (185 tests passing), edge cases may exist in complex workflows.

**Workaround:** 
1. Run `repolens migrate --dry-run` first
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
  exclude:
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
2. Use local model (Ollama) with `AI_PROVIDER=ollama`, or
3. Run without AI enhancement (deterministic mode, no API key required)

#### Anthropic Context Window Limits
**Issue:** Claude models have 200k token limit; very large repositories may exceed this.

**Symptom:** API errors about context length during synthesis.

**Workaround:** Use structured context mode (default) which sends only JSON artifacts, not raw code.

#### Azure OpenAI Availability
**Issue:** Azure OpenAI requires separate deployment and endpoint configuration.

**Status:** Supported but requires manual setup (see README.md).

**Configuration:**
```bash
AI_PROVIDER=azure
AZURE_OPENAI_API_KEY=your-key
AZURE_OPENAI_ENDPOINT=https://your-instance.openai.azure.com/
AZURE_OPENAI_DEPLOYMENT_NAME=your-deployment
```

### Hallucination Prevention

#### AI Context Boundaries
**Issue:** Even with structured context, AI may occasionally make logical leaps.

**Mitigation:** 
- Prompts enforce word limits and require evidence-based reasoning
- AI receives only JSON artifacts (stats, domains, modules, routes)
- Never receives raw code to prevent fabrication
- Deterministic fallback available (disable AI with no API key)

**Best Practice:** Review generated documentation before publishing to stakeholders.

---

## 🔧 Configuration

### Config Discovery

#### Search Stops at Git Root
**Issue:** `.repolens.yml` discovery walks up directories until hitting git root, then stops.

**Impact:** If config is outside repository root, it won't be found.

**Workaround:** Use `--config` flag explicitly:
```bash
npx @chappibunny/repolens@latest publish --config ../shared/.repolens.yml
```

#### YAML Schema Version Compatibility
**Issue:** `configVersion: 1` required in `.repolens.yml`, but no migration tool exists yet for future version bumps.

**Status:** Pre-1.0 schema changes may require manual migration.

**Best Practice:** Pin to specific versions in package.json if strict stability required.

---

## 📦 Package Management

### Scoped Package Name
**Issue:** Package was renamed from `repolens` to `@chappibunny/repolens` due to npm name conflict.

**Impact:** Old documentation may reference unscoped name.

**Migration:** Use `repolens migrate` to automatically update workflows.

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
**Issue:** GitHub Actions workflows need `contents: write` for PR comments, but this grants broad repository access.

**Current Requirement:**
```yaml
permissions:
  contents: write
```

**Planned:** Reduce to minimum required permissions:
```yaml
permissions:
  contents: read
  pull-requests: write  # Only for PR comments
```

---

## 🚀 Performance

### Large Repository Scanning
**Issue:** Repositories with >10,000 files may have slow scan times.

**Current Behavior:** 
- Warning at 10k files
- Hard failure at 50k files

**Workaround:** Use `.repolens.yml` exclude patterns:
```yaml
scan:
  exclude:
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

### macOS Lockfile on Linux Runners
**Issue:** A `package-lock.json` generated on macOS doesn't include Linux platform-specific optional dependencies (e.g., `@rollup/rollup-linux-x64-gnu` used by Vitest/Vite).

**Symptom:** `Cannot find module @rollup/rollup-linux-x64-gnu` during `npm test` in GitHub Actions.

**Fix:** All CI workflows now use:
```bash
rm -rf node_modules package-lock.json && npm install
```
Do NOT use `npm ci` in GitHub Actions workflows.

---

## 🔮 Planned Improvements

### Future
- [ ] Obsidian vault publisher
- [ ] Cross-repository architecture analysis
- [ ] VS Code extension for architecture visualization
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
5. Verify `npm test` passes (185 tests)
6. Submit PR with clear description

We prioritize issues with:
- ✅ Reproducible test case
- ✅ Clear user impact
- ✅ Proposed solution or workaround
