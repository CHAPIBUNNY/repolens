# 📦 Installation

## Requirements

Node.js 18 or newer. The CLI uses the built-in `fetch` API.

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

Install from a specific GitHub Release. The version segment is the release tag. For 1.14.1:

```bash
npm install https://github.com/CHAPIBUNNY/repolens/releases/download/v1.14.1/chappibunny-repolens-1.14.1.tgz
```

That URL exists only after the `v1.14.1` tag is published. Until then, install from npm or from the repository.

After install, `repolens mcp` and `repolens-mcp` start the stdio server. See [MCP.md](MCP.md).

### GitHub Action

Use the composite action from this repository once tag `v1.14.1` exists and `@chappibunny/repolens@1.14.1` is on npm. The action runs that published package. It does not run the checkout of this repo.

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
      - uses: CHAPIBUNNY/repolens@v1.14.1
        with:
          command: publish
          config: .repolens.yml
          node-version: "20"
          pr-comment: ${{ github.event_name == 'pull_request' && 'true' || 'false' }}
```

`command` is `publish`, `demo`, or `doctor`. `pr-comment: false` skips the architecture diff comment. Marketplace listing steps are in [RELEASE.md](RELEASE.md).
</details>

> **Having install problems?** See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for solutions to common issues like `ENOTEMPTY`, `npm ci` failures, and stale versions.
