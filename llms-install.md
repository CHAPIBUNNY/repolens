# Installing the RepoLens MCP server (for AI agents)

1. Requires Node.js 18 or newer. Nothing else needs to be installed; `npx` fetches the package.
2. Add this to the MCP settings file (Cline: `cline_mcp_settings.json`):

```json
{"mcpServers":{"repolens":{"command":"npx","args":["-y","@chappibunny/repolens","mcp"]}}}
```

3. Optional: set `"env": {"REPOLENS_WORKSPACE": "/absolute/path/to/repo"}` to choose the repository. Otherwise the server reads its working directory.
4. No API keys are needed. Tools run deterministically and offline unless `generate_docs` is called with `deterministic: false`.
5. Verify: the server should list six tools — `get_system_overview`, `list_modules`, `get_api_surface`, `get_dependency_graph`, `get_architecture_diff`, `generate_docs`. Call `get_system_overview` with no arguments.
6. If you see `Unknown command: mcp`, an older release was resolved (often an `.npmrc` with `min-release-age`). Use `@chappibunny/repolens@latest`.
7. CLI (1.15.0): `repolens` with no arguments prints help. `repolens <command> --help` prints that command's flags. `init --quick` writes language-specific globs and Markdown only. `demo` and `publish` exit 2 when zero source files match, instead of writing empty docs. `publish --strict` exits 2 when publisher credentials are missing.
8. CLI (1.15.1): `watch` exits 2 when `scan.include` matches no files (it does not print `Waiting for changes...` and hang). Code health scores Python and Go as well as JavaScript and TypeScript.
