# RepoLens

Repo intelligence CLI for architecture docs, route maps, diffs, and publishing.

**Autonomous Operation**: RepoLens runs automatically on every push via GitHub Actions and can be triggered locally with `npm run repolens`.

## Features

- **`init`** - Scaffold RepoLens configuration and GitHub Actions workflow
- **`doctor`** - Validate repository RepoLens setup
- **`publish`** - Scan repository, render documentation, and publish to configured outputs
- **Config auto-discovery** - Automatically finds `.repolens.yml` in current or parent directories
- **`version`** - Print current RepoLens version
- **`help`** - Display usage information

### Publishers

- **Notion** - Publish documentation pages to Notion workspace
- **Markdown** - Generate local markdown files in `.repolens/` directory

### Generated Outputs

RepoLens can generate and maintain:
- System Overview
- Module Catalog
- API Surface
- Architecture Diff
- Route Map
- System Map (Mermaid diagram)

## Install

### Local Development

From this repository:

```bash
cd tools/repolens
npm link
```

### Packed Artifact

For testing the packaged version:

```bash
npm pack
npm install repolens-0.1.1.tgz
```

### Future npm Registry

Once published:

```bash
npm install -g repolens
```

## Commands

### Initialize a Repository

Scaffold RepoLens files in a target repository:

```bash
repolens init --target /path/to/repo
```

Creates:
- `.repolens.yml` - Configuration file
- `.github/workflows/repolens.yml` - GitHub Actions workflow
- `.env.example` - Environment variable template
- `README.repolens.md` - Onboarding guide

### Validate Setup

Check if a repository has valid RepoLens configuration:

```bash
repolens doctor --target /path/to/repo
```

Validates:
- Required files exist (`.repolens.yml`, workflow)
- Configuration is valid YAML
- Publishers are configured
- Scan patterns are defined

### Publish Documentation

Scan repository and publish to configured outputs:

```bash
# Auto-discovers .repolens.yml in current or parent directories
repolens publish

# Or specify config explicitly
repolens publish --config /path/to/.repolens.yml

# Or use npm script (from repository root)
npm run repolens
```

**Automatic Publishing**: RepoLens runs automatically via GitHub Actions on every push to main and on pull requests.

### Version & Help

```bash
repolens --version
repolens --help
```

## Configuration

Example `.repolens.yml`:

```yaml
project:
  name: "my-project"
  docs_title_prefix: "RepoLens"

publishers:
  - notion
  - markdown

scan:
  include:
    - "src/**/*.{ts,tsx,js,jsx,md}"
    - "app/**/*.{ts,tsx,js,jsx,md}"
  ignore:
    - "node_modules/**"
    - ".next/**"
    - "dist/**"

module_roots:
  - "src/app"
  - "src/components"
  - "src/lib"

outputs:
  pages:
    - key: "system_overview"
      title: "System Overview"
      description: "High-level snapshot of the repo"
```

## Environment Variables

Required for Notion publisher:

```bash
NOTION_TOKEN=secret_...
NOTION_PARENT_PAGE_ID=...
NOTION_VERSION=2022-06-28
```

## Development

### Run Tests

```bash
npm test
```

### Test Tarball Installation

Tests the complete package lifecycle (pack → install → verify):

```bash
npm run test:install
```

This simulates what happens when users install from npm or a tarball.

### Test Package Locally

```bash
npm pack
npm install -g repolens-0.1.1.tgz
repolens --version
```

### Project Structure

```
tools/repolens/
├── bin/
│   └── repolens.js          # CLI executable wrapper
├── src/
│   ├── cli.js               # Main CLI entry point
│   ├── init.js              # Init command
│   ├── doctor.js            # Validation command
│   ├── core/                # Core scanning & diffing
│   ├── renderers/           # Documentation renderers
│   ├── publishers/          # Output publishers
│   ├── delivery/            # PR comment delivery
│   └── utils/               # Shared utilities
├── tests/                   # Test suite
├── package.json
├── CHANGELOG.md
└── RELEASE.md
```

## Release Process

See [RELEASE.md](./RELEASE.md) for detailed release workflow.

Quick version:

```bash
npm test                    # Verify tests pass
npm version patch           # Bump version
git commit -am "Release vX.Y.Z"
git tag vX.Y.Z
git push origin <branch>
git push origin vX.Y.Z
```

## GitHub Actions Integration

RepoLens automatically generates a GitHub Actions workflow that:

1. Runs on push to `main` and pull request events
2. Scans repository structure and generates documentation
3. Publishes to configured outputs (Notion, Markdown)
4. Posts architecture diff summary as PR comment

Required repository secrets:
- `NOTION_TOKEN`
- `NOTION_PARENT_PAGE_ID`

## License

MIT

## Contributing

RepoLens is currently a private tool. For issues or questions, contact the repository maintainers.
