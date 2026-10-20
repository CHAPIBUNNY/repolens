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
