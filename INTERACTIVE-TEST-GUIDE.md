# Interactive Init Testing Guide

## 🎯 What Was Added

The `repolens init` command now includes interactive credential collection that:
- Prompts: "Would you like to publish to Notion? (Y/n)"
- If yes, collects `NOTION_PARENT_PAGE_ID` and `NOTION_TOKEN` interactively
- Auto-creates `.env` file with the credentials
- Ensures `.env` is added to `.gitignore` for security
- Shows helpful instructions for finding Notion page IDs and tokens
- Displays context-aware success messages based on setup choices

## 🧪 Manual Testing Instructions

### Test 1: Interactive Mode - Skip Notion Setup

```bash
# Create a temporary test directory
mkdir /tmp/test-repolens-skip-notion
cd /tmp/test-repolens-skip-notion

# Run init (will prompt interactively)
npx repolens init

# When prompted "Would you like to publish to Notion? (Y/n):" 
# Type: n

# Expected Results:
# ✅ .repolens.yml created
# ✅ .github/workflows/repolens.yml created  
# ✅ .env.example created
# ✅ README.repolens.md created
# ❌ .env NOT created (user chose No)
# ✅ Success message shows manual setup instructions
```

### Test 2: Interactive Mode - Full Notion Setup

```bash
# Create a temporary test directory
mkdir /tmp/test-repolens-with-notion
cd /tmp/test-repolens-with-notion

# Run init (will prompt interactively)
npx repolens init

# When prompted "Would you like to publish to Notion? (Y/n):"
# Type: Y (or just press Enter for default Yes)

# When prompted "NOTION_PARENT_PAGE_ID:"
# Type: abc123def456 (or any test value)

# When prompted "NOTION_TOKEN:"  
# Type: secret_test123 (or any test value)

# Expected Results:
# ✅ .repolens.yml created
# ✅ .github/workflows/repolens.yml created
# ✅ .env.example created
# ✅ .env created with NOTION_TOKEN and NOTION_PARENT_PAGE_ID
# ✅ .gitignore created or updated with .env entry
# ✅ README.repolens.md created
# ✅ Success message shows "Notion publishing is ready!"

# Verify .env contents:
cat .env
# Should show:
# NOTION_TOKEN=secret_test123
# NOTION_PARENT_PAGE_ID=abc123def456
# NOTION_VERSION=2022-06-28

# Verify .gitignore has .env:
cat .gitignore
# Should contain: .env
```

### Test 3: CI Environment (Automated Mode)

```bash
# The interactive prompts automatically skip in CI environments
CI=true npx repolens init

# Expected Results:
# ✅ All files created without prompts
# ❌ .env NOT created (CI mode skips interactive setup)
# ✅ Success message shows manual setup instructions
```

### Test 4: Non-TTY Environment (Piped Input)

```bash
# When stdin is not a TTY (e.g., piped input), prompts are skipped
echo "y" | npx repolens init

# Expected Results:
# ✅ All files created without waiting for input
# ❌ .env NOT created (non-TTY mode skips interactive setup)
# ✅ Success message shows manual setup instructions
```

## 🔍 What to Look For

### Success Indicators
- ✅ Interactive prompts appear in real terminal (Test 1 & 2)
- ✅ Helpful instructions shown for finding Notion credentials
- ✅ `.env` file created with correct format when credentials provided
- ✅ `.env` added to `.gitignore` automatically
- ✅ Context-aware success messages based on setup choice
- ✅ No prompts in CI or piped environments (graceful degradation)

### Failure Indicators
- ❌ Prompts block in CI/automated environments
- ❌ `.env` file created with empty values
- ❌ `.env` not added to `.gitignore` (security risk!)
- ❌ Credentials overwrite existing `.env` file
- ❌ Generic success messages regardless of setup choice

## 📝 Expected User Experience

### Scenario A: New User Wants Notion
```
$ npx repolens init

RepoLens v0.2.0
────────────────────────────────────────

📝 Notion Setup (optional)
Would you like to publish to Notion? (Y/n): Y

To find your Notion Parent Page ID:
  1. Open the Notion page where you want docs published
  2. Copy the page URL (looks like: notion.so/workspace/abc123...)
  3. The page ID is the 32-character code at the end

NOTION_PARENT_PAGE_ID: abc123def456

To get your Notion Integration Token:
  1. Go to https://www.notion.so/my-integrations
  2. Create a new integration or use an existing one
  3. Copy the 'Internal Integration Token'
  4. Share the parent page with your integration

NOTION_TOKEN: secret_test123

✅ Created .env with your Notion credentials

✨ RepoLens initialization complete!

🎉 Notion publishing is ready!
   Your credentials are stored in .env (gitignored)

Next steps:
  1. Review .repolens.yml to customize your documentation
  2. Run 'npx repolens publish' to generate your first docs
  3. For GitHub Actions, add these repository secrets:
     - NOTION_TOKEN
     - NOTION_PARENT_PAGE_ID
  4. Commit the generated files (workflow will run automatically)
```

### Scenario B: User Skips Notion
```
$ npx repolens init

RepoLens v0.2.0
────────────────────────────────────────

📝 Notion Setup (optional)
Would you like to publish to Notion? (Y/n): n

Skipping Notion setup. You can configure it later via environment variables.

✨ RepoLens initialization complete!

Next steps:
  1. Review .repolens.yml to customize your documentation
  2. To enable Notion publishing:
     - Copy .env.example to .env and add your credentials, OR
     - Add GitHub secrets: NOTION_TOKEN, NOTION_PARENT_PAGE_ID
  3. Run 'npx repolens publish' to test locally
  4. Commit the generated files
```

## 🎓 Implementation Details

### Files Modified
- `src/init.js`:
  - Added `readline/promises` import for interactive input
  - New `promptNotionCredentials()` function with Y/n flow
  - New `ensureEnvInGitignore()` function for security
  - Updated `runInit()` to call credential prompt before file creation
  - Enhanced success messages based on setup choices

### Key Functions

#### `promptNotionCredentials()`
- Returns `null` if not TTY or in CI environment
- Prompts "Would you like to publish to Notion? (Y/n):"
- Shows helpful instructions for finding credentials
- Collects parent page ID and token interactively
- Returns `{ parentPageId, token }` or `null`

#### `ensureEnvInGitignore()`
- Reads existing `.gitignore` or creates new one
- Checks if `.env` entry already exists
- Appends `.env` line if missing
- Handles errors gracefully with warnings

### Security Features
- ✅ `.env` automatically added to `.gitignore`
- ✅ Existing `.env` files never overwritten
- ✅ Credentials only collected in interactive terminals
- ✅ No prompts block CI/automated environments

## 🚀 Next Steps

After validating the interactive flow works:
1. Update README.md to mention interactive setup
2. Consider adding validation for Notion credentials format
3. Add option to test Notion connection before saving
4. Support updating existing `.env` file (with confirmation)

## 📚 Related Files
- [src/init.js](../src/init.js) - Main implementation
- [test-interactive-init.sh](../test-interactive-init.sh) - Automated test
- [.repolens.yml]( ../.repolens.yml) - Generated config example
