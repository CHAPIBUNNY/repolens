# Changelog

All notable changes to RepoLens will be documented in this file.

## 0.3.0

### 💥 Breaking Changes
- **Removed Mermaid diagram system**: Replaced complex SVG/mermaid.ink pipeline with simple Unicode architecture diagrams
- System map now renders as beautiful ASCII art using box-drawing characters
- No longer requires 50MB @mermaid-js/mermaid-cli dependency
- No longer generates or commits SVG files to repository
- Diagrams now always work reliably in Notion and Markdown without external dependencies

### ✨ New Features
- **Automatic update notifications**: CLI checks for new versions and notifies users
- **Version checking in doctor command**: `repolens doctor` now shows if updates are available
- **24-hour cache**: Update checks cached to avoid excessive npm registry calls
- **Non-blocking**: Update check runs in background, doesn't slow down commands

### 🎨 Improvements
- **Unicode Architecture Diagrams**: Clean, always-working diagrams with emoji icons (🎯, ⚙️, 📋, 🔌, 🛠️, ✅, 📦)
- **Simpler workflow**: Removed Mermaid CLI installation and SVG commit steps from GitHub Actions
- **Faster publishing**: No SVG generation or git operations needed
- **Better reliability**: No URL length limits, no image loading issues, no external service dependencies
- **Interactive credential collection**: `repolens init` now prompts for Notion credentials and auto-creates .env file
- **Smart CI detection**: Prompts skip in CI but work via npx

### 🔧 Technical Changes
- Added `src/utils/update-check.js` with version comparison logic
- Integrated update checking at CLI startup (non-blocking)
- Enhanced doctor command with forced version checking
- Simplified `renderSystemMap()` to return plain markdown with Unicode diagrams
- Removed `generateMermaidImageUrl()`, `prepareDiagramUrl()`, and mermaid.ink fallback logic
- Simplified `replacePageContent()` in notion.js - no longer handles image embedding
- Simplified markdown publisher - no longer generates SVG files
- Cleaned up GitHub Actions workflow - removed write permissions and diagram commits

### 📦 Package Changes
- Removed test artifacts from repository (cleaner npm package)
- Updated .gitignore to exclude test files
- Simplified workflow template to use `npx repolens@latest`

## 0.2.0

- Added interactive credential collection to `repolens init`
- Improved documentation clarity for non-technical users
- Added emoji icons to all documentation pages
- Auto-detection of Notion secrets for seamless publishing
- Branch-aware publishing with title namespacing
- URL length validation for Notion image embeds
- Package.json metadata extraction for tech stack detection

## 0.1.1

- Initial RepoLens CLI
- Added `init` command
- Added `doctor` command
- Added `publish` command
- Added `version` and `help` commands
- Added Notion publisher
- Added Markdown publisher
- Added route map generation
- Added system map generation
- Added architecture diff generation
- Added PR comment publishing
- Added repo structure autodetection in `init`
- Added `.env.example` generation
- Added `README.repolens.md` generation
- Added test coverage for config, init, doctor, markdown publisher, and CLI