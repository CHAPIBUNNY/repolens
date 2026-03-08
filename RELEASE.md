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
cd tools/repolens
npm test