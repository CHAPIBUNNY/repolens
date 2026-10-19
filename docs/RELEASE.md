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

### npm Publishing

The `release.yml` workflow publishes to npm automatically when a `v*` tag is pushed.

**Manual step before the first tagged release:** add an `NPM_TOKEN` secret.

1. Create an npm access token (automation or granular) that can publish `@chappibunny/repolens`.
2. In GitHub, open **Settings → Secrets and variables → Actions → New repository secret**.
3. Name it `NPM_TOKEN` and paste the token.

The workflow checks that the secret is present and then runs `npm publish --provenance --access public`. Provenance also needs the workflow `id-token: write` permission, which `release.yml` already sets. If `NPM_TOKEN` is missing, the publish job fails with a message pointing at this secret and does not publish.

Local preflight is `npm run release:check` (`npm test` and `npm pack --dry-run`).

## Testing Upgrade Path

To test that users can upgrade successfully:

```bash
# In a test project
npx @chappibunny/repolens@latest --version
npx @chappibunny/repolens@latest publish
```