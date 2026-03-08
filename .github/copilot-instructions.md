# RepoLens - GitHub Copilot Instructions

## Project Overview

RepoLens is a repository intelligence CLI tool that generates architecture documentation, route maps, diffs, and publishes them to various platforms (Notion, Markdown). It operates autonomously via GitHub Actions and can be triggered locally.

## Architecture

### Project Structure

```
bin/
  repolens.js           # CLI entry point
src/
  cli.js                # Main CLI orchestration
  doctor.js             # Repository validation
  init.js               # Scaffolding for new repos
  core/
    config.js           # Configuration loading and validation
    diff.js             # Git diff operations
    scan.js             # Repository scanning logic
  delivery/
    comment.js          # PR comment management
  publishers/
    index.js            # Publisher orchestration
    markdown.js         # Markdown file generation
    notion.js           # Notion API integration
    publish.js          # Publishing pipeline
  renderers/
    render.js           # System overview, module catalog, API surface, route map
    renderDiff.js       # Architecture diff rendering
    renderMap.js        # System map (Mermaid) rendering
  utils/
    logger.js           # Logging utilities
    retry.js            # Retry logic for API calls
tests/                  # Vitest test suite
```

### Key Commands

- `repolens init` - Scaffold configuration and GitHub Actions workflow
- `repolens doctor` - Validate repository setup
- `repolens publish` - Scan repo, render docs, publish to outputs
- `repolens version` - Display version
- `repolens help` - Show usage

## Coding Conventions

### Module System
- **ES Modules only** (`type: "module"` in package.json)
- Use `import/export` syntax
- File imports require `.js` extension

### Dependencies
- **Runtime**: dotenv, fast-glob, js-yaml, node-fetch
- **Dev**: vitest
- Keep dependencies minimal - favor Node.js built-ins

### Error Handling
- Use logger utilities (`info`, `error`) from `src/utils/logger.js`
- Exit with appropriate codes: `process.exit(1)` for errors
- Provide user-friendly error messages

### Testing
- Framework: Vitest (`vitest run --no-watch --reporter=verbose`)
- Test files: `tests/*.test.js`
- Mock file system operations using Vitest mocks
- Test config discovery, validation, and rendering

### Configuration
- Config file: `.repolens.yml` (auto-discovered from cwd or parent directories)
- YAML format with js-yaml parser
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
- Rate limiting: Implement backoff strategies
- Environment variables: Load via dotenv, document in `.env.example`

## Publishing Workflow

1. **Scan**: Parse repository structure and extract metadata
2. **Render**: Generate documentation from scan results
3. **Publish**: Push to configured outputs (Notion pages, markdown files)
4. **Deliver**: Optionally post PR comments with diffs

## Git Integration

- Uses git CLI commands via child_process
- Diff generation: `git diff` for architecture changes
- Branch detection: reads from .git/HEAD or CI environment

## Best Practices

1. **Config Discovery**: Always support auto-discovery of `.repolens.yml`
2. **Idempotent Operations**: Publishing should be safe to run multiple times
3. **Clear Logging**: Use logger for all user-facing messages
4. **Validation First**: Run validation before expensive operations
5. **Graceful Degradation**: Continue on non-critical failures, log warnings
6. **Exit Codes**: 0 for success, 1 for errors, 2 for validation failures

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
const scanResult = await scanRepo(repoPath, config);
```

### Publishing
```javascript
import { publishDocs } from "./publishers/index.js";
await publishDocs(docs, config);
```

## Avoid

- ❌ CommonJS (`require`, `module.exports`)
- ❌ Synchronous file operations (use async)
- ❌ Hardcoded paths (use config or auto-discovery)
- ❌ Console.log (use logger utilities)
- ❌ Large dependencies (keep bundle small)
- ❌ Breaking changes to config schema without migration

## Future Enhancements

- Additional publishers (Confluence, GitHub Wiki)
- Enhanced diff visualization
- Interactive configuration wizard
- Watch mode for local development
- Plugin system for custom renderers
