# 📦 Installation

## Requirements

Node.js 18 or newer. The CLI uses the built-in `fetch` API.

`npx @chappibunny/repolens demo` previews the current repository. It picks scan globs from the languages it finds. If nothing matches, it exits 2. `npx @chappibunny/repolens` with no command prints help. `npx @chappibunny/repolens <command> --help` prints that command's flags.

## Recommended: npm Registry

```bash
npm install @chappibunny/repolens
```

Installs from npm registry.

## Alternative Methods

<details>
<summary><b>Option B: GitHub Direct Install</b></summary>

Install from the latest GitHub commit:

```bash
npm install github:CHAPIBUNNY/repolens
```
</details>

<details>
<summary><b>Option C: Local Development</b></summary>

Clone and link for development:

```bash
git clone https://github.com/CHAPIBUNNY/repolens.git
cd repolens
npm link
```
</details>

<details>
<summary><b>Option D: GitHub Release Tarball</b></summary>

Install from a specific GitHub Release. The version segment is the release tag. For 1.15.3:

```bash
npm install https://github.com/CHAPIBUNNY/repolens/releases/download/v1.15.3/chappibunny-repolens-1.15.3.tgz
```

That URL exists only after the `v1.15.3` tag is published. Until then, install from npm or from the repository.

After install, `repolens mcp` and `repolens-mcp` start the stdio server. See [MCP.md](MCP.md).

### GitHub Action

Use the composite action from this repository once tag `v1.15.3` exists and `@chappibunny/repolens@1.15.3` is on npm. `publish`, `demo`, and `doctor` run that published package. `comment` and `badge` run scripts from the action checkout.

```yaml
name: Architecture docs
on:
  pull_request:
  push:
    branches: [main]
permissions:
  contents: read
  pull-requests: write
jobs:
  docs:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@9f698171ed81b15d1823a05fc7211befd50c8ae0 # v6.0.3
      - uses: CHAPIBUNNY/repolens@v1.15.3
        with:
          command: publish
          config: .repolens.yml
          node-version: "20"
          pr-comment: ${{ github.event_name == 'pull_request' && 'true' || 'false' }}
```

`command` is `publish`, `demo`, `doctor`, `comment`, or `badge`. On the `v1.15.3` tag, all five exist. `publish`, `demo`, and `doctor` run the published package. `comment` and `badge` run from the action checkout. Tag `v1.15.1` only has the first three. `pr-comment: false` skips the architecture diff comment.

Copy-paste the architecture comment. `fetch-depth: 0` is required. Fork pull requests skip the comment and write the job summary. The token needs `pull-requests: write` only for the comment; `contents: read` is for checkout.

```yaml
name: RepoLens architecture comment
on:
  pull_request:
permissions:
  contents: read
  pull-requests: write
jobs:
  architecture:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@9f698171ed81b15d1823a05fc7211befd50c8ae0 # v6.0.3
        with:
          fetch-depth: 0
      - uses: CHAPIBUNNY/repolens@v1.15.3
        with:
          command: comment
```

`command: badge` writes `repolens-badge.json` and `repolens-badge.svg`. Set `badge-url` to the public HTTPS URL of the JSON (GitHub Pages or another host) so the job summary includes a shields.io snippet. Marketplace listing steps are in [RELEASE.md](RELEASE.md).
</details>

Want to see the output before installing? [See it on real repos](https://chapibunny.github.io/repolens/).

> **Having install problems?** See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for solutions to common issues like `ENOTEMPTY`, `npm ci` failures, and stale versions.
