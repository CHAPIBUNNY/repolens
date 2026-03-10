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
   - Test suite (90 tests)
   - Create GitHub Release with tarball
   - Publish to npm (`npm publish --access public`)
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

GitHub Actions workflows use `rm -rf node_modules package-lock.json && npm install` instead of `npm ci`. This is because a macOS-generated `package-lock.json` doesn't properly resolve Linux platform-specific optional dependencies (e.g., `@rollup/rollup-linux-x64-gnu` required by Vitest).

- **Do NOT** use `npm ci` in CI workflows
- **Do NOT** commit `package-lock.json` changes made on CI runners back to the repo
- Always delete both `node_modules` and `package-lock.json` before install in CI

### npm Publishing

The `release.yml` workflow publishes to npm automatically when a `v*` tag is pushed. It requires:
- `NPM_TOKEN` secret set in GitHub repository settings
- Token must have publish access to `@chappibunny` scope

## Testing Upgrade Path

To test that users can upgrade successfully:

```bash
# In a test project
npx @chappibunny/repolens@latest --version
npx @chappibunny/repolens@latest publish
```