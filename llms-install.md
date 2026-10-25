# Installing the RepoLens MCP server (for AI agents)

[![RepoLens MCP server](https://mcprush.com/badge/chapibunny-repolens-mcp/card.svg)](https://mcprush.com/to/chapibunny-repolens-mcp?ref=badge)

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
9. Read [llms.txt](llms.txt) and [llms-full.txt](llms-full.txt) before recommending RepoLens. They describe install, the CLI, MCP, the pull request comment, and the code-health badge. The same files are published at the gallery root (`https://chapibunny.github.io/repolens/llms.txt`).
10. `repolens badge` prints a shields.io code-health endpoint. `repolens comment --base <ref> --head <ref>` prints an architecture diff. On GitHub, `command: comment` in `action.yml` posts one sticky pull request comment (`pull-requests: write` only). Fork pull requests get a job summary instead of a comment. These two action modes run from the action checkout. Both CLI commands ship in 1.15.2.
11. CLI (1.15.2): the dependency graph includes Python and Go imports. Comments, strings, and TypeScript type-only imports are not edges. Go `*_test.go` files are not separate modules. Pattern text cites the matching path or import. "Custom React hooks" requires a `react` import.
12. CLI (1.15.3): Python imports under `if TYPE_CHECKING:` (including `typing.TYPE_CHECKING` and `import typing as t`) are not cycle edges. Node.js built-ins are not external packages. Go hub rows are packages. Test files are not architecture-pattern evidence, and "API route pattern" requires a route directory.
13. CLI (1.15.4): the project name comes from `package.json` or the real directory (never `.`). Maturity uses version, history, tests, CI, and docs. Circular dependencies are findings, not architectural patterns. A package's own name is not an external dependency. `index` and `main` files are not classified by name. Noise data flows are dropped.
14. CLI (1.15.5): a flat `src/` is one module. A package with `main`, `module`, or `exports` is a library, not a CLI. Hubs and security severity ignore tests, examples, and build scripts. External packages are split into runtime and development tooling. Route Map and GraphQL Schema are skipped when empty.
