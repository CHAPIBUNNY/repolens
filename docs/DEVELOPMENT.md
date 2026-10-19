# 🧪 Development

## Setup

```bash
git clone https://github.com/CHAPIBUNNY/repolens.git
cd repolens
npm install
npm link  # Makes 'repolens' command available globally
```

## Run Tests

```bash
npm test
```

**Test Suite:**
- Config discovery and validation
- Branch detection (GitHub/GitLab/CircleCI)
- CLI commands (version, help, uninstall)
- Publishers: Markdown, Notion, Confluence, GitHub Wiki, Obsidian
- Integration and HTTP integration workflows
- Doctor command validation
- Init wizard and scaffolding
- AI provider and structured output tests
- Extended analysis (GraphQL, TypeScript, dependency graph, drift, JSDoc, security hotspots, code health)
- Plugin system (loader, manager, config)
- Renderers (system map, diff, analysis)
- Deterministic enrichment (all 6 AI-enhanced doc types)
- Security fuzzing and rate-limit stress tests
- Watch mode and migration (including e2e)
- Robustness (timeout, partial-publish, error isolation)
- MCP tools, the docs badge, the GitHub Action input checks, and registry metadata

`npm test` prints the current pass count.

## Test Package Installation Locally

Simulates the full user installation experience:

```bash
# Pack the tarball. The filename follows package.json (1.14.0 → chappibunny-repolens-1.14.0.tgz).
npm pack

# Install globally from that tarball
npm install -g chappibunny-repolens-*.tgz

# Verify
repolens --version
```

## Release Process

RepoLens uses automated GitHub Actions releases.

### Creating a Release

```bash
# Patch version (1.0.0 → 1.0.1) - Bug fixes
npm run release:patch

# Minor version (1.0.0 → 1.1.0) - New features
npm run release:minor

# Major version (1.0.0 → 2.0.0) - Breaking changes
npm run release:major

# Push the tag to trigger workflow
git push --follow-tags
```

**What happens:**
1. Security audit runs (dependency audit + secret scanning)
2. All tests run
3. Package tarball created
4. GitHub Release published with tarball attached
5. npm package published to `@chappibunny/repolens`

See [RELEASE.md](./RELEASE.md) for detailed workflow.
