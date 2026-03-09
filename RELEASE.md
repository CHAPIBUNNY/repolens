# RepoLens Release Process

## Versioning

RepoLens uses semantic versioning:

- Patch: bug fixes, internal cleanup, non-breaking improvements
- Minor: new features, new commands, new publishers
- Major: breaking CLI or config changes

## Release Checklist

1. Run tests: `npm test`
2. Test tarball installation: `npm run test:install`
3. Verify CLI works:
   - `repolens --help`
   - `repolens --version`
4. Update `CHANGELOG.md`
5. Bump version in `package.json`
6. Commit release changes
7. Tag the release
8. Push branch and tag
9. CI validates package installation automatically

## Example Patch Release

```bash
# 1. Update version
npm run release:patch  # or :minor, :major

# 2. Run tests
npm test

# 3. Test installation
npm run test:install

# 4. Push release
git push --follow-tags

# 5. Verify GitHub Actions
# Check: https://github.com/CHAPIBUNNY/repolens/actions
```

## Testing Upgrade Path

To test that users can upgrade successfully:

```bash
# In a test project
npx @chappibunny/repolens@latest --version
npx @chappibunny/repolens@latest publish
```