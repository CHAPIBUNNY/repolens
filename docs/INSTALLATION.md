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

Install from a specific GitHub Release. The version segment is the release tag. For 1.13.0:

```bash
npm install https://github.com/CHAPIBUNNY/repolens/releases/download/v1.13.0/chappibunny-repolens-1.13.0.tgz
```

That URL exists only after the `v1.13.0` tag is published. Until then, install from npm or from the repository.
</details>

> **Having install problems?** See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for solutions to common issues like `ENOTEMPTY`, `npm ci` failures, and stale versions.
