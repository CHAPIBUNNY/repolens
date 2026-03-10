# Migration Guide

This guide helps you upgrade RepoLens across breaking changes and major versions.

## � Version 0.4.0 Migration (Latest)

### Critical: Update GitHub Actions Workflow

**⚠️ If you see this error:**
```
Run cd tools/repolens
cd: tools/repolens: No such file or directory
Error: Process completed with exit code 1.
```

**Your workflow file has an outdated format.** Update `.github/workflows/repolens.yml`:

**❌ Old format (v0.3.0 and earlier):**
```yaml
- name: Generate documentation
  run: |
    cd tools/repolens
    npm install
    npx @chappibunny/repolens publish
```

**✅ New format (v0.4.0+):**
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
    REPOLENS_AI_PROVIDER: openai
  run: npx @chappibunny/repolens@latest publish
```

### New Features in v0.4.0

- ✨ **AI-Assisted Documentation** - Natural language explanations for non-technical audiences
- ✨ **11 Document Types** - 6 deterministic + 5 AI-enhanced (optional)
- ✨ **External API Detection** - Tracks OpenAI, Notion, npm, GitHub API integrations
- ✨ **Business Domain Inference** - Maps code structure to business functions
- ✨ **Data Flow Analysis** - Understands how information moves through the system
- ✨ **Hybrid Mode** - Get deterministic baseline + AI enhancements

### AI Features (Optional)

Add to `.repolens.yml`:

```yaml
ai:
  enabled: true
  mode: hybrid  # deterministic + AI-enhanced
  provider: openai
  model: gpt-4-turbo-preview
  temperature: 0.3

features:
  executive_summary: true   # Non-technical project overview
  business_domains: true    # Domain mapping (auth, payments, etc.)
  user_stories: true        # Inferred use cases
  data_flows: true          # Information movement analysis
  security_analysis: true   # Security posture assessment
  change_impact: false      # Architecture diff analysis (coming soon)
```

Add GitHub secret:
```bash
# In your repository: Settings → Secrets → Actions
REPOLENS_AI_API_KEY=sk-...  # Your OpenAI API key
```

**Cost:** ~$0.10-$0.40 per run with gpt-4-turbo-preview

### Configuration Updates

Update `outputs.pages` in `.repolens.yml` to include AI-enhanced documents:

```yaml
outputs:
  pages:
    # Core docs (always generated)
    - system_overview
    - module_catalog
    - api_surface
    - route_map
    - system_map
    - arch_diff
    
    # AI-enhanced docs (optional, requires ai.enabled: true)
    - executive_summary
    - business_domains
    - user_stories
    - data_flows
    - security_analysis
```

### Backward Compatibility

**No breaking changes!** v0.4.0 is 100% backward compatible:

- ✅ Existing `.repolens.yml` configs work without modification
- ✅ AI features are opt-in (deterministic mode is default)
- ✅ All 6 original documents unchanged
- ✅ No new required dependencies

**Test deterministic mode (same as v0.3.0):**
```bash
npx @chappibunny/repolens@latest publish
# Output: 6 core documents (no AI needed)
```

**Test AI-enhanced mode:**
```bash
# After adding ai config to .repolens.yml
npx @chappibunny/repolens@latest publish
# Output: 11 documents (6 core + 5 AI-enhanced)
```

### Troubleshooting

**❌ Error: `AI generation failed`**

**Normal behavior!** RepoLens falls back to deterministic documentation when AI fails. Check:
1. `REPOLENS_AI_API_KEY` is set in GitHub Secrets
2. API key has sufficient credits
3. OpenAI status page (transient 500 errors handled automatically)

**✅ Expected output:**
```
ℹ️ AI Features: Enabled (hybrid mode)
❌ Executive Summary generation failed. Using deterministic version.
✅ System Overview generated
```

---

## �🔄 How Updates Work

### Automatic Update Notifications

RepoLens checks for updates automatically and shows a notification if you're running an outdated version:

```
┌────────────────────────────────────────────────────────────┐
│                   📦 Update Available                      │
├────────────────────────────────────────────────────────────┤
│  Current: 0.2.0    → Latest: 0.3.0                        │
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

The `doctor` command always checks your RepoLens version and shows if updates are available.

## 📦 Installation Methods

### Method 1: GitHub Actions (Recommended)

Your workflow automatically uses the latest version with `npx @chappibunny/repolens@latest`:

```yaml
- name: Generate and publish documentation
  run: npx @chappibunny/repolens@latest publish
```

**No action needed** - you're always on the latest version! ✅

### Method 2: Global Installation

If you installed globally with `npm install -g repolens`:

```bash
# Check current version
repolens --version

# Update to latest
npm install -g repolens@latest

# Verify update
repolens --version
```

### Method 3: Local Installation

If you installed locally in your project:

```bash
# Check current version
npx @chappibunny/repolens --version

# Update to latest
npm install -g @chappibunny/repolens@latest

# Verify update
npx @chappibunny/repolens --version
```

## 🚀 Version 0.3.0 Migration (Current)

### Breaking Changes

**Mermaid Diagrams Replaced with Unicode**

- **Old:** System maps generated as Mermaid SVG images
- **New:** System maps use Unicode box-drawing characters

**Impact:** None for most users - diagrams still work everywhere

**Action Required:** None! Your existing `.repolens.yml` works as-is.

### New Features

- ✨ **Interactive credential collection** during `repolens init`
- ✨ **Automatic update notifications** (you're seeing them now!)
- ✨ **Simplified workflows** - no more mermaid-cli installation needed
- ✨ **Beautiful Unicode diagrams** with emoji icons

### Configuration Changes

**No changes required** - your existing configuration is fully compatible.

### Workflow Changes

Old workflow (still works):
```yaml
- name: Install dependencies
  run: npm ci

- name: Publish documentation  
  run: npx @chappibunny/repolens publish
```

New workflow (recommended):
```yaml
- name: Generate and publish documentation
  run: npx @chappibunny/repolens@latest publish
```

## 📋 Version History

### v0.3.0 (March 2026)

**Breaking Changes:**
- Replaced Mermaid diagrams with Unicode architecture maps
- Removed `@mermaid-js/mermaid-cli` dependency (50MB saved!)
- Simplified GitHub Actions workflow template

**New Features:**
- Interactive Notion credential collection
- Automatic update notifications
- Enhanced documentation for non-technical users
- Non-blocking background update checks

**Migration:** None required - fully backward compatible

---

### v0.2.0 (March 2026)

**New Features:**
- Interactive onboarding with credential prompts
- Auto-detection of Notion secrets
- Branch-aware publishing with title namespacing
- Package.json metadata extraction
- Emoji icons in documentation

**Migration:** None required

---

### v0.1.1 (Initial Release)

Initial CLI release with:
- `init`, `doctor`, `publish` commands
- Notion and Markdown publishers
- Route map generation
- System map generation (Mermaid)

## 🆘 Troubleshooting

### Update notification not showing

**Cause:** Checks are cached for 24 hours to avoid excessive API calls

**Solution:** 
```bash
# Force an immediate check
repolens doctor
```

---

### "Command not found: repolens"

**Cause:** Not installed or not in PATH

**Solutions:**
```bash
# Option 1: Use npx (no installation needed)
npx @chappibunny/repolens@latest publish

# Option 2: Install globally
npm install -g @chappibunny/repolens@latest

# Option 3: Install locally
npm install @chappibunny/repolens@latest
```

---

### Old version still running after update

**Cause:** npm cache or multiple installations

**Solutions:**
```bash
# Clear npm cache
npm cache clean --force

# Remove old installations
npm uninstall -g repolens
npm uninstall repolens

# Reinstall latest
npm install -g @chappibunny/repolens@latest
```

---

### GitHub Actions using old version

**Cause:** Workflow not using `@latest` tag

**Solution:** Update workflow to use:
```yaml
run: npx @chappibunny/repolens@latest publish
```

## 📚 Additional Resources

- [Changelog](CHANGELOG.md) - Full version history
- [GitHub Repository](https://github.com/CHAPIBUNNY/repolens)
- [Issues & Support](https://github.com/CHAPIBUNNY/repolens/issues)
