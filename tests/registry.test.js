import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DOCS_BADGE_MARKDOWN } from "../src/docs/branding.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("mcp registry metadata", () => {
  it("keeps server.json aligned with package.json mcpName and version", () => {
    const pkg = JSON.parse(read("package.json"));
    const server = JSON.parse(read("server.json"));
    expect(pkg.version).toBe("1.15.3");
    expect(pkg.mcpName).toBe("io.github.CHAPIBUNNY/repolens");
    expect(server.description).toBe(
      "Architecture docs from a repo: overview, modules, API surface, routes, dependency graph, diffs."
    );
    expect(server.description.length).toBeLessThanOrEqual(100);
    expect(server.name).toBe(pkg.mcpName);
    expect(server.version).toBe(pkg.version);
    expect(server.packages[0].registryType).toBe("npm");
    expect(server.packages[0].identifier).toBe("@chappibunny/repolens");
    expect(server.packages[0].version).toBe(pkg.version);
    expect(server.packages[0].transport.type).toBe("stdio");
    expect(server.$schema).toContain("server.schema.json");
    expect(pkg.bin["repolens-mcp"]).toBe("bin/repolens-mcp.js");
  });

  it("ships a smithery.yaml stdio command for the npm package", () => {
    const smithery = read("smithery.yaml");
    expect(smithery).toContain("type: stdio");
    expect(smithery).toContain("@chappibunny/repolens");
    expect(smithery).toContain("mcp");
  });

  it("documents install badges, client configs, the action, and the docs badge", () => {
    const readme = read("README.md");
    const mcp = read("docs/MCP.md");
    const changelog = read("CHANGELOG.md");
    const mcprush = "[![RepoLens MCP server](https://mcprush.com/badge/chapibunny-repolens-mcp/card.svg)](https://mcprush.com/to/chapibunny-repolens-mcp?ref=badge)";
    expect(readme).toContain(mcprush);
    expect(readme).toContain("[MCP Rush](https://mcprush.com/to/chapibunny-repolens-mcp?ref=badge)");
    expect(mcp).toContain(mcprush);
    expect(read("llms-install.md")).toContain(mcprush);
    expect(readme).toContain("Install in Cursor");
    expect(readme).toContain("https://cursor.com/install-mcp?name=repolens&config=");
    expect(readme).toContain("Install in VS Code");
    expect(readme).toContain("https://insiders.vscode.dev/redirect/mcp/install?name=repolens&config=");
    expect(readme).toContain("Add the badge to your repo");
    expect(readme).toContain(DOCS_BADGE_MARKDOWN);
    expect(readme).toContain("RepoLens Architecture Docs");
    expect(readme).toContain("action.yml");
    expect(mcp).toContain("Claude Desktop");
    expect(mcp).toContain("mcpServers");
    expect(mcp).toContain("\"repolens\"");
    expect(mcp).toContain("npx");
    expect(changelog).toContain("## 1.14.1");
    const release = read(".github/workflows/release.yml");
    expect(release).toContain('npm view "${pkg}@${ver}" version --prefer-online');
    expect(release).toContain('while [ "$attempt" -le 3 ]');
    expect(release).toContain("sleep 10");
    expect(release).toContain("echo already published; exit 0;");
    expect(release).toContain("files: chappibunny-repolens-*.tgz");
    expect(release).not.toContain("files: repolens-*.tgz");
  });
});
