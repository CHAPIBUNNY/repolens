# RepoLens - GitHub Copilot Instructions

```
    ██████╗ ███████╗██████╗  ██████╗ ██╗     ███████╗███╗   ██╗███████╗
    ██╔══██╗██╔════╝██╔══██╗██╔═══██╗██║     ██╔════╝████╗  ██║██╔════╝
    ██████╔╝█████╗  ██████╔╝██║   ██║██║     █████╗  ██╔██╗ ██║███████╗
    ██╔══██╗██╔══╝  ██╔═══╝ ██║   ██║██║     ██╔══╝  ██║╚██╗██║╚════██║
    ██║  ██║███████╗██║     ╚██████╔╝███████╗███████╗██║ ╚████║███████║
    ╚═╝  ╚═╝╚══════╝╚═╝      ╚═════╝ ╚══════╝╚══════╝╚═╝  ╚═══╝╚══════╝
                        🔍 Repository Intelligence CLI 📊
```

## Project Overview

RepoLens is a repository intelligence CLI tool that automatically generates living architecture documentation. It analyzes codebases, extracts meaningful insights from package.json, creates visual dependency graphs, and publishes to Notion and/or Markdown. It operates autonomously via GitHub Actions and can be triggered locally.

**Version:** 0.2.0  
**Status:** Production-ready, pre-v1.0 stability guarantees  
**License:** MIT

## Core Value Proposition

RepoLens transforms static repositories into documented, understandable systems by:
1. **Scanning** - Fast-glob file matching with performance guardrails
2. **Analyzing** - Framework/tool detection from package.json and file patterns
3. **Rendering** - Markdown documentation with Mermaid dependency graphs
4. **Publishing** - Multi-output delivery (Notion + Markdown) with branch-aware safety

## Architecture

### Project Structure

```
bin/
  repolens.js           # CLI entry point
src/
  cli.js                # Main CLI orchestration + banner
  doctor.js             # Repository validation
  init.js               # Scaffolding for new repos
  core/
    config.js           # Configuration loading and validation
    config-schema.js    # Schema versioning (configVersion: 1)
    diff.js             # Git diff operations
    scan.js             # Repository scanning logic + metadata extraction
  delivery/
    comment.js          # PR comment management
  publishers/
    index.js            # Publisher orchestration + branch filtering
    markdown.js         # Markdown file generation
    notion.js           # Notion API integration + URL length handling
    publish.js          # Publishing pipeline + diagram URL validation
  renderers/
    render.js           # System overview, module catalog, API surface, route map
    renderDiff.js       # Architecture diff rendering
    renderMap.js        # System map (Mermaid dependency graphs)
  utils/
    logger.js           # Logging utilities
    retry.js            # Retry logic for API calls
    branch.js           # Multi-platform branch detection
    mermaid.js          # SVG rendering + GitHub URL generation
tests/                  # Vitest test suite (32 tests passing)
```

### Key Commands

- `repolens init` - Scaffold configuration and GitHub Actions workflow
- `repolens doctor` - Validate repository setup (config, Mermaid CLI, etc.)
- `repolens publish` - Scan repo, render docs, publish to outputs
- `repolens version` - Display version
- `repolens help` - Show usage

## Feature Highlights

### Branch-Aware Publishing
- **Problem**: Multiple branches publishing to same Notion pages causes conflicts
- **Solution**: `.repolens.yml` → `notion.branches` array filters which branches publish
- **Title Namespacing**: Non-main branches get `[branch-name]` suffix
- **Cache Scoping**: Branch-specific cache keys prevent cross-branch pollution

### Smart Tech Stack Detection
- **Source**: Reads package.json dependencies + devDependencies
- **Detects**: Frameworks (Next.js, React, Vue, Express), languages (TypeScript), build tools (Vite, Webpack), test frameworks (Vitest, Jest, Playwright)
- **Output**: "Technical Profile" section with actual stack insights (not generic "MVP based on heuristics")

### Visual Dependency Graphs
- **Approach**: Pattern-based relationship inference (not static analysis)
- **Infers**: Publishers→Renderers, Everything→Utils, CLI→Core, Tests→All (dotted)
- **Rendering**: Optional mermaid-cli (interactive install prompt) or mermaid.ink fallback
- **Storage**: GitHub-hosted SVGs in `.repolens/diagrams/` committed back via workflow

### URL Length Safety
- **Constraint**: Notion API limits image URLs to 2000 chars
- **Problem**: Complex Mermaid diagrams encode to 3500+ char mermaid.ink URLs
- **Solution**: Check URL length before embedding, fallback to code block with mermaid.live link

## Coding Conventions

### Module System
- **ES Modules only** (`type: "module"` in package.json)
- Use `import/export` syntax
- File imports require `.js` extension

### Dependencies
- **Runtime**: dotenv, fast-glob, js-yaml, node-fetch
- **Optional**: @mermaid-js/mermaid-cli (50MB, interactive install)
- **Dev**: vitest
- Keep dependencies minimal - favor Node.js built-ins

### Error Handling
- Use logger utilities (`info`, `error`, `warn`) from `src/utils/logger.js`
- Exit with appropriate codes: `0` success, `1` errors, `2` validation failures
- Provide user-friendly error messages with actionable guidance

### Testing
- Framework: Vitest (`vitest run --no-watch --reporter=verbose`)
- Test files: `tests/*.test.js`
- Mock file system operations using Vitest mocks
- Test config discovery, validation, rendering, branch detection
- **Coverage**: 32 tests passing (14 base + 18 branch tests)

### Configuration
- Config file: `.repolens.yml` (auto-discovered from cwd or parent directories)
- YAML format with js-yaml parser
- Schema version: `configVersion: 1` (for future migrations)
- Must specify publishers (notion, markdown) and scan patterns

### Async/Await
- Use async/await throughout (not callbacks or raw promises)
- Handle errors with try/catch blocks
- Propagate errors to CLI error handler

### File Operations
- Use `node:fs/promises` for async file operations
- Use `node:path` for cross-platform path handling
- Prefer `path.resolve()` and `path.join()` over string concatenation

### API Integration
- Notion API: Use retry logic from `src/utils/retry.js`
- Rate limiting: Implement backoff strategies (3 retries, exponential backoff)
- Environment variables: Load via dotenv, document in `.env.example`

## Publishing Workflow

1. **Scan**: Parse repository structure with fast-glob, extract metadata from package.json
2. **Render**: Generate Markdown documentation with optional Mermaid diagrams
3. **Publish**: 
   - **Notion**: Create/update pages, embed SVGs or mermaid.ink images
   - **Markdown**: Write to `.repolens/` directory with SVG embeds
4. **Deliver**: Optionally post PR comments with diffs

## Git Integration

- Uses git CLI commands via child_process
- Diff generation: `git diff` for architecture changes
- Branch detection: Multi-source priority (GITHUB_REF_NAME, CI_COMMIT_REF_NAME, CIRCLE_BRANCH, git command)

## Best Practices

1. **Config Discovery**: Always support auto-discovery of `.repolens.yml` from cwd or parents
2. **Idempotent Operations**: Publishing should be safe to run multiple times
3. **Clear Logging**: Use logger for all user-facing messages with context
4. **Validation First**: Run validation (`doctor` command) before expensive operations
5. **Graceful Degradation**: Continue on non-critical failures, log warnings (e.g., mermaid-cli optional)
6. **Exit Codes**: 0 for success, 1 for errors, 2 for validation failures
7. **Performance Guardrails**: Warn at 10k files, fail at 50k files
8. **Branch Safety**: Default to safe behavior (publish all branches) with opt-in filtering

## Development Workflow

```bash
# Link locally for development
npm link

# Run tests
npm test

# Test installation
npm run pack:check
npm run test:install

# Test specific features
npm run test:notion
npm run init:test

# Release workflow
npm run release:patch  # or minor or major
git push --follow-tags
```

## Common Patterns

### Config Loading
```javascript
import { loadConfig } from "./core/config.js";
const config = await loadConfig(configPath);
```

### Scanning Repository
```javascript
import { scanRepo } from "./core/scan.js";
const scanResult = await scanRepo(config);
// Returns: { filesCount, modules, api, pages, metadata }
```

### Publishing
```javascript
import { publishDocs } from "./publishers/index.js";
await publishDocs(docs, config);
```

### Branch Detection
```javascript
import { getCurrentBranch, shouldPublishToNotion } from "./utils/branch.js";
const branch = getCurrentBranch();
if (shouldPublishToNotion(branch, config)) {
  // Publish to Notion
}
```

## Avoid

- ❌ CommonJS (`require`, `module.exports`)
- ❌ Synchronous file operations (use async)
- ❌ Hardcoded paths (use config or auto-discovery)
- ❌ console.log (use logger utilities)
- ❌ Large dependencies (keep bundle small, ~4MB limit)
- ❌ Breaking changes to config schema without migration and `configVersion` bump

## Future Enhancements

- Additional publishers (Confluence, GitHub Wiki, Obsidian)
- Enhanced diff visualization with visual diffs
- Interactive configuration wizard (`repolens init --interactive`)
- Watch mode for local development (`repolens watch`)
- Plugin system for custom renderers
- GraphQL schema detection
- TypeScript type graph analysis
