# RepoLens Release Process

## Versioning

RepoLens uses semantic versioning:

- **Patch**: bug fixes, internal cleanup, non-breaking improvements
- **Minor**: new features, new commands, new publishers
- **Major**: breaking CLI or config changes

## Release Checklist

1. Run tests: `npm test`
2. Test tarball installation: `npm run test:install`
3. Verify CLI works:
   - `repolens --help`
   - `repolens --version`
4. Update `CHANGELOG.md`
5. Bump version in `package.json`
6. Commit release changes
7. Tag the release: `git tag v<version>`
8. Push branch and tag: `git push --follow-tags`
9. GitHub Actions `release.yml` runs automatically:
   - Security audit (dependency + secrets scanning)
   - Test suite
   - Create GitHub Release with tarball
   - Publish to npm (`npm publish --provenance --access public`)
10. Verify on npm: `npm view @chappibunny/repolens version`

## GitHub Marketplace

Listing the action is a GitHub UI step. A pull request cannot tick it, and this repository does not push the tag for you.

1. Merge the release that contains the root `action.yml` (name, description, and `branding` are required).
2. Publish `@chappibunny/repolens@1.15.5` to npm first. `action.yml` installs that exact version with `npx`. The publish step exits without publishing again when that version is already on npm.
3. Open **Releases** → **Draft a new release** on https://github.com/CHAPIBUNNY/repolens/releases/new
4. Choose or create the tag `v1.15.5` on the commit that contains `action.yml`.
5. Tick **Publish this Action to the GitHub Marketplace**.
6. Accept the GitHub Marketplace Developer Agreement if GitHub asks for it.
7. Set the primary category. **Utilities** matches a documentation action. A secondary category is optional.
8. Publish the release. The listing slug follows the action name, **RepoLens Architecture Docs**.

The action is usable from `uses: CHAPIBUNNY/repolens@v1.15.5` as soon as the tag exists, including before the Marketplace review finishes.

## MCP Registry

The registry stores metadata. The npm package has to exist first, and its `mcpName` must equal `server.json` `name` (`io.github.CHAPIBUNNY/repolens`).

1. Publish `@chappibunny/repolens@1.15.5` to npm (`npm publish --access public`). Confirm https://www.npmjs.com/package/@chappibunny/repolens shows `1.15.5` and that the published `package.json` contains `"mcpName": "io.github.CHAPIBUNNY/repolens"`.
2. Install the publisher CLI:

```bash
curl -L "https://github.com/modelcontextprotocol/registry/releases/latest/download/mcp-publisher_$(uname -s | tr '[:upper:]' '[:lower:]')_$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/').tar.gz" | tar xz mcp-publisher
sudo mv mcp-publisher /usr/local/bin/
mcp-publisher --help
```

3. From a checkout that contains this repo's `server.json` (version `1.15.5`):

```bash
mcp-publisher login github
```

4. Open the device URL, enter the code, and authorize the GitHub account that owns `CHAPIBUNNY`. The server name must start with `io.github.CHAPIBUNNY/`.
5. Publish:

```bash
mcp-publisher publish
```

6. Confirm the listing:

```bash
curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.CHAPIBUNNY/repolens"
```

The response should include `"name":"io.github.CHAPIBUNNY/repolens"`. Smithery reads `smithery.yaml` from the default branch after it is pushed. It does not use `mcp-publisher`.

## Example Patch Release

```bash
# 1. Bump version + create tag
npm run release:patch  # or :minor, :major

# 2. Run tests
npm test

# 3. Test installation
npm run test:install

# 4. Push release (triggers release.yml workflow)
git push --follow-tags

# 5. Verify GitHub Actions
# Check: https://github.com/CHAPIBUNNY/repolens/actions

# 6. Verify npm publish
npm view @chappibunny/repolens version
```

## CI/CD Notes

### Important: CI Install Strategy

GitHub Actions workflows run `npm ci` against the committed `package-lock.json`.

Do not delete the lockfile in CI and re-resolve with `npm install`. npm 10 (the npm that ships with Node 22) crashes while building a fresh tree for Vitest 4.1 optional peers (`Cannot read properties of null (reading 'edgesOut')`). `npm ci` uses the lockfile and does not hit that resolver bug.

When dependencies change, regenerate the lockfile with npm 11 or newer (`npx npm@11 install`) and commit it. npm 10's `--legacy-peer-deps` install can omit Rolldown's platform packages from the lockfile. Do not commit a lockfile produced on a CI runner.

### Action modes that do not wait for npm

`command: comment` and `command: badge` execute `scripts/pr-comment-run.js` and `scripts/badge-run.js` from the action checkout. `publish`, `demo`, and `doctor` still install `@chappibunny/repolens@<version>`. A pull request must not publish the package. `repolens badge` and `repolens comment` ship in the 1.15.5 npm package as well. Tag `v1.15.5` and let `release.yml` publish. Do not publish by hand from a development checkout.

### npm Publishing

The `release.yml` workflow publishes to npm automatically when a `v*` tag is pushed.

**Manual step before the first tagged release:** add an `NPM_TOKEN` secret.

1. Create an npm access token (automation or granular) that can publish `@chappibunny/repolens`.
2. In GitHub, open **Settings → Secrets and variables → Actions → New repository secret**.
3. Name it `NPM_TOKEN` and paste the token.

The workflow checks that the secret is present and then runs `npm publish --provenance --access public`. Provenance also needs the workflow `id-token: write` permission, which `release.yml` already sets. If `NPM_TOKEN` is missing, the publish job fails with a message pointing at this secret and does not publish.

### Already published and release assets

`npm pack` writes `chappibunny-repolens-<version>.tgz`. The GitHub Release step attaches `chappibunny-repolens-*.tgz`. A `repolens-*.tgz` glob does not match that file, so the release would have no package asset.

Before publishing, the workflow reads `name` and `version` from `package.json` and runs:

```bash
npm view <pkg>@<ver> version --prefer-online
```

It tries that query up to three times and sleeps 10 seconds between tries. `--prefer-online` forces a fresh registry check instead of a stale cache. If any try shows the version, the step prints `already published` and exits 0 without calling `npm publish`.

If `npm publish` fails, the same three-try check runs again. The step passes when the version is now live (the publish landed, or an earlier run already published it). The step fails when the version is still missing.

Local preflight is `npm run release:check` (`npm test`, `npm run audit:runtime`, and `npm pack --dry-run`).

The release audit runs `npm audit --omit=dev` and fails on high or critical production findings. `braces` GHSA-vfj7-8cjw-p6xm is waived because no patched version is published. The waiver, and the `micromatch` / `fast-glob` findings that exist only because of it, is recorded in `scripts/audit-waivers.json` and explained in `SECURITY.md`. A different high or critical advisory on those packages still fails the job.

## Testing Upgrade Path

To test that users can upgrade successfully:

```bash
# In a test project
npx @chappibunny/repolens@latest --version
npx @chappibunny/repolens@latest publish
```