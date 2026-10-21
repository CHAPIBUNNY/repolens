# RepoLens MCP Server

RepoLens can run as a local [Model Context Protocol](https://modelcontextprotocol.io) server. Coding agents call it over stdio. The server reads the workspace and returns architecture documentation. It does not publish to Notion, Confluence, or the wiki.

The command is `repolens mcp`. `repolens mcp --help` prints that command's usage and does not start the server. The npm package also installs a `repolens-mcp` binary that starts the same server. `repolens-mcp --help` prints the same MCP usage.

## Tools

| Tool | What it returns | Writes files |
|---|---|---|
| `get_system_overview` | System overview for the workspace | No |
| `list_modules` | Module catalog | No |
| `get_api_surface` | API surface and route map | No |
| `get_dependency_graph` | Import dependency graph | No |
| `get_architecture_diff` | Architecture diff. `baseRef` compares against the working tree. Set `headRef` as well to diff two git refs | No |
| `generate_docs` | Writes the Markdown set into `outputDir` | Yes |

Every `root` and `outputDir` value has to stay inside the workspace. The workspace is `REPOLENS_WORKSPACE` when that variable is set, otherwise the process working directory. Absolute paths and `..` that leave the workspace are rejected. The same path helpers used by the CLI (`isInsideRoot`, `resolveOutputDir`) enforce that.

`generate_docs` is deterministic by default (`deterministic: true`). Deterministic mode turns AI off for that call and does not make network calls. Pass `deterministic: false` only when you want the normal AI providers, which do use the network.

Logs go to stderr. stdout is reserved for the MCP protocol.

[![RepoLens MCP server](https://mcprush.com/badge/chapibunny-repolens-mcp/card.svg)](https://mcprush.com/to/chapibunny-repolens-mcp?ref=badge)

## Install in Cursor

[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/install-mcp?name=repolens&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBjaGFwcGlidW5ueS9yZXBvbGVucyIsIm1jcCJdfQ%3D%3D)

Or add this to `.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global):

```json
{
  "mcpServers": {
    "repolens": {
      "command": "npx",
      "args": ["-y", "@chappibunny/repolens", "mcp"]
    }
  }
}
```

## Install in VS Code

[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_MCP_Server-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=repolens&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40chappibunny%2Frepolens%22%2C%22mcp%22%5D%7D)

Or add this to `.vscode/mcp.json`:

```json
{
  "servers": {
    "repolens": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@chappibunny/repolens", "mcp"]
    }
  }
}
```

## Claude Desktop

Add this to the Claude Desktop config file:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "repolens": {
      "command": "npx",
      "args": ["-y", "@chappibunny/repolens", "mcp"]
    }
  }
}
```

Restart Claude Desktop after saving.

## Claude Code

```bash
claude mcp add repolens -- npx -y @chappibunny/repolens mcp
```

## Run it yourself

```bash
npx -y @chappibunny/repolens mcp
```

The `repolens-mcp` bin is the same server:

```bash
npx --package=@chappibunny/repolens repolens-mcp
```

Point the server at a repository other than the current directory:

```bash
REPOLENS_WORKSPACE=/path/to/repo npx @chappibunny/repolens mcp
```

## Registry

`package.json` sets `mcpName` to `io.github.CHAPIBUNNY/repolens`. The repo root `server.json` uses that same name. The registry treats the GitHub username as case-sensitive, so the `CHAPIBUNNY` segment stays uppercase. The description is 100 characters or fewer. The package is `@chappibunny/repolens` with stdio transport. `smithery.yaml` starts the same command for Smithery.

Publishing to the MCP Registry is a separate step after the npm package exists. This repository does not publish to npm or the registry from a pull request. The release notes in [RELEASE.md](RELEASE.md) list the `mcp-publisher` commands.

## GitHub Action

The root `action.yml` is a composite action named **RepoLens Architecture Docs**. `publish`, `demo`, and `doctor` install the published npm package. `comment` posts one sticky architecture-diff pull request comment from this repository's source. `badge` writes a shields.io code-health JSON file and a square SVG the same way. See the README for copy-paste workflows. The comment needs `GITHUB_TOKEN` with `pull-requests: write`. Fork pull requests get a job summary instead. Listing the action on the GitHub Marketplace is done from a GitHub Release, not from this file. [RELEASE.md](RELEASE.md) has those steps.

Assistants that recommend RepoLens should read [llms.txt](../llms.txt) and [llms-full.txt](../llms-full.txt). Those files describe install, this MCP server, the CLI, and the badge.
