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
- MCP tools, the docs badge, the code-health badge, the architecture pull request comment, the GitHub Action input checks, and registry metadata

`npm test` prints the current pass count.

## Test Package Installation Locally

Simulates the full user installation experience:

```bash
# Pack the tarball. The filename follows package.json (1.15.1 → chappibunny-repolens-1.15.1.tgz).
npm pack

# Install globally from that tarball
npm install -g chappibunny-repolens-*.tgz

# Verify
repolens --version
```

## Gallery

The showcase site is generated, not checked in. From the repository root:

```bash
npm ci
node gallery/build.mjs
```

`GALLERY_ONLY=express,flask` limits the run to those slugs. Output is `gallery/dist/`. The default site root is `/repolens`, which matches GitHub Pages. Set `GALLERY_BASE_PATH=` to preview the files at the root of a local static server.

The generator calls the scanners directly with AI disabled. It does not read API keys. Clones live in `gallery/.cache/repos` and can be reused. A repository with a non-permissive license, or a missing license file, is skipped.

The site is static and has no CSS framework. `gallery/site.css` is flat Material: Roboto or the system font stack, an 8px spacing grid, square corners, no shadows, and no gradients. One primary colour and one accent sit on white and light grey. The index is a dense table (name, language, modules, files, code-health score, license, and links). There are no rounded card containers.

Each repository gets three HTML pages: the document set, `<slug>/explained/` titled "<name> architecture explained" (Open Graph, canonical URL, JSON-LD `SoftwareSourceCode`), and `<slug>/score/` with a shields.io README snippet that links back to that page. `badge.json` and `badge.svg` sit next to them. `sitemap.xml` lists all three. `robots.txt`, `llms.txt`, and `llms-full.txt` are written at the site root. The repository root copies of `llms.txt` and `llms-full.txt` are the same text without the per-repository links.

`.github/workflows/gallery.yml` runs that command on a weekly schedule and on manual dispatch, then deploys `gallery/dist`. GitHub Pages has to be set to **GitHub Actions** once before the first deploy can succeed.

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
