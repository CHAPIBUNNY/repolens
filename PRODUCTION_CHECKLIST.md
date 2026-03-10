# Production Deployment Checklist

Ensure RepoLens is properly configured and secured before deploying to production. This checklist helps teams validate their setup and avoid common pitfalls.

**Version:** 0.7.0  
**Last Updated:** July 2025

---

## 🎯 Pre-Deployment Requirements

### ✅ System Requirements

- [ ] **Node.js 18+** installed (`node --version`)
- [ ] **npm 8+** or equivalent package manager
- [ ] **Git repository** initialized with `.git` directory
- [ ] **Write access** to repository for GitHub Actions workflows

### ✅ Package Installation

- [ ] Install RepoLens: `npx @chappibunny/repolens@latest --version`
- [ ] Run version check: Should display `0.7.0` or higher
- [ ] Check for updates: Tool notifies if newer version available

---

## 📋 Configuration Setup

### ✅ Initialize Configuration

```bash
npx @chappibunny/repolens@latest init
```

- [ ] `.repolens.yml` created in repository root
- [ ] `.env.example` created (if not exists)
- [ ] `.github/workflows/` directory created
- [ ] GitHub Actions workflow file generated

### ✅ Validate Configuration Schema

```bash
npx @chappibunny/repolens@latest doctor
```

**Expected Output:** ✅ All checks pass

**Doctor validates:**
- [ ] `.repolens.yml` exists and is valid YAML
- [ ] `configVersion: 1` present
- [ ] At least one publisher configured (notion, markdown, or confluence)
- [ ] Required scan patterns specified
- [ ] `.git` directory present

### ✅ Repository Scanning Configuration

Edit `.repolens.yml`:

```yaml
scan:
  include:
    - "src/**/*.{js,ts,jsx,tsx}"
    - "lib/**/*.{js,ts}"
    - "app/**/*.{js,ts,jsx,tsx}"
  
  exclude:
    - "**/node_modules/**"
    - "**/dist/**"
    - "**/build/**"
    - "**/*.test.{js,ts}"
    - "**/__tests__/**"
    - "**/fixtures/**"
```

**Verify:**
- [ ] Patterns match your project structure
- [ ] Exclude patterns prevent scanning generated code
- [ ] Test locally: `npx @chappibunny/repolens@latest publish --dry-run`

---

## 🔐 Security Configuration

### ✅ Security Validation (Phase 3)

**Run Security Checks**:
```bash
npm audit
npm test -- tests/security-fuzzing.test.js
```

**Expected Results**:
- [ ] **0 vulnerabilities** in dependency audit
- [ ] **43/43 security tests passing**
  - Secrets detection (6 tests)
  - Config validation security (7 tests)
  - Path validation (4 tests)
  - Fuzzing malformed YAML (6 tests)
  - Injection attack prevention (16 tests)
  - Boundary conditions (4 tests)

**Verify Security Features**:
- [ ] Config validation active (rejects injection attacks)
- [ ] Secrets sanitization active (all logger output cleaned)
- [ ] Rate limiting active (3 req/sec for APIs)
- [ ] GitHub Actions pinned to commit SHAs
- [ ] Minimal permissions in workflows

**Security Documentation**:
- [ ] Review [SECURITY.md](SECURITY.md) for threat model
- [ ] Understand secret detection patterns
- [ ] Configure security reporting process

### ✅ GitHub Secrets Setup

Navigate to: **Repository Settings → Secrets and variables → Actions → New repository secret**

#### Required for Notion Publishing

- [ ] **NOTION_TOKEN**
  - Create at: https://www.notion.so/my-integrations
  - Type: Internal Integration
  - Capabilities: Insert content, Read content, Update content
  - Permissions: Content (Read & Write)
  - Test: `curl -H "Authorization: Bearer $NOTION_TOKEN" https://api.notion.com/v1/users/me`

- [ ] **NOTION_WORKSPACE_ID** (or **REPOLENS_NOTION_WORKSPACE_ID**)
  - Get from: Notion page URL → Database ID
  - Format: 32-character hex string (e.g., `abc12345def67890...`)

#### Optional: Confluence Publishing

- [ ] **CONFLUENCE_URL**
  - Your Atlassian Cloud URL (e.g., `https://your-company.atlassian.net/wiki`)

- [ ] **CONFLUENCE_EMAIL**
  - Your Atlassian account email

- [ ] **CONFLUENCE_API_TOKEN**
  - Create at: https://id.atlassian.com/manage-profile/security/api-tokens

- [ ] **CONFLUENCE_SPACE_KEY**
  - Your target Confluence space key (e.g., `DOCS`)

- [ ] **CONFLUENCE_PARENT_PAGE_ID**
  - Page ID where documentation should be nested

#### Optional: AI-Enhanced Documentation

- [ ] **REPOLENS_AI_API_KEY** (or **OPENAI_API_KEY**)
  - OpenAI: Create at https://platform.openai.com/api-keys
  - Anthropic: Create at https://console.anthropic.com/settings/keys
  - Azure: Get from Azure Portal → Azure OpenAI Service

- [ ] **AI_PROVIDER** (if not OpenAI)
  - Values: `openai` | `anthropic` | `azure` | `ollama`
  - Default: `openai`

#### Optional: Error Tracking (Step 1 Complete)

- [ ] **REPOLENS_TELEMETRY_ENABLED**
  - Values: `true` | `false`
  - Default: `false` (opt-in)
  - Sentry DSN configured in `src/utils/telemetry.js` (if forked)

### ✅ Secrets Validation

```bash
# Test locally with .env (DO NOT commit .env to git)
cp .env.example .env
# Add secrets to .env
npx @chappibunny/repolens@latest publish
```

**Verify:**
- [ ] No "missing secret" errors
- [ ] Notion pages created/updated
- [ ] AI generation works (if enabled)
- [ ] `.env` added to `.gitignore`

---

## 🚀 GitHub Actions Configuration

### ✅ Workflow Migration (if upgrading from v0.3.x)

```bash
npx @chappibunny/repolens@latest migrate
```

**Verify changes:**
- [ ] Preview with `--dry-run` flag first
- [ ] Review diff: `git diff .github/workflows/`
- [ ] Package updated to `@chappibunny/repolens@latest`
- [ ] Node.js setup step added (`actions/setup-node@v4`)
- [ ] Environment variables added to publish step
- [ ] Backup files created (`.github/workflows/*.backup`)

### ✅ Workflow Permissions

Edit `.github/workflows/*.yml`:

```yaml
permissions:
  contents: write  # For PR comments (future: reduce to read)
  pull-requests: write  # If using PR comment delivery
```

**Verify:**
- [ ] Permissions match your security policy
- [ ] Workflows run successfully in Actions tab
- [ ] No permission errors in workflow logs

### ✅ Branch-Aware Publishing (Notion)

Edit `.repolens.yml`:

```yaml
notion:
  workspaceId: ${{ secrets.NOTION_WORKSPACE_ID }}
  branches:
    - main
    - production
    # Add other branches that should publish
```

**Purpose:** Prevents feature branches from overwriting production Notion pages.

**Verify:**
- [ ] Only intended branches listed
- [ ] Test on feature branch: Should skip Notion publish
- [ ] Test on main branch: Should publish successfully

### ✅ Caching Configuration

Workflow should include:

```yaml
- name: Cache RepoLens artifacts
  uses: actions/cache@v4
  with:
    path: .repolens/
    key: repolens-${{ github.ref_name }}-${{ hashFiles('**/*.js', '**/*.ts') }}
    restore-keys: |
      repolens-${{ github.ref_name }}-
      repolens-main-
```

**Verify:**
- [ ] Cache key includes branch name (prevents cross-branch pollution)
- [ ] Cache hit reduces workflow time by 30-50%
- [ ] Old caches cleared periodically (Settings → Actions → Caches)

---

## 📊 Monitoring & Observability

### ✅ GitHub Actions Monitoring

Navigate to: **Actions tab** → Select workflow run

**Check:**
- [ ] Workflow completes successfully (green checkmark)
- [ ] Scan step finds expected file count
- [ ] Render step generates documents without errors
- [ ] Publish step updates Notion/Confluence/Markdown successfully
- [ ] Time: <2 min for deterministic, <5 min with AI

### ✅ Error Tracking (if telemetry enabled)

Sentry Dashboard: https://sentry.io/organizations/YOUR_ORG/projects/

**Monitor:**
- [ ] Error rate: Should be near 0%
- [ ] Sample rate: 10% of events captured
- [ ] Breadcrumbs: Show command flow before errors
- [ ] Context: Includes command, config, file count

### ✅ Notion Integration Health

**Validate:**
- [ ] Pages created in correct workspace
- [ ] Titles match expected format (`[branch]` suffix for non-main)
- [ ] Content includes all 11 document sections
- [ ] Diagrams render properly (Unicode box-drawing)
- [ ] Updates don't create duplicates

### ✅ Markdown Output Verification

```bash
ls -la .repolens/docs/
```

**Expected files:**
- [ ] `system-overview.md`
- [ ] `module-catalog.md`
- [ ] `api-surface.md`
- [ ] `route-map.md`
- [ ] `architecture-diff.md` (if changes detected)
- [ ] `system-map.md` (ASCII dependency diagram)

---

## 🧪 Testing & Validation

### ✅ Local Testing

```bash
# Dry run (no actual publishing)
npx @chappibunny/repolens@latest publish --dry-run

# Full local run
npx @chappibunny/repolens@latest publish

# Check generated artifacts
ls -R .repolens/
cat .repolens/docs/system-overview.md
```

**Verify:**
- [ ] Scan completes without warnings
- [ ] File count matches expectations
- [ ] Documents generated successfully
- [ ] Markdown files readable and accurate
- [ ] Notion pages updated (if configured)

### ✅ PR Testing

1. Create test PR with small change
2. Wait for GitHub Actions workflow to complete
3. Verify:
   - [ ] Workflow runs on PR
   - [ ] Architecture diff generated (if enabled)
   - [ ] PR comment posted (if delivery configured)
   - [ ] No secrets leaked in logs

### ✅ Performance Benchmarking

**Expected timings:**
- [ ] Scan: 5-30 seconds (depends on repo size)
- [ ] Render: 2-10 seconds (deterministic mode)
- [ ] AI Generation: 60-180 seconds (if enabled)
- [ ] Publish: 10-30 seconds (Notion API calls)
- [ ] **Total:** <2 min (deterministic), <5 min (with AI)

**If exceeding limits:**
- Check `scan.exclude` patterns
- Reduce AI model complexity
- Enable GitHub Actions caching

---

## 🔄 Maintenance Tasks

### ✅ Weekly

- [ ] Review Notion pages for accuracy
- [ ] Check GitHub Actions workflow success rate
- [ ] Monitor Sentry error rate (if enabled)
- [ ] Verify documentation reflects recent changes

### ✅ Monthly

- [ ] Update RepoLens: `npx @chappibunny/repolens@latest version` (check for updates)
- [ ] Run migration: `npx @chappibunny/repolens@latest migrate` (if new version)
- [ ] Review Known Issues: Read `KNOWN_ISSUES.md` for new workarounds
- [ ] Rotate API keys: Best practice for long-running integrations

### ✅ Quarterly

- [ ] Audit GitHub Secrets: Ensure tokens not expired
- [ ] Review `.repolens.yml`: Update exclude patterns as codebase grows
- [ ] Test disaster recovery: Delete Notion pages, re-run publish
- [ ] Update team documentation: Reflect any config changes

---

## 📈 Scaling Considerations

### For Large Repositories (>5,000 files)

- [ ] Add aggressive `scan.exclude` patterns
- [ ] Consider splitting into multiple configs (monorepo support)
- [ ] Increase GitHub Actions timeout (default: 10 min)
- [ ] Use self-hosted runners for faster execution

### For Large Teams (>10 developers)

- [ ] Document onboarding process (link to this checklist)
- [ ] Create shared `.repolens.yml` template
- [ ] Establish PR review process for config changes
- [ ] Consider dedicated Notion workspace for docs

### For Multi-Repo Organizations

- [ ] Standardize `.repolens.yml` across repos
- [ ] Use organization-level GitHub Secrets
- [ ] Create shared Notion workspace structure
- [ ] Document cross-repo documentation strategy

---

## 🆘 Troubleshooting

### Common Issues

#### "Config file not found"
```bash
npx @chappibunny/repolens@latest doctor
# If fails: npx @chappibunny/repolens@latest init
```

#### "NOTION_TOKEN not set"
- Check GitHub Secrets → Actions → Secrets
- Verify secret name matches exactly (case-sensitive)
- Test locally: `echo $NOTION_TOKEN` (should not be empty)

#### "Invalid workflow file"
- Run migration: `npx @chappibunny/repolens@latest migrate`
- Review KNOWN_ISSUES.md for recent fixes
- Check YAML syntax: https://www.yamllint.com/

#### "Rate limit exceeded" (OpenAI)
- Upgrade to paid tier, or
- Use `AI_PROVIDER=ollama` (local), or
- Disable AI: Remove `REPOLENS_AI_API_KEY` secret

#### "Scan found 0 files"
- Check `scan.include` patterns in `.repolens.yml`
- Verify patterns match your file structure
- Test: `npx fast-glob "src/**/*.js"` (should list files)

### Get Help

- **Documentation:** README.md, KNOWN_ISSUES.md
- **GitHub Issues:** https://github.com/CHAPIBUNNY/repolens/issues
- **Error Tracking:** Automatic (if `REPOLENS_TELEMETRY_ENABLED=true`)

---

## ✅ Final Sign-Off

Before declaring "production ready":

- [ ] All checklist items above completed
- [ ] `npx @chappibunny/repolens@latest doctor` passes
- [ ] Test PR successfully generated documentation
- [ ] Team reviewed and approved generated docs
- [ ] Notion workspace configured and accessible
- [ ] Monitoring in place (GitHub Actions + Sentry)
- [ ] Team trained on updating `.repolens.yml`
- [ ] Known Issues documented for team reference

**Approved by:** _______________  
**Date:** _______________  
**RepoLens Version:** 0.7.0

---

## 📚 Additional Resources

- **README.md** - Quick start, installation, configuration
- **KNOWN_ISSUES.md** - Current limitations and workarounds
- **TELEMETRY.md** - Privacy policy and error tracking details
- **CHANGELOG.md** - Version history and upgrade notes
- **GitHub Issues** - Bug reports and feature requests

---

**Pro Tip:** Bookmark this checklist and run through it quarterly to ensure your RepoLens deployment stays healthy and up-to-date.
