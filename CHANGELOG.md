# Changelog

All notable changes to RepoLens will be documented in this file.

## 1.16.1

Fixes three problems found by running 1.16.0 on orval-labs/orval (a TypeScript monorepo whose test snapshots and samples dwarf the packages).

### Scan defaults

- Snapshot directories (`__snapshots__`, `*.snap`), sample / fixture / example / e2e-fixture directories, and `generated/` trees are dev tooling. They are left out of the file count, orphan detection, and the type graph unless `scan.include_dev_artifacts: true`. Other `scan.ignore` patterns still apply. Orval's second copy of the snapshot tree lives in `tests/generated`, so `**/generated/**` is part of that default (it was already in the `init` ignore list).
- `repolens badge` skips the same directories. It does not read `.repolens.yml`.

### Cycle priority

- A cycle is no longer always "Priority: High refactor".
- **Low — mutual recursion, probably intentional; verify** when the cycle stays inside two parent directories that import each other both ways (at least two runtime edges each way) and both directions call the imported bindings (at least two calls each way). Orval's core getters and resolvers are this shape.
- **Low — type-only imports; verify** when every edge is `import type` or `export type`. Those cycles are not runtime edges and are not counted in `stats.cycles`.
- **High refactor** is kept for a cycle that touches three or more parent directories.
- A two-directory cycle with only one import each way is **Medium**.
- The health score subtracts points for high and medium cycles. Low-priority cycles do not. Stats that do not carry the priority split keep the previous per-cycle penalty.
- The heuristic is documented in `src/analyzers/cycle-priority.js`, [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), and [docs/KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md).

### npx and devEngines

- npm versions that enforce `devEngines` (newer npm) check that field on the package.json in the current directory before `npx` starts the requested package. A repo that pins a Node or package-manager the host does not meet exits `EBADDEVENGINES`. Node 20's bundled npm does not enforce `devEngines`. RepoLens never gets to run when the check fails, so this cannot be fixed inside the CLI.
- `--ignore-engines` is not an npm flag. On npm versions that enforce `devEngines`, npm warns that it is an unknown config and still errors.
- `--force` turns that failure into a warning and runs the command. The GitHub Action passes `--force` on its `npx` step. A manual run is `npx --force --yes @chappibunny/repolens demo`. A global install, or `node node_modules/@chappibunny/repolens/bin/repolens.js`, never asks npm to read the scanned repo's `devEngines`.
- See [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md).

## 1.16.0

### GitHub App

- `repolens app` self-hosts a GitHub App webhook. It checks `X-Hub-Signature-256`, acknowledges `installation` and `installation_repositories`, and on `pull_request` `opened`, `synchronize`, `reopened`, and `ready_for_review` runs the existing architecture diff. It posts a Check Run named RepoLens (the same summary as the sticky comment) and updates that comment. A finished diff is a successful check. The check fails only when the analysis throws
- Manifest: `app.yml` and `github-app-manifest.json`, also `repolens app --manifest`. Permissions are checks write, pull requests write, contents read, and metadata read. The hook URL in the repo is a placeholder (`https://example.com/api/github/webhooks`). This release does not register an app and CI does not need new secrets
- The server answers 202 before the clone and scoring finish, because GitHub allows about 10 seconds for the HTTP response. Setup is in [docs/GITHUB_APP.md](docs/GITHUB_APP.md)

### Security

- Route parameters in `src/renderers/renderDiff.js` no longer use `/\[(.*?)\]/g`. That lazy pattern is polynomial on a long string of `[` with no `]` (CodeQL `js/polynomial-redos`, alert #6). The replacement is a linear scan, including the same pattern in `src/core/scan.js` and the route-group labels in `src/renderers/renderMap.js`. A regression test feeds 100,000 brackets and expects a fast result

### Output accuracy

Hands-on `repolens demo` on expressjs/express, pallets/flask, and spf13/cobra:

- Express 5 has no `main` field. A description that says library, SDK, parser, toolkit, or framework is a library. Express reads as a library, not an API service
- `app.get('query parser fn')` is a setting lookup, not a route. Comment lines are skipped. Routes in tests, examples, and docs are not the product API. The Express route map is skipped
- A flat package at the repository root is named after the directory (`cobra`, not `root`). The system map connects that package to `doc/` (one relationship). Files with no directory belong to that flat module
- External imports that appear only in tests or examples are development tooling even when there is no `package.json`. Flask no longer lists `site_app` and the other test fixtures as runtime packages. Cobra lists `pflag` and `mousetrap` as runtime, and `go-md2man` and `yaml` as doc tooling
- Flask hubs are `globals.py`, `helpers.py`, `typing.py`, and `signals.py`. The three cycles (`__init__` → `app` → `cli`, and the templating / sansio chains) are real import cycles

### Dependencies

- `js-yaml` 4.3.2 → 5.5.0. Call the named `load` export. The YAML 1.2 Core schema still treats `true`/`false` as booleans and `yes`/`no` as strings. The merge key (`<<`) is enabled. `maxAliases` caps alias expansion. An empty file still returns `undefined`
- `@sentry/node` 10.76.2 → 11.9.0 (`^11.8.0`). It is still optional. Its own engines exclude Node 18 (`>=20.19` or `>=22.12`). `npm ci` on Node 18 warns and continues, and a failed import still disables telemetry instead of crashing the CLI
- Vitest 4.1.12 → 5.0.5. Its declared engines are `^22.12 || ^24 || >=26`. The runner starts on Node 20 and does not start on Node 18 (`util.styleText`). CI still runs `npm test` on Node 20 and 22, and `scripts/node18-runtime.js` on Node 18. `engines` stays `>=18`
- `dotenv` 18.0.8 → 18.0.9 and `@modelcontextprotocol/sdk` 1.32.1 → 1.32.2
- GitHub Actions: `actions/checkout` pin is the v6.0.3 release commit `df4cb1c`, `actions/setup-node` v7.1.0 (`949feb2`), `softprops/action-gh-release` v3.0.3 (`efb3536`). `npm audit` reports no vulnerabilities

### Docs

- Roadmap item 1 (GitHub App) is shipped in 1.16.0. Java and C# language support is now What's Next item 1
- The note that a chat answer only covers what someone thought to ask, and that grounded AI Q&A sits on top of the full map, stays in the roadmap, README, known issues, and copilot instructions

## 1.15.5

Fixes twelve output problems found by running 1.15.4 on mattiasw/ExifReader (a plain-JavaScript library with a flat `src/` and a build-helper `bin/`), and the two leftovers from 1.15.4.

### Output accuracy

- A file directly under a module root belongs to that root. A flat `src/` is one module (`src`), not 65 one-file modules. Sub-directories are still their own modules. Go packages follow the same rule, so `middleware/` is one module and not `middleware/compress.go`
- Module fan-in and fan-out count distinct other modules, not file-to-file edges, so "Orchestrator (coordinates 212 modules)" becomes the real number
- A package with `main`, `module`, `exports`, or `types` is a **library**, not a command-line tool. A package with only a `bin` is a CLI. A package with both is a library unless its description does not say library, parser, SDK, toolkit, or framework and says CLI or command-line. Libraries get no "CLI tool architecture" pattern, no "Interface: CLI" row, and no "command-line interface" text. The route map note says library. Flows start at the package entry (`Library Flow`), not at `bin/` helpers or `webpack.config`
- Patterns are described by their name, not by the file names cited as evidence. "Acyclic dependency graph" no longer gets the CLI description. Every pattern has its own explanation and benefit line. The headline names the pattern, not its evidence
- `build-pages.js` is not a route module. Page, route, and view only count as directory names for files
- `.d.ts` files, type tests, and a `typescript` devDependency do not make a JavaScript library "TypeScript"
- `filter`, `parse`, and `constant` no longer pick the Search & Discovery, Analysis & Detection, and Configuration domains
- Hubs, coupling advice, and the dependency graph ignore tests, examples, docs, and build scripts, and are measured against source files. Hub threshold is 7% of source files (minimum 5)
- External packages are split into runtime and development and test tooling (`12 (1 runtime, 11 dev/test tooling)`), from the root `package.json`
- Security: `innerHTML = ''` and other fixed-string assignments are not reported. Findings in examples, docs, scripts, tools, benchmarks, and `build*.js` files are low severity and labeled "(build/example code)". Hardcoded credentials keep their severity
- Orphan files over 5% of code files are a warning and cost 5 health points (10 over 10%, 20 over 20%). Below 5% they read "within normal range". The old +5 bonus for a cycle-free graph is gone, so 100/100 no longer sits next to an orphan warning
- Route Map and GraphQL Schema are not written when no routes or GraphQL schema were found. Naming them in `documentation.sections` keeps them
- Tests, examples, and build helpers are no longer flows. Build configs such as `webpack.config` are not flow entry points

### 1.15.4 leftovers

- `lib/ogg` is typed and grouped by `ogg`, not by sitting under `lib/`. Folders with no keyword of their own join a **Core Source** domain and a "Source Modules" layer instead of "Shared Utilities" and "Shared Libraries". `lib/common` still reads as shared utilities
- Hub flows skip barrels (`lib/index`), leaf helpers such as error classes, tests, and examples, so there is no "lib Integration Flow"

### Docs

- README, AI.md, MIGRATION.md, KNOWN_ISSUES.md, ROADMAP.md, ARCHITECTURE.md, CONFIGURATION.md, and `.github/copilot-instructions.md` describe the new behavior

## 1.15.4

Fixes nine output problems found by running 1.15.3 on Borewit/music-metadata (a v12 TypeScript library).

### Output accuracy

- The project name is the `package.json` name, or the real directory name. `demo --target .`, `init`, and the MCP default config no longer name the project `.`
- Maturity uses release version, release history (tags, or a major version of 5 or more), commit history over a year, tests, CI, documentation, and circular dependencies. A signal that cannot be measured, such as commit age in a shallow clone, is left out of the total (`Production-grade (5/6 indicators)`). The old score counted only tests, build tools, and cycles, so a 10-year-old v12 library read as "Early-stage (1/3)". The summary also says "an early-stage", not "a early-stage"
- Entry and barrel file names (`index`, `main`, `mod`, `__init__`) are not domain evidence. `lib/index.ts` is no longer "Search & Discovery". A `domains` hint in `.repolens.yml` still sees the full path
- "Core/kernel architecture" needs a directory named `core` or `kernel`. A file called `core.ts` does not make it
- Module descriptions use the module's own name. `lib/ogg` is no longer "Utility and helper functions" because it sits under `lib/`. Unknown folders read "<Name> module", and `common` and `shared` read "Code shared by the other modules"
- Circular dependencies are listed as a **Finding** in the Architecture Overview (`context.findings`), not as an architectural pattern
- A package importing its own name (for example `example/*.js` importing `music-metadata`) is not an external dependency. The nearest `package.json` decides, so a nested package still reports the root package as external
- The "unlock AI" notice lists the sections that were written with rule-based text and says AI can rewrite them. It no longer says written documents, such as Developer Onboarding, are missing
- Data flows with fewer than 2 steps, chains that start in `doc-gen`, `scripts`, `examples`, `docs`, or `fixtures`, and generic names (`gen`, `util`, `helper`) are dropped

### Dependencies

- `zod` 3.25.76 → 4.6.7 (GHSA-mrhx-c7xc-m3w5) and `npm audit fix` for `body-parser` (GHSA-27r3-jxmh-p828) and `fast-uri`, so the release audit passes again. The MCP server tests pass on zod 4
- `tests/audit-runtime.test.js` no longer requires the `braces` advisory to be printed. The registry stopped reporting it, and the waiver stays in `scripts/audit-waivers.json`

### Docs

- Added [AI_POLICY.md](AI_POLICY.md) and a pull request template with an AI-assistance disclosure. CONTRIBUTING.md and README.md link to both
- Roadmap: added Java and C# language support and grounded AI explanations and Q&A as items 2 and 3 of What's Next (docs/ROADMAP.md, README.md, docs/KNOWN_ISSUES.md)

## 1.15.3

### Dependency graph

- Python imports inside `if TYPE_CHECKING:`, `if typing.TYPE_CHECKING:`, and `if <alias>.TYPE_CHECKING:` (for example `import typing as t`) are not runtime edges and do not form cycles. `from . import name` resolves to the sibling module
- Node.js built-ins (`fs`, `child_process`, `events`, `node:*`, and the rest of the standard builtin list) are not external packages
- Go hub rows are packages (`github.com/spf13/cobra`, `github.com/go-chi/chi/v5/middleware`), not individual `.go` files

### Pattern text

- Test directories and test files are not evidence for architecture patterns. A `tests/test_commands.py` module does not make the repo a "CLI tool architecture"
- "API route pattern" requires an `api`, `routes`, `router`, `endpoint`, `controller`, or `handler` directory. A library file named `_api.py` does not match

## 1.15.2

### Dependency graph

- Python `import` / `from ... import` statements, including relative imports and package roots under `src/` or a nested directory, become graph edges. The standard library is not listed as an external package
- Go imports resolve through the root `go.mod` module path. Standard-library imports are omitted. `*_test.go` files are not graph nodes and are not counted as their own modules
- JavaScript and TypeScript parsing skips comments, strings, and template text, so an import mentioned only in a JSDoc comment is not an edge
- `import type`, `export type ... from`, and import lists whose specifiers are all `type` are not runtime edges and do not form circular dependencies. A mixed import that also has a value specifier still does
- External package names ignore empty strings, absolute paths, URLs, `node:` builtins, and `#` subpaths

### Pattern text

- Path keywords match tokens. `ai` does not match `_main` or `email`, so a Python module is not labeled "AI/LLM integration" unless the path or an import actually names an AI package
- "Custom React hooks" requires a `react` import. A test file named `hooks` stays a test. Domain and architecture lines cite the path or import that matched, instead of a canned capability sentence

### Pull request architecture comment

- GitHub Action `command: comment` compares the pull request base and head: files, modules, dependencies, the code-health delta, and hotspots that are new on head
- One sticky comment. The body starts with `<!-- repolens:architecture-diff -->` and later runs edit that comment
- Footer is "Generated by RepoLens" and links to the repository and the gallery
- Uses `GITHUB_TOKEN` with `pull-requests: write`. Fork pull requests, and a 403, skip the comment and write the job summary
- `pr-comment: true` on `publish`, `demo`, or `doctor` runs that comment from the action checkout and turns the published package's older comment off
- CLI: `repolens comment --base <ref> --head <ref>` prints the same markdown when no token is set

### Code health badge

- CLI: `repolens badge` prints shields.io endpoint JSON for the average code-health score. `--format svg` prints a square SVG. `--format markdown` prints a README snippet. `--format all --out repolens-badge.json` writes JSON and SVG
- Exit 2 when no JavaScript, TypeScript, Python, or Go files are scored. An empty tree is not reported as 100
- GitHub Action `command: badge` writes those files from the action checkout (no npm publish). `badge-url` is the public JSON URL shields.io will fetch
- Gallery score page per repository, with `badge.json`, `badge.svg`, and a markdown snippet that links back to the score page

### Gallery SEO and llms.txt

- Each gallery repository has an indexable page titled "<repo> architecture explained" (`/<slug>/explained/`) with a title, meta description, Open Graph tags, a canonical URL, and JSON-LD `SoftwareSourceCode`
- `sitemap.xml` lists the document page, the explained page, and the score page. `robots.txt` allows the site and names `llms.txt`
- `llms.txt` and `llms-full.txt` at the repository root and at the site root describe install, CLI, MCP, the action, and the badge

### Docs

- MCP Rush listing badge on the README MCP section (text link only in the top links row), `docs/MCP.md`, `llms-install.md`, and the gallery index

### CLI

- `watch` prints the empty-scan hint (`No files matched scan.include`) once

Exit codes stay 0 success, 1 runtime error or unknown command, and 2 validation failure (bad flags, missing config, missing target, doctor failure, 0 files scanned, nothing to watch, `badge` with nothing to score, `comment` without a base or head ref, `--strict` credentials, feedback without a terminal).

## 1.15.1

### Watch and code health

- `watch` exits 2 when `scan.include` matches no files, including after `init --quick` in an empty directory. It prints a hint to fix `scan.include` and `module_roots` and does not wait for changes
- Code health analyzes Python (`.py`, `.pyw`) and Go (`.go`) as well as JavaScript and TypeScript. A Python or Go repository no longer logs `Code health: no source files analyzed` when source files were scanned. Test modules (`test_*.py`, `*_test.py`, `*_test.go`, and `tests/`) are skipped

Exit codes stay 0 success, 1 runtime error or unknown command, and 2 validation failure (bad flags, missing config, missing target, doctor failure, 0 files scanned, nothing to watch, `--strict` credentials, feedback without a terminal).

## 1.15.0

### CLI usability

- `init --quick` detects the repository language (Python, Go, Rust, Java/Kotlin, JavaScript/TypeScript, Ruby, PHP, C#, Swift, C/C++, and mixes of those) and writes matching `scan.include` globs and `module_roots`. It no longer defaults to JavaScript-only patterns such as `src/**/*.{ts,tsx,js,jsx,md}`
- `init --quick` enables the Markdown publisher only. The interactive wizard can still add Notion, Confluence, GitHub Wiki, and Obsidian
- `doctor` fails when `scan.include` matches 0 files
- `demo` and `publish` print a warning and exit 2 when 0 files are scanned. They do not write empty documentation
- `repolens <command> --help` prints that command's usage and flags for init, doctor, migrate, publish, demo, watch, uninstall, feedback, and mcp
- `--target` is checked before any scan or publish. A missing path exits 2 with `Target directory not found: <path>`
- A directory that is not a git repository is reported as `not a git repository`. Code health does not claim an average of 100/100 across 0 files
- `watch` exits 2 when none of the `module_roots` directories exist
- `publish --strict` exits 2 when a configured publisher is missing credentials
- `repolens` with no arguments prints help and does not publish
- The ASCII banner is omitted when stdout is not a terminal or `CI` is set
- Init's next-steps text uses `repolens publish` when the CLI is installed globally, and `npx @chappibunny/repolens publish` otherwise

Exit codes stay 0 success, 1 runtime error or unknown command, and 2 validation failure (bad flags, missing config, missing target, doctor failure, 0 files scanned, nothing to watch, `--strict` credentials, feedback without a terminal).

## Unreleased

### Release workflow

- Before publishing, the release workflow queries `npm view <pkg>@<ver> version --prefer-online` up to three times, waiting 10 seconds between tries, and skips `npm publish` when that version is already on npm
- If `npm publish` fails, the same check runs again. The step passes when the version is live
- The GitHub Release uploads `chappibunny-repolens-*.tgz`, which is the tarball name `npm pack` writes for `@chappibunny/repolens`

## Unreleased

### Docs

- README VS Code badge switched to a static shields.io badge (the visual-studio-marketplace badges were retired)
- New `assets/social-preview.png` (1280x640, rendered from HTML with headless Chrome)

## 1.14.3

### Docs

- README "Use with Cline" section and `llms-install.md` for agent-driven installs
- Note on `min-release-age` / stale npx cache resolving a pre-MCP release
- Verified end to end from a clean npm cache with the MCP SDK stdio client: initialize, tools/list, all six tools on expressjs/express, error cases, stdout carries only JSON-RPC

## 1.14.2

### Discoverability

- Docs badge line now links to the gallery (`[Examples](https://chapibunny.github.io/repolens/)`)
- Added `glama.json` (Glama MCP directory ownership) and `CITATION.cff`
- More npm keywords; npm `homepage` points at the gallery
- README: MCP Registry and Gallery badges and a links row


### Gallery

Static showcase of deterministic RepoLens output for public repositories. The package version is unchanged.

- `gallery/build.mjs` shallow-clones the curated list in `gallery/repos.json`, runs RepoLens with AI disabled, and writes one HTML page per repository plus an index, `sitemap.xml`, and `robots.txt`
- A repository that fails to clone, fails the license check, or fails the scan is skipped. The build refuses to publish when too few repositories succeed
- `.github/workflows/gallery.yml` rebuilds the site weekly and on manual dispatch, caches clones, and deploys with GitHub Pages to `https://chapibunny.github.io/repolens/`
- `gallery/` stays out of the npm package: it is not in the `files` allowlist, and `/gallery` is listed in `.npmignore`
- Gallery pages use a flat Material layout: square corners, no shadows or gradients, one primary colour and one accent on white and light grey, a flat RepoLens app bar, and a dense repository table on the index. The same stylesheet covers each repository page

## 1.14.1

### Registry name and publish skip

- MCP Registry server name is `io.github.CHAPIBUNNY/repolens`. `package.json` `mcpName` and `server.json` `name` use that spelling. The registry matches the GitHub username case
- `server.json` `description` is 100 characters or fewer
- The release workflow skips `npm publish` when that exact version is already on the registry

## 1.14.0

### MCP server

AI coding tools can call RepoLens over stdio.

- New command: `repolens mcp`. The package also installs `repolens-mcp`
- Official `@modelcontextprotocol/sdk` server. Tools: `get_system_overview`, `list_modules`, `get_api_surface` (includes routes), `get_dependency_graph`, `get_architecture_diff`, `generate_docs`
- Read-only except `generate_docs`, which writes Markdown inside the workspace
- Every path stays inside the workspace root (`REPOLENS_WORKSPACE` or the working directory), using the existing `isInsideRoot` and `resolveOutputDir` helpers
- Deterministic mode is the default and does not make network calls. Logs go to stderr so they do not corrupt the protocol
- `get_architecture_diff` uses the existing git diff. `baseRef` compares against the working tree. `headRef` diffs two refs. Unsafe refs are rejected
- `package.json` `mcpName` is `io.github.CHAPIBUNNY/repolens`. Root `server.json` matches it for the MCP Registry. `smithery.yaml` starts `npx -y @chappibunny/repolens mcp`
- Client setup, including Cursor and VS Code install badges, is in `docs/MCP.md`

### GitHub Action

- Root `action.yml`: composite action **RepoLens Architecture Docs** (icon `book-open`, color `blue`)
- Inputs: `command` (`publish`, `demo`, `doctor`), `config`, `node-version`, `pr-comment`, `version`
- Runs the published package with `npx --yes @chappibunny/repolens@<version>`. Inputs are passed as environment variables and checked before they are placed on the npx argument list
- `REPOLENS_PR_COMMENT=false` skips the architecture diff comment even when `GITHUB_EVENT_NAME` is `pull_request`
- Marketplace listing is a checkbox on a GitHub Release. The steps are in `docs/RELEASE.md`. This release does not publish the action, the npm package, or a tag

### Docs badge

- Generated Markdown ends with a shields.io badge linking to https://github.com/CHAPIBUNNY/repolens
- On by default. Set `branding: false` or `branding.badge: false` to turn it off. Schema v1 stays at `configVersion: 1`
- README section **Add the badge to your repo** has the snippet

## 1.13.1

### Docs

- Docs alignment patch: README, CHANGELOG and docs/* point the VS Code extension at the `repolensdox.repolensdox` Marketplace listing (https://marketplace.visualstudio.com/items?itemName=repolensdox.repolensdox)
- npm package README now carries the new extension link

## 1.13.0

### Obsidian vault publisher

Publish generated docs into a folder in a local Obsidian vault. No network calls and no credentials.

- New publisher: `obsidian` (`src/publishers/obsidian.js`)
- Notes get YAML frontmatter (`title`, `aliases`, `tags`, `type`, `project`, `branch`) and an index note (`RepoLens.md`) with wikilinks
- Markdown links to generated pages become `[[wikilinks]]`. External URLs and fenced code blocks are left alone
- Re-running publish is idempotent: identical notes are not rewritten, and notes RepoLens previously published but no longer generates are removed. Other files in the folder stay
- `obsidian.folder` must resolve inside `obsidian.vault`. Absolute folders, `..`, and symlinks that leave the vault are rejected
- Optional config on schema v1: `obsidian.vault`, `obsidian.folder`, `obsidian.branches`, `obsidian.index`, `obsidian.frontmatter`, `obsidian.wikilinks`. Existing configs keep working
- `repolens init` can select the Obsidian publisher and ask for a vault path
- `repolens doctor` checks that `obsidian.vault` is set and does not require env vars for it
- Wikilink rewriting is a linear scan with bounded label and target lengths. The previous link regex was polynomial on hostile markdown (CodeQL)

### Security

- `repolens init` workflows grant `contents: read` and `pull-requests: write`. Architecture Diff comments use the Issues comments API on the pull request, which accepts `pull-requests: write`. `contents: write` is not granted. GitHub Wiki pushes still need `contents: write` on that job only

### Docs

- `docs/ROADMAP.md` now summarizes what shipped from v1.1.0 through v1.12.4, and marks the VS Code extension and the Obsidian publisher as shipped
- README roadmap matches `docs/ROADMAP.md`
- The README no longer hard-codes the release version. It points at `package.json`, which is the source of the version
- Test totals are no longer hard-coded in the README, development guide, or security guide. The tests badge follows the `test.yml` workflow status
- Handbook pages (README, `docs/*`, `SECURITY.md`, `CONTRIBUTING.md`, and `.github/copilot-instructions.md`) describe 1.13.0 and the Obsidian publisher
- Corrected drift against the code: `scan.ignore` (there is no `scan.exclude`), `publish` has no `--dry-run`, CI installs with `npm ci`, the publish workflow is `repolens.yml`, diagrams are Unicode, and local files use two filename schemes. `outputs.pages` stays the frozen allowlist; the generator still emits the full 17-document plan unless `documentation.sections` or `features` filters it

## 1.12.4

### Security

- GitHub Wiki git commands use an argument array. The token is passed with `http.extraheader` and is no longer written into the clone URL or `origin` remote
- Wiki page names and generated document names cannot leave their output directory
- `documentation.output_dir` must stay inside the repository. Absolute paths and `..` are rejected
- Scan results that resolve outside the repository root are dropped, and absolute `scan.include` patterns are rejected
- Monorepo workspace globs that point outside the repository are ignored
- YAML configs are size-capped and alias-capped before `js-yaml` parses them. The js-yaml 4 schema is unchanged
- Notion, Confluence, GitHub, and Discord error bodies are truncated and redacted before they are logged
- Confluence URLs with embedded credentials, or a scheme other than http/https, are rejected
- Discord webhooks must be `https` and time out after 15 seconds
- AI startup logs no longer print a prefix of the API key
- Secret detection covers fine-grained GitHub tokens (`github_pat_`), `gho_` / `ghu_` / `ghr_` tokens, and npm tokens
- `Retry-After` values that are not seconds or an HTTP date no longer become `NaN` delays
- Browser signup links are opened without a shell
- GitHub Actions: test and security jobs are `contents: read`. `id-token: write` is only on the npm publish job. The token-present check no longer prints the token length
- Test workflow runs on Node.js 18, 20, and 22. Node 18 runs `scripts/node18-runtime.js` because Vitest 4 cannot start there (`util.styleText` needs Node 20.12). Node 20 and 22 run the full Vitest suite

### Fixes

- Update checks query `@chappibunny/repolens` on the npm registry. The cache file uses the real home directory on Windows and Unix
- `repolens init` in CI, tests, and non-TTY sessions scaffolds files instead of exiting before writing anything
- `repolens demo --target` looks for `.repolens.yml` from the target directory, so a demo of another folder does not scan the shell's current repository
- `repolens feedback` exits 2 when there is no terminal, and exits 1 when sending fails
- Unknown flags and missing `--config` / `--target` values exit 2. `--help` and `--version` work before or after the command
- `repolens --version` and `repolens --help` from the installed binary do not load the scanner or telemetry
- Empty repositories finish the scan with a warning instead of looking like a hung run. Binary files and files over 1 MB are not parsed as source
- Git renames in `git diff --name-status` record the new path. Unsafe diff refs are ignored instead of being interpolated into a shell command. A missing repo or ref no longer prints git's usage text, and the diff runs in the scanned repository rather than whatever directory the shell happened to be in
- Branch filters escape regex metacharacters, so a pattern like `release/*)` does not throw
- Confluence page-cache filenames cannot contain path separators from the branch name
- Notion block pagination stops if a cursor repeats

### Dependencies

- `dotenv` 18.0.8 (`import "dotenv/config"` is unchanged; Node `-r dotenv/config` preload was removed upstream)
- `tinyexec` 1.3.1 (dev dependency, Node 18+)
- js-yaml stays on 4.x, Vitest stays on 4.x, and `@sentry/node` stays on 10.x so `engines` can remain `>=18`

## 1.12.3

### Security

- Bump runtime `js-yaml` to 4.3.2 (merge-key CPU limit and `!!omap` duplicate-key complexity fixes)
- Bump transitive `source-map-js` to 1.2.2 (CVE-2026-93749)
- Bump transitive `postcss` to 8.5.31 (Dependabot #8 requested 8.5.25; 8.5.31 includes those fixes)
- Bump `vitest` and `@vitest/mocker` to 4.1.12 (Dependabot #10 requested 4.1.11; 4.1.12 is the current 4.1 release and includes that fix)
- No patched `braces` release exists for GHSA-vfj7-8cjw-p6xm (latest is 3.0.3, which the advisory covers). The release audit now checks production dependencies only and waives that one advisory. Any other high or critical runtime finding still fails the job. See `scripts/audit-waivers.json` and `SECURITY.md`.

### Packaging

- Require Node.js `>=18` (`engines`), matching built-in `fetch` and `node:readline/promises`
- Add an `exports` map. `main` now points at `src/index.js`, so importing the package does not run the CLI
- Keep the `repolens` binary on `bin/repolens.js`
- Replace `node-fetch` with the built-in `fetch` (`AbortSignal.timeout` for the update check)
- Move `@sentry/node` to `optionalDependencies`. Telemetry and feedback no-op when it is not installed
- Stop publishing the `docs/` handbook. Runtime document generation stays in `src/docs/`

### CI

- Publish Documentation runs on pushes to `main` and manual dispatch, and skips `dependabot[bot]`, because publisher secrets are not available on Dependabot branches
- Add a Test workflow that runs `npm test` on pull requests and branch pushes
- CI installs with `npm ci` so the committed lockfile is what runs. A fresh `npm install` on npm 10 crashes while resolving Vitest 4.1 optional peers
- Release workflow publishes with `npm publish --provenance` (requires an `NPM_TOKEN` Actions secret)

### Fixes

- `docs:publish` discovers `.repolens.yml` from the current directory instead of `../../.repolens.yml`
- `release:check` runs `npm pack --dry-run`

## 1.12.0

### 🛡️ Security Pattern Detection

New static analysis for security anti-patterns with CWE classification:

- **16 anti-patterns** across 8 categories: Code Injection (eval), XSS (innerHTML), SQL Injection, Command Injection, Path Traversal, Prototype Pollution, Hardcoded Credentials, Insecure Randomness, ReDoS
- Each finding includes severity (high/medium/low), file location, code snippet, and CWE ID
- New renderer: `renderSecurityHotspots()` with severity breakdown, category grouping, and remediation guidance
- New document type: **Security Hotspots** (`security_hotspots`)
- Skips test files, build outputs, configs, `.min.js`, `.d.ts` to reduce noise
- 30 new tests in `security-patterns.test.js`

### 📊 Complexity & Code Health Scoring

Cyclomatic complexity analysis with unified health scoring:

- **Per-file and per-function complexity**: Counts if/else/for/while/case/catch/&&/||/??/ternary with comment and string stripping
- **Unified health score** (0–100, A–F grades) per module synthesizing:
  - Cyclomatic complexity penalties
  - Coupling metrics (fan-in × fan-out from dependency graph)
  - JSDoc documentation coverage
  - Security findings severity
- New renderer: `renderCodeHealth()` with grade distribution, hotspot table, top complex functions, and scoring methodology
- New document type: **Code Health** (`code_health`)
- 41 new tests in `code-health.test.js`

### 📝 JSDoc/TSDoc Extraction

API Surface enrichment with documentation extraction:

- Parses `@param`, `@returns`, `@deprecated`, `@example`, `@throws`, `@since` tags
- Enriches API Surface document with parameter types, descriptions, and deprecation notices
- Coverage reporting (e.g., "89/167 exports documented (53%)")
- 16 new tests in `jsdoc-analyzer.test.js`

### 📈 Numbers

- **17 document types** (up from 15): added Security Hotspots + Code Health
- **480 tests** passing across 25 test files (up from 393 across 22)
- **12 analyzers** in the pipeline

## 1.11.0

### 🧙 Smart URL Parsing in Wizard

The init wizard now intelligently parses URLs you paste, automatically extracting the right values:

**Confluence:**
- Paste a full page URL → wizard extracts base URL, space key, AND page ID
- No more confusion between base URL vs page URL
- Space key clearly explained (examples: `DOCS`, `ENG`, `~username` for personal)
- Validates credentials immediately by testing connection to your space

**Notion:**
- Paste a full Notion page URL → wizard extracts the 32-char page ID automatically
- Tests connection immediately and confirms your integration has access
- Clear step-by-step instructions with browser auto-open for integrations page

### 🌐 Multi-Language Scan Presets

The wizard now supports **8 language/framework presets**:

| # | Preset | Languages | Best For |
|---|--------|-----------|----------|
| 1 | **Universal** | All (JS, TS, Python, Go, Rust, Java, Ruby, PHP, C#, Swift, Kotlin, Scala, Vue, Svelte) | Polyglot projects |
| 2 | Next.js / React | TypeScript, JavaScript | React frontends |
| 3 | Express / Node.js | TypeScript, JavaScript | Node.js backends |
| 4 | **Python** | Python | Django, Flask, FastAPI |
| 5 | **Go** | Go | Standard Go layout |
| 6 | **Rust** | Rust | Cargo projects |
| 7 | **Java/Kotlin/Scala** | JVM languages | Maven/Gradle |
| 8 | JavaScript/TypeScript | JS/TS only | Legacy JS projects |

**Universal is now the default** — no more "0 modules detected" because of language mismatch!

### 🔐 Critical .env Reminder

After collecting credentials, the wizard now prominently displays:
```
┌────────────────────────────────────────────────────────────┐
│ IMPORTANT: Your credentials are in .env but not loaded yet │
│ Run this BEFORE 'repolens publish':                         │
│                                                              │
│   source .env                                               │
└────────────────────────────────────────────────────────────┘
```

### 🧪 New Tests

- 13 new tests for URL parsing functions (`parseConfluenceUrl`, `parseNotionInput`)
- Total: 393 tests passing

## 1.10.0

### ✨ Interactive Init is Now Default

- **`repolens init` is now fully interactive**: No more `--interactive` flag needed — the wizard runs by default
- **Use `--quick` to skip the wizard**: For CI or minimal scaffolding, use `repolens init --quick`
- **Comprehensive wizard**: Configures ALL publishers (Notion, Confluence, GitHub Wiki), not just Notion
  - Collects credentials for each selected publisher
  - Guides AI provider selection with environment validation
  - Discord webhook configuration
  - Branch filtering for Notion/Confluence publishing
  - Shows clear summary of GitHub Actions secrets needed
- **Credentials written to `.env`**: All collected credentials are saved locally (gitignored)
- **Better validation**: Shows specific status for each credential (✓ set vs ○ needed)

### 🤖 AI Setup from CLI

- **Browser auto-open**: Wizard offers to open API key signup pages (OpenAI, Anthropic, Google) in your browser
- **API key validation**: Tests your AI key immediately after you paste it — confirms it works before saving
- **GitHub Token testing**: Validates existing `GITHUB_TOKEN` works with GitHub Models
- **Clear feedback**: Shows ✓ valid / ⚠ invalid with specific error messages
- **Writes all config**: `.env` now includes `REPOLENS_AI_ENABLED=true` and `REPOLENS_AI_PROVIDER=...`

### 🔧 AI Diagnostics

- **Better error messages**: AI failures now show the actual reason (e.g., "Missing API key (expected REPOLENS_AI_API_KEY)")
- **Config logging**: First AI call logs the provider, model, and key prefix being used
- **Workflow template updated**: Default workflow now shows both GitHub Models (free) AND OpenAI options with clear comments

## 1.9.12

### 🐛 Bug Fixes

- **PR comment failure no longer crashes publish**: 403 errors from `upsertPrComment` are now caught and logged as warnings instead of crashing the entire workflow

## 1.9.11

### 🐛 Bug Fixes

- **Fixed uninstall hang**: Refactored to use `promptYesNo` helper instead of raw readline (stdin was not properly closing)

## 1.9.10

### 📹 Documentation

- **Fixed demo video link**: Use text link instead of thumbnail (Loom CDN requires specific sharing settings)

## 1.9.9

### 🐛 Bug Fixes

- **Fixed cache age calculation**: Use `Math.max(0, ...)` to prevent negative age due to filesystem timestamp precision

## 1.9.8

### 📸 Documentation

- **Added publisher screenshots**: README now shows Notion and Confluence output examples in 2-column layout
- **Organized assets**: Moved screenshots to `assets/` folder with consistent naming

## 1.9.7

### 📹 Documentation

- **Fixed demo video embed**: Use Loom thumbnail with link (iframes don't render in GitHub markdown)

## 1.9.6

### 📹 Documentation

- **Updated demo video**: README now embeds new Loom demo video

## 1.9.5

### ✨ UX Improvements

- **AI Provider Presets**: New `REPOLENS_AI_PRESET` environment variable for one-line AI setup. Supports `github`, `openai`, `anthropic`, and `google` presets that automatically configure provider, base URL, and model.

- **Progress Indicator**: Document generation now shows step-by-step progress: `[1/15] Generating executive_summary...`, `[2/15] Generating business_domains...`, etc.

- **Config Typo Detection**: `repolens doctor` now detects typos in config keys and suggests corrections using Levenshtein distance. For example: `Unknown config key "projet" — did you mean "project"?`

- **Cache Age Display**: Publishing shows when the cache was last updated: `Cache: 5/15 documents unchanged (last run: 2h ago)`.

- **Verbose Export**: The `--verbose` flag and `isVerbose` constant are now exported from logger for use by plugins and custom scripts.

### 🧪 Tests

- Updated doc-cache tests to verify new `{ cache, age }` return format
- **380 tests passing** across 22 test files

## 1.9.3

### ✨ Premium Deterministic Documentation

**Major overhaul of all 6 AI-fallback document generators.** Deterministic mode now produces documentation quality comparable to AI-enhanced mode:

- **Executive Summary**: Complete rewrite with health scoring (0-100 scale), monorepo structure detection, module composition breakdown by layer, codebase health tables with status indicators, key data flow summaries with criticality markers, and strategic observations based on actual patterns.

- **System Overview**: Enhanced with route pattern descriptions, dependency graph metrics, hub module analysis, and detailed route summaries explaining what each pattern (API, page, SSR) means.

- **Business Domains**: Rich domain capability descriptions, cross-domain dependency analysis with full module paths, domain health summary table, and business impact assessment per domain.

- **Architecture Overview**: Pattern explanation with benefits, system layers table with architectural insights, dependency health metrics, strengths and concerns sections, and hub module highlighting.

- **Data Flows**: Flow diagrams with step-by-step breakdowns explaining what each step does, shared libraries context, import network statistics, and actionable recommendations.

- **Developer Onboarding**: Getting Started checklist, codebase-at-a-glance statistics, key routes with explanations, framework and language learning tips, common pitfalls section, and module importance ratings.

**18+ new helper functions** added for intelligent content generation:
`inferDomainCapability()`, `getLayerResponsibility()`, `calculateHealthScore()`, `formatFileScale()`, `describeRoutePattern()`, `inferFrameworkPurpose()`, `explainPattern()`, `getBenefitsForPattern()`, `getLayerInsight()`, `getFrameworkArchitecturalImplication()`, `getLanguageImplication()`, `inferPageDescription()`, `inferAPIEndpointPurpose()`, `inferPackageDescription()`, `inferStepPurpose()`, `shouldStartHere()`, `getFrameworkLearningTip()`, `getLanguageLearningTip()`, `getModuleImportance()`

### 🔧 Why This Matters

Users without AI API keys now get production-quality documentation instead of sparse placeholders. The deterministic output includes:
- Health scores and assessments
- Business capability descriptions
- Architectural pattern explanations
- Actionable recommendations
- Framework-specific learning tips
- Rich tables with insights

### 🧪 Tests

- **380 tests passing** across 22 test files
- All deterministic enrichment tests updated and passing

## 1.9.2

### 🐛 Bug Fixes

- **Notion duplicate pages fixed**: Publishing no longer creates duplicate pages on every release. Added Notion Search API as primary lookup method for existing pages (more reliable than child block iteration), with case-insensitive title matching fallback.
- **Confluence empty pages fixed**: Executive Summary, System Overview, Business Domains and other AI-generated docs now publish correctly to Confluence. Added defensive null/empty content checks with helpful fallback messages instead of blank pages.
- **Document generation validation**: All document generators now validate output and provide error placeholders if generation fails, ensuring publishers always have content to work with.
- **Notion publisher robustness**: Now iterates over all rendered pages (not just config-defined ones), with content length logging for debugging.

### 🧪 Tests

- Added test for `markdownToConfluenceStorage` handling of empty/null content
- **380 tests passing** across 22 test files

## 1.8.2

### 🐛 Bug Fixes

- **Uninstall crash fixed**: `repolens uninstall` crashed with `Cannot read properties of undefined (reading 'trim')` when run via `npx`. The readline prompt used the callback-based `node:readline` API incorrectly with `await`. Fixed by wrapping in a proper Promise with null guard.

### ✨ AI Auto-Detection

- **GITHUB_TOKEN auto-enables AI**: `demo`, `publish`, and `init` commands now detect `GITHUB_TOKEN` in the environment and automatically enable AI-enhanced docs via GitHub Models (free). No manual configuration needed.
- **Workflow template enables AI by default**: The generated `.github/workflows/repolens.yml` now has `REPOLENS_AI_ENABLED`, `REPOLENS_AI_PROVIDER`, and `GITHUB_TOKEN` enabled (not commented out) since GitHub Models is free.
- **Init auto-configures AI**: Non-interactive `repolens init` writes `ai.enabled: true` and `ai.provider: github` to `.repolens.yml` when `GITHUB_TOKEN` is detected.
- **Better AI messaging**: Demo and publish commands show prominent status about AI mode (enabled/deterministic) with specific guidance on what AI adds.
- **Sharper deterministic upsell**: All 6 fallback document types now explain exactly what AI adds (e.g., "adds plain-language explanations, strategic recommendations, and risk assessments") and mention `GITHUB_TOKEN` auto-detection.

### 📖 Documentation

- **Scoped package name everywhere**: All user-facing docs now use `npx @chappibunny/repolens` instead of bare `repolens`. Added warning about the squatted `repolens@0.0.1` placeholder package on npm.
- Updated: README.md (commands table + warning), TROUBLESHOOTING.md, MIGRATION.md (6 instances), KNOWN_ISSUES.md (2 instances), bug report template.

## 1.8.1

### 📖 Documentation Refresh

- **README overhaul**: Updated test badge (379 passing), version reference (v1.8.1), document count (15 types), expanded audience table to include all 15 documents (GraphQL Schema, TypeScript Type Graph, Dependency Graph, Architecture Drift), added `uninstall` and `uninstall --force` to commands table.
- **DEVELOPMENT.md**: Updated test coverage (379 across 22 files), expanded test suite description to cover all test categories, fixed tarball version in install example.
- **CLI version test**: Now reads version from `package.json` dynamically instead of hardcoding — won't break on future version bumps.

## 1.8.0

### ✨ GitHub Models — First-Class AI Provider

- **GitHub Models provider**: Added `github` as a native AI provider. Uses the OpenAI-compatible endpoint at `models.inference.ai.github.com` with automatic `GITHUB_TOKEN` authentication — no extra API keys needed in GitHub Actions.
- **Zero-config AI in CI**: When `ai.provider: github` is set in `.repolens.yml`, RepoLens uses the default `GITHUB_TOKEN` injected by GitHub Actions. No secrets to create or manage.
- **Config-driven AI settings**: `ai.enabled`, `ai.provider`, `ai.model`, `ai.temperature`, and `ai.base_url` in `.repolens.yml` are now fully respected at runtime (env vars still take precedence). Previously these config values were ignored.
- **Init wizard fixes**: Provider selection now uses correct runtime values (`github`, `openai_compatible`, `anthropic`, `google`) instead of mismatched labels. The wizard now emits `ai.provider` to the generated YAML. Added `github_wiki` to publisher choices.
- **Demo AI upsell**: `repolens demo` now shows a hint about GitHub Models (free) when AI is not enabled, guiding users to `repolens init`.
- **Uninstall command**: `repolens uninstall` removes all RepoLens-generated files (`.repolens/`, `.repolens.yml`, workflow, `.env.example`, `README.repolens.md`) with confirmation prompt and `--force` flag.
- **Doctor validation**: `repolens doctor` now checks for `GITHUB_TOKEN` when provider is `github`, and `REPOLENS_AI_API_KEY` for other providers.

### 📖 Documentation

- Updated AI.md, ENVIRONMENT.md, ONBOARDING.md, README.md with GitHub Models as recommended provider
- Init templates (.env.example, workflow, README) include GitHub Models setup instructions
- Onboarding shows dual-track: Option A (GitHub Models, free) and Option B (OpenAI / other)

### 🧪 Tests

- 29 new tests: provider config fallbacks, `isAIEnabled` with config, `getAIConfig` with config, GitHub Models defaults, init wizard content, doctor env validation, uninstall command (5 scenarios)
- **379 tests passing** across 22 test files

## 1.7.1

### 🛡️ AI Output Guardrails

- **System prompt hardening**: Added anti-conversational rules — AI now instructed to never offer additional work, never ask questions, never use second-person address (except onboarding), and to back every claim with context evidence.
- **Evidence-only constraints**: Architecture weaknesses, exec summary risks, and onboarding complexity hotspots now require concrete evidence from context data (cycle counts, coupling metrics, orphan files). No speculation.
- **Output sanitizer**: New `sanitizeAIOutput()` strips conversational patterns (`"If you want"`, `"I can produce"`, `"Shall I"`, `"Let me know"`) from both structured JSON and plain-text AI responses before they reach documents.
- **Structured renderer sanitization**: `renderArchitectureOverviewJSON` now sanitizes weakness bullet items, removing conversational lines even if they survive prompt-level constraints.
- **Dual-path coverage**: Sanitization applies to both structured JSON mode (Path A) and plain-text fallback (Path B), closing all AI output paths.

## 1.7.0

### ✨ Features

- **Dependency-weighted module roles**: Module catalog now shows import-based role labels (e.g. "Orchestrator — coordinates 54 modules", "Critical shared infrastructure — imported by 55 modules") derived from real dependency graph metrics.
- **Context-aware route map**: CLI tools now get a helpful explanation ("This project is a CLI tool — it does not expose HTTP routes") instead of an empty route table with a stale footer.
- **Verified architecture patterns**: Detected patterns now include confidence labels (e.g. "naming only" vs evidence-backed) based on dependency graph verification.
- **Import-chain data flows**: Data flows are now traced from real entry points via import chains, replacing hardcoded template flows. Shows actual module dependencies and downstream traces.
- **CLI-aware tech stack labels**: All 4 key documents (Executive Summary, System Overview, Architecture Overview, Developer Onboarding) now show "N/A (CLI tool)" instead of "Not detected" for Frameworks and Build Tools when the project is a CLI tool.
- **Test flow filtering**: Test file flows are now filtered from Executive Summary, Data Flows, and Developer Onboarding documents, keeping output focused on production code paths.
- **Hub flow cleanup**: Integration flows derived from dependency graph hubs no longer list test files as importers in their step chains.

### 🐛 Bug Fixes

- **GraphQL false positives**: The GraphQL analyzer now excludes test files and its own analysis/rendering source files from scanning, preventing self-detection of library patterns (e.g. detecting "Apollo Server" from regex pattern strings).
- **GraphQL pattern precision**: The `graphql-js` detection pattern now uses word boundaries (`\bGraphQLSchema\b`) to avoid false matches from function names like `renderGraphQLSchema`.
- **Change impact noise filtering**: Architecture diff now filters `node_modules/`, `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `.repolens/`, and `.git/` from both the Impacted Modules list and the file lists (Added/Removed/Modified).
- **Zero-value suppression**: Documents no longer show "serves 0 application pages" or "0 API endpoints" for CLI tools — these rows are conditionally hidden when values are zero.
- **Module label enrichment**: `describeModule()` now recognizes 6 additional module types (plugin, prompt, provider, generate/section, ai/ml), reducing generic "Application module" fallbacks.

## 1.6.0

### ✨ Features

- **Deterministic enrichment**: All 6 AI-enhanced document types now produce significantly richer output when running without AI integration. Fallback generators receive dependency graph stats, data flows, monorepo info, routes, drift results, and module type classifications.
- **Executive Summary**: Now includes module composition breakdown, monorepo structure, codebase health metrics (cycles, orphans, hubs), data flow summaries, and test framework info.
- **System Overview**: Now includes module architecture by type, route summary (pages + APIs), dependency graph stats with hub modules, and monorepo info.
- **Business Domains**: Now maps routes to domains and shows cross-domain dependency hubs.
- **Architecture Overview**: Now includes module layers by type, dependency health with strengths/concerns heuristics, hub modules, architecture drift summary, and monorepo architecture.
- **Data Flows**: Now generates additional flows from dependency graph hub chains when heuristic flows are sparse, shows shared library and external service dependencies per flow, and includes import network summary.
- **Developer Onboarding**: Now includes monorepo navigation, key routes to explore, data flow overview, integration point warnings, module type classification in the module table, and test framework quickstart.
- **Activated dead code**: `identifyFlowDependencies()` from `flow-inference.js` is now imported and used in the data flows fallback to enrich each flow with shared library and external dependency context.

### 🧪 Test Coverage

- **Deterministic enrichment tests** (`tests/deterministic-enrichment.test.js`): 36 tests covering all 6 enriched fallback generators — module composition, monorepo sections, dependency health, route summaries, data flow generation from dep graph, backward compatibility.
- **347 tests** passing across **22 test files** (up from 311/21).

## 1.5.3

### 🔧 Improvements

- **CI test gate**: Publish workflow now runs the full Vitest suite before publishing. The `publish` job requires both `security` and `test` jobs to pass.

### 🧪 Test Coverage

- **Renderer unit tests** (`tests/renderers.test.js`): 33 tests covering all four `render.js` exports (`renderSystemOverview`, `renderModuleCatalog`, `renderApiSurface`, `renderRouteMap`), `renderSystemMap` (with/without depGraph, categories, limits), and `renderDiff.js` (`buildArchitectureDiffData` route detection, `renderArchitectureDiff` truncation).
- **311 tests** passing across **21 test files** (up from 278/20).

## 1.5.2

### 🐛 Bug Fixes

- **retry-after: 0 honoured**: Fixed falsy-zero bug in `fetchWithRetry` where `retry-after: 0` header was ignored (fell through to `baseDelayMs`). Now properly honours the server's hint, even when it's zero.

### 🧪 Test Quality

- **Mock HTTP server integration tests** (`tests/http-integration.test.js`): 17 tests exercising `fetchWithRetry` against a real local HTTP server — retry on 429/500, timeout handling, header validation, Notion/Confluence block/format generation.
- **Rate-limit concurrent stress tests** (`tests/rate-limit-stress.test.js`): 9 tests firing 20–50 parallel requests through the token bucket to verify throttling, deadlock freedom, burst behaviour, and `batchRequests` concurrency control.
- **Watch mode test refactor** (`tests/watch.test.js`): Replaced fake timers with real temp directories and real `fs.watch` events. Tests now create actual files, observe filesystem watcher callbacks, and verify debounced rebuilds without `vi.useFakeTimers()`.
- **278 tests** passing across **20 test files** (up from 251/18).

## 1.5.1

### 🐛 Bug Fixes

- **[object Object] rendering fix**: All 6 structured AI renderers now use safe coercion helpers (`safeStr`, `toBulletList`, `toHeadingSections`) that handle strings, arrays, objects, and null values robustly. Prevents `[object Object]` from appearing in Notion/Confluence/Markdown output when AI returns unexpected shapes.

### 🔧 Improvements — Robustness

- **Fetch timeout**: All HTTP requests via `fetchWithRetry` now enforce a 30-second timeout (configurable via `timeoutMs`). Prevents publishers from hanging indefinitely on stalled connections. `AbortError` is converted to a friendly timeout message.
- **Per-document error isolation**: Extended analysis (GraphQL, TypeScript, dependency graph, drift detection) now wraps each phase in try/catch. A failing analyzer no longer blocks the entire doc generation pipeline.
- **Partial-success publishing**: Publisher orchestration no longer throws on the first failure. If Notion fails but Confluence/Markdown succeed, all remaining publishers still run. Failures are logged as warnings. Only throws if *all* publishers fail.

### 📊 Test Coverage

- **251 tests** passing across **18 test files** (up from 224/17).
- New `tests/robustness.test.js` with 27 tests covering: rate limiter, context builder, flow inference, Discord integration, PR comment module, telemetry, write-doc-set file I/O, fetch timeout, doc generation error isolation, and partial-success publishing.

## 1.5.0

### 🚀 New Features (Tier 3 — Differentiation)

- **Document caching**: Hash-based caching skips redundant API calls for unchanged documents. Notion, Confluence, and GitHub Wiki publishers now receive only changed pages; Markdown always gets the full set. Cache persists in `.repolens/doc-hashes.json`.
- **Structured AI output**: AI sections now request JSON-mode responses with schema validation. If JSON parsing or schema validation fails, a single re-prompt is attempted before falling back to plain-text AI, then deterministic generation. All 6 AI document types have JSON schemas and Markdown renderers.
- **Multi-provider AI**: Added native adapters for Anthropic (Messages API) and Google Gemini alongside existing OpenAI-compatible support. Set `REPOLENS_AI_PROVIDER` to `anthropic`, `google`, or `openai_compatible` (default). Azure OpenAI uses the OpenAI-compatible adapter.
- **Monorepo awareness**: Automatic detection of npm/yarn workspaces, pnpm workspaces, and Lerna configurations. Scan results include workspace metadata. System Overview renderer shows package inventory table. AI context includes monorepo structure.
- **CODEOWNERS integration**: Parses `CODEOWNERS` / `.github/CODEOWNERS` / `docs/CODEOWNERS` files. Maps file ownership to modules via last-match-wins pattern matching. Module Catalog now displays an "Owners" column when CODEOWNERS is present. Ownership data is included in artifacts.

### 📊 Test Coverage

- **219 tests** passing across **17 test files** (up from 188/16).
- New `tests/tier3.test.js` with 31 tests covering caching, monorepo detection, CODEOWNERS parsing, multi-provider AI config, and structured output rendering.

## 1.4.0

### 🐛 Bug Fixes (Tier 1 — Production)

- **Confluence CDATA injection**: Code blocks containing `]]>` no longer break Confluence XML storage format. Applied standard CDATA escape pattern (`]]]]><![CDATA[>`).
- **Discord branding**: Replaced 3 leftover "RABITAI" references with "RepoLens" in Discord webhook embeds (title, footer, error title).
- **CLI branding**: Updated 2 remaining "RABITAI" banner strings to "RepoLens" in CLI output and help text.
- **Markdown publisher missing mappings**: Added 9 missing document-type filename mappings (`executive_summary`, `business_domains`, `architecture_overview`, `data_flows`, `developer_onboarding`, `graphql_schema`, `type_graph`, `dependency_graph`, `architecture_drift`). All 15 document plan keys now map to output filenames.
- **Relative link rewriting**: Notion and Confluence publishers now strip relative markdown links (`./path.md`, `../path.md`) that can't resolve in external platforms. Links are replaced with their display text.

### 🔧 Improvements (Tier 2 — Robustness)

- **Generic domain defaults**: Replaced 12 fintech-specific domain hints with 15 universally applicable domains (Authentication, Analytics, Content Management, Search, Notifications, Payments, API Layer, UI Components, Hooks, State, Utilities, Data Layer, Config, Testing, Background Jobs). Domain inference no longer maps "chart" to "Market Data" in non-finance apps.
- **Real import-based system map**: `renderSystemMap()` now uses actual import edges from the dependency graph analyzer when available, instead of heuristic guessing. Diagram labels indicate whether relationships are from "Real import analysis" or "Heuristic inference".
- **AI context size limiting**: Added `truncateContext()` function to AI prompts with a 12K character cap. Progressive pruning: routes/pages to 15, domains to 8, top modules to 10, then hard-truncate. Prevents token overflow on large codebases.
- **Doctor env var validation**: `repolens doctor` now checks for publisher-specific environment variables (NOTION_TOKEN, CONFLUENCE_URL/EMAIL/API_TOKEN, GITHUB_TOKEN, REPOLENS_AI_API_KEY) and warns when required vars are missing for configured publishers.
- **Truncation warnings**: Renderers now display notes when output is truncated — modules >100 in catalog, routes >200 in route map, files/routes >25 and modules >40 in architecture diff.
- **Watch mode tests**: Added 3 new tests for `src/watch.js` covering no-directory handling, watcher setup, and node_modules filtering.

### 📊 Test Coverage

- **188 tests** passing across **16 test files** (up from 185/15).

## 1.3.1

### 📝 Documentation Overhaul

- **README restructured for marketing & onboarding** — 942 → 270 lines. Pain-focused opening, compact feature table, scannable layout. Previously buried the value proposition under spec-sheet detail.
- **New [ONBOARDING.md](ONBOARDING.md)** — Full step-by-step guide extracted from README (publishers, AI, Notion, Confluence, GitHub Wiki, Discord, CI/CD). Previously 350+ lines inside README.
- **Security & Telemetry sections condensed** — ~200 lines of detail replaced with 3-line summaries linking to SECURITY.md and TELEMETRY.md.
- **22-item feature checklist → 8-row "Why RepoLens" table** — Scannable, benefit-focused instead of spec-sheet.
- **Unified documentation table** — All 10 supporting docs linked from one place.
- **Fixed 11 version references** across docs (1.3.0 → 1.3.1).
- **npm version badge** added to README header.

## 1.3.0

### ✨ New Feature: `repolens demo`

- **Zero-config local preview**: New `demo` command generates documentation locally without any API keys or publisher configuration. Works on any repository, even without a `.repolens.yml` — uses sensible default scan patterns.
- **Instant onboarding**: Run `npx @chappibunny/repolens demo` on any repo to see what RepoLens generates. Output written to `.repolens/` directory.
- **Config-aware**: If a `.repolens.yml` exists, demo uses it. Otherwise, defaults to scanning common source patterns (`js`, `ts`, `py`, `go`, `rs`, `java`, etc.) with standard ignore paths.

### 📝 Documentation

- Added demo command to all documentation: README, STABILITY, ROADMAP, copilot-instructions
- Added "Quick Preview" section to README usage guide
- Updated all version references to 1.3.0

## 1.2.0

### ✨ Config Migration

- **`repolens migrate` now patches `.repolens.yml`**: Automatically adds `configVersion: 1` to legacy config files that are missing it. Creates a `.repolens.yml.backup` before modifying. Supports both `.yml` and `.yaml` extensions, dry-run mode, and graceful handling of parse errors or missing configs.

### � Bug Fixes

- **GitHub Wiki empty pages**: Fixed branch mismatch where `git init` created a `main` branch but GitHub Wiki serves from `master`. Now explicitly initializes with `master` and pushes to `refs/heads/master`. Also added content validation to skip pages with empty content.

### �📝 Documentation

- Updated all documentation to reflect v1.2.0 version references
- Updated TROUBLESHOOTING.md with `migrate` auto-fix hint for missing `configVersion`
- Updated KNOWN_ISSUES.md planned improvements (removed shipped features)
- Updated ROADMAP.md with v1.1.0 shipped items

## 1.1.0

### ✨ GitHub Wiki Publisher UX Enhancement

Major upgrade to the wiki output quality — better information hierarchy, audience-aware navigation, and richer page structure.

- **Audience-grouped Home page**: Pages organized by reader (Stakeholders, Engineers, New Contributors, Change Tracking) instead of a flat list
- **Page descriptions**: Each link on Home includes a one-line summary of the page's purpose
- **Status rail**: Home page now shows a metadata table (project, branch, page count, publisher, source)
- **Recommended reading order**: Guided path through the docs for first-time readers
- **Grouped sidebar**: Navigation split into Overview and Architecture sections (plus Custom Pages)
- **Page metadata headers**: Every page gets a `[← Home](Home)` back-link, audience tag, and branch indicator
- **Cleaner footer**: Compact format with branch context and Home link
- **New constants**: `PAGE_DESCRIPTIONS`, `AUDIENCE_GROUPS`, `SIDEBAR_GROUPS`, `PAGE_AUDIENCE`
- **New helpers**: `getPageDisplayTitle()`, `getCustomPageKeys()`, `wikiLink()`, `pageHeader()`

### 🐛 Bug Fixes
- **Temperature still sent to GPT-5**: `DEFAULT_TEMPERATURE = 0.2` always leaked into API requests even after v1.0.1 fixes — the fallback chain (`temperature ?? aiConfig.temperature ?? DEFAULT_TEMPERATURE`) guaranteed it was never `undefined`. Removed the default entirely; temperature is now only sent when explicitly configured via `REPOLENS_AI_TEMPERATURE` env var or `ai.temperature` in config.

## 1.0.1

### 🐛 Bug Fixes
- **GPT-5 API compatibility**: Use `max_completion_tokens` instead of deprecated `max_tokens` parameter
- **GPT-5 temperature handling**: Omit `temperature` from API requests for models that only support the default value (e.g. gpt-5-mini)
- Removed all hardcoded `temperature: 0.2` overrides from AI section generators
- Removed `REPOLENS_AI_TEMPERATURE` from CI workflow and `.env.example`
- Updated `init` scaffolding to omit temperature from default config

### 🔧 Improvements
- Upgraded GitHub Actions: checkout v4.2.2, setup-node v4.2.0, Node.js 22

## 1.0.0

### 🎉 Stable Release

RepoLens v1.0.0 marks the first stable release with a frozen public API. All CLI commands, configuration schema, and plugin interfaces are now covered by semantic versioning guarantees. See [STABILITY.md](STABILITY.md) for the full contract.

### ✨ New Features
- **GitHub Wiki Publisher**: Publish documentation directly to your repository's Wiki tab
  - Git-based: clones wiki repo, writes pages, commits and pushes
  - Generates `Home.md` index, `_Sidebar.md` navigation, `_Footer.md`
  - Branch filtering via `github_wiki.branches` in `.repolens.yml`
  - Auto-detects repository from `GITHUB_REPOSITORY` env or git remote
  - Token sanitization in error messages (never leaks `GITHUB_TOKEN`)
  - Config: `sidebar` and `footer` toggles
  - 17 tests covering publishing, branch filtering, config validation, and security

### 🐛 Bug Fixes
- **GPT-5 API compatibility**: Use `max_completion_tokens` instead of deprecated `max_tokens` parameter
- **GPT-5 temperature handling**: Omit `temperature` from API requests for models that only support the default value (e.g. gpt-5-mini)
- **Git identity in wiki publisher**: Set committer name/email (`RepoLens Bot`) so CI runners can commit
- **Publisher allowlist**: Added `github_wiki` to `validate.js` publisher validation (was only in `config-schema.js`)
- **Doctor false-success**: `repolens doctor` now correctly exits with code 2 when `runDoctor()` reports failures (previously always printed "validation passed")
- **Feedback exit code**: `repolens feedback` now exits with code 1 when feedback fails to send (previously exited 0)
- **Unknown flags**: `repolens --unknown-flag` now prints an error instead of silently running publish
- **scan.ignore security bypass**: Security validator now checks `scan.ignore` patterns (was incorrectly checking non-existent `scan.exclude`)
- **Domains type mismatch**: Both validators now expect `domains` as an object (was array in security validator, object in schema validator)
- **Plugin publisher crash isolation**: Plugin publisher errors are now caught and logged instead of crashing the pipeline

### ✅ Config Stability
- `configVersion: 1` is now **required** (was optional in schema validator)
- Added `confluence` config section validation (branches array)
- Added `ai.temperature` range validation (0–2)
- Added `ai.max_tokens` range validation (>0)
- AI config values from `.repolens.yml` are now used as fallbacks when env vars are not set

### 🔧 Improvements
- Standardized exit codes: `EXIT_SUCCESS=0`, `EXIT_ERROR=1`, `EXIT_VALIDATION=2` as named constants
- Replaced all `console.log`/`console.warn` in production code with logger utilities
- Removed stale "v0.4.0" references from CLI help text and migrate command
- Sentry DSN moved to `REPOLENS_SENTRY_DSN` env var (with backwards-compatible default)
- Hardcoded email in `init` scaffolding replaced with `your-email@example.com` placeholder

### 📄 Documentation
- Added [STABILITY.md](STABILITY.md): Complete public API contract (CLI, config schema, plugin interface, exit codes, env vars)

## 0.9.0

### ✨ New Features
- **Plugin System** (`src/plugins/`): Extensible architecture for custom renderers and publishers
  - `loader.js`: Resolves and imports plugins from local paths or npm packages
  - `manager.js`: `PluginManager` class — registry, getters, and lifecycle hook runner
  - Plugin interface: `register()` → `{ name, version, renderers, publishers, hooks }`
  - **Custom Renderers**: Plugins can register new document types with `render(context)` functions
  - **Custom Publishers**: Plugins can register new output targets with `publish(cfg, renderedPages)` functions
  - **Lifecycle Hooks**: `afterScan`, `afterRender`, `afterPublish` — transform data or trigger side effects
  - Hooks run in plugin load order; errors are caught per-plugin without breaking the pipeline
  - Config: `plugins: ["./my-plugin.js", "@org/repolens-plugin-foo"]` in `.repolens.yml`
  - Config schema updated: `plugins` array validated, custom publisher names accepted

### 🧪 Tests
- Added 21 new plugin tests + 21 publisher parser tests (185 tests across 15 files)

### 🔧 Output Quality
- **Notion Publisher**: Full table support (table blocks with `table_row` children), blockquote → callout, dividers, numbered lists, h3 headings, inline rich text (`**bold**`, `*italic*`, `` `code` ``)
- **Confluence Publisher**: Rewritten as line-by-line parser — proper `<table>` HTML output, blockquotes → info panels, merged `<ul>`/`<ol>` lists, fixed code block HTML entity escaping bug
- **Renderers**: Tables replace bullet-point lists across all 8 renderers, descriptive prose, removed ASCII banner art
- **Fallback Generators**: All 6 deterministic fallbacks rewritten with tables, descriptive paragraphs, and module descriptions

## 0.8.0

### ✨ New Features
- **GraphQL Schema Detection** (`src/analyzers/graphql-analyzer.js`): Detects `.graphql`/`.gql` schema files, inline SDL via gql tagged templates, 11 library patterns (Apollo, Yoga, Mercurius, Nexus, Pothos, type-graphql, Relay, urql, etc.), and resolver patterns. Parses queries, mutations, subscriptions, object types, enums, inputs, interfaces, unions, scalars, and directives.
- **TypeScript Type Graph Analysis** (`src/analyzers/typescript-analyzer.js`): Parses interfaces (with extends), type aliases (with reference extraction), classes (extends + implements), enums, and generic constraints. Builds relationship graph with deduplication, filtering to project-declared types only.
- **Dependency Graph with Cycle Detection** (`src/analyzers/dependency-graph.js`): Parses ES imports, dynamic imports, CommonJS require, and re-exports. Builds directed adjacency graph with cycle detection via iterative DFS (3-color marking). Tracks hub modules, orphan files, and external dependencies.
- **Architecture Drift Detection** (`src/analyzers/drift-detector.js`): Compares current architecture against stored baseline snapshots. Detects changes across 8 categories (modules, APIs, pages, dependencies, frameworks, circular deps, GraphQL types, file count). Categorizes drifts by severity: 🔴 critical, 🟡 warning, 🟢 info. Baselines auto-saved to `.repolens/architecture-baseline.json`.
- **Extended Analysis Renderers** (`src/renderers/renderAnalysis.js`): Markdown renderers for all 4 new document types with tables, Unicode relationship trees, and severity-grouped reports.
- **4 New Document Types**: `graphql_schema`, `type_graph`, `dependency_graph`, `architecture_drift` — bringing total to 15 audience-aware documents.

### 🧪 Tests
- Added 31 new tests for extended analysis features (121 tests across 12 files)

## 0.7.0

### ✨ New Features
- **Interactive Init Wizard**: `repolens init` — step-by-step configuration wizard with scan presets (Next.js, Express, generic), publisher selection, AI provider setup, and branch filtering (now default behavior; use `--quick` to skip)
- **Watch Mode**: `repolens watch` — watches source directories for changes and regenerates Markdown docs with 500ms debounce (no API calls)
- **Enhanced Error Messages**: Centralized error catalog with actionable guidance — every error now shows what went wrong, why, and how to fix it
- **Performance Monitoring**: Scan, render, and publish timing summary printed after every `publish` run
- **Coverage Scoring Improvements**: New section completeness metric (12 document types tracked), updated health score weights, and `metrics.json` snapshots saved to `.repolens/`

## 0.6.4

### 🔧 Maintenance
- Removed internal infrastructure branding from user-facing documentation
- Re-published to npm with corrected README and CHANGELOG

## 0.6.3

### ✨ New Features
- **User Feedback**: Added `repolens feedback` CLI command for sending feedback directly to the RepoLens team
  - Interactive prompts for name, email, and message
  - Works even when telemetry is disabled — feedback is always accepted

### 🔧 Maintenance
- Updated version references across all documentation
- Added `feedback` to CLI help and command listings

## 0.6.2

### 🐛 Bug Fixes
- **CI/CD**: Fixed release workflow failing with `Cannot find module @rollup/rollup-linux-x64-gnu`
  - Root cause: macOS-generated `package-lock.json` doesn't resolve Linux platform-specific optional dependencies
  - Fix: Changed all CI install steps to `rm -rf node_modules package-lock.json && npm install`
  - Applied to both `publish-docs.yml` and `release.yml` workflows

### 🔧 Maintenance
- Updated version references across codebase
- Updated test assertions for version 0.6.2

## 0.6.1

### 🐛 Bug Fixes
- **Confluence Publisher**: Fixed `version` showing as `[object Object]1`
  - Root cause: `existingPage.version` was the full version object, not just the number
  - Fix: Normalize version to use cached structure with extracted version number
- **Confluence Publisher**: Fixed code block formatting in storage format
  - Implemented 3-step extract→convert→restore pipeline
  - Properly handles fenced code blocks in Markdown→Confluence conversion

### 📦 Package
- Renamed npm package from `@rabitai/repolens` to `@chappibunny/repolens`
- Updated all references across codebase, workflows, and documentation
- Published to npm registry under new scope

## 0.6.0 (Team Features & Observability)

### ✨ New Features

**Discord Integration** (`src/integrations/discord.js`):
- Rich embed notifications with coverage, health score, and change metrics
- Threshold-based notifications (default: >10% change)
- Branch filtering with glob pattern support
- Secure webhook configuration via `DISCORD_WEBHOOK_URL` environment variable
- Color-coded embeds: success (green), warning (yellow), error (red), info (blue)

**Metrics Collection System** (`src/utils/metrics.js`):
- Coverage calculation: weighted average (modules 50%, APIs 30%, pages 20%)
- Health score algorithm: 0-100 rating (40% coverage + 30% freshness + 30% quality)
- Staleness detection: flags documentation >90 days old
- Quality analysis: identifies undocumented modules/APIs/pages with severity levels
- Historical tracking: persists metrics to `.repolens/metrics-history.json`
- Trend indicators: up/down/stable trend detection (>1% threshold)

**Configuration Extensions** (`src/core/config-schema.js`):
- Discord configuration: `discord.notifyOn`, `discord.significantThreshold`, `discord.branches`, `discord.enabled`

**Publishing Integration** (`src/publishers/index.js`):
- Automatic metrics collection after publishing
- Discord notifications sent after successful publish (if configured)
- Branch-aware notification filtering
- Graceful error handling (doesn't fail publish if notifications fail)

## 0.5.0 (Phase 3: Security Audit)

### 🔒 Security Hardening

**Security Utilities** (1,296 lines of new code):
- **Secrets Detection** (`src/utils/secrets.js`):
  * Detects 15+ secret patterns (OpenAI, GitHub, AWS, Notion, etc.)
  * Entropy-based heuristic detection for unknown patterns
  * Automatic sanitization in all logger and telemetry output
  * Functions: `detectSecrets()`, `sanitizeSecrets()`, `isLikelySecret()`
  
- **Config Validation** (`src/utils/validate.js`):
  * Validates configuration against injection attacks
  * Detects: directory traversal, shell injection, command substitution
  * Scans config tree for accidentally included secrets
  * Circular reference handling with depth limit
  * Path validation preventing `..` and absolute paths
  
- **Rate Limiting** (`src/utils/rate-limit.js`):
  * Token bucket algorithm (3 req/sec for Notion and AI APIs)
  * Exponential backoff with jitter (3 retries)
  * Wrapper functions: `executeNotionRequest()`, `executeAIRequest()`
  * Batch request processing

**Runtime Integration**:
- Config loader validates all inputs before loading
- Logger sanitizes all console output automatically
- Telemetry sanitizes error messages before sending to Sentry
- All Notion API calls rate-limited to 3 req/sec
- All AI API calls rate-limited to 3 req/sec

**GitHub Actions Hardening**:
- Actions pinned to commit SHAs (supply chain protection)
- Minimal permissions (`contents: read` or `contents: write` only)
- Security job with npm audit and secrets scanning
- Fail-early strategy on security issues

**Comprehensive Testing**:
- 43 new security tests (fuzzing, injection, boundary conditions)
- Total: 90 tests passing (47 main + 43 security)
- Attack vectors tested: SQL injection, command injection, path traversal, YAML bomb, NoSQL, LDAP, XML injection

**Documentation**:
- New `SECURITY.md` with threat model and security features
- Updated `README.md` with security section
- Updated `PRODUCTION_CHECKLIST.md` with security validation
- Security badge in README

### 📊 Testing
- All 90 tests passing
- 0 vulnerabilities in dependencies (519 packages audited)

## 0.4.3

### 🐛 Bug Fixes
- **Migration Tool**: Fixed over-aggressive npm install removal
  - Now only removes `npm install/ci` from legacy `cd tools/repolens` multi-line blocks
  - Preserves legitimate dependency installation steps in release workflows
  - Fixes YAML corruption that broke workflows with standalone npm ci/install steps
  - Added test case to verify legitimate npm install steps are preserved

## 0.4.2

### 🐛 Bug Fixes
- **Migration Tool**: Fixed duplicate `run:` keys issue when adding environment variables
  - Updated pattern to capture and preserve existing run command
  - Properly positions `env:` block before `run:` with correct indentation
  - Fixes GitHub Actions validation error: "'run' is already defined"
  - Added test case to prevent regression

## 0.4.1

### ✨ New Features

**Migration Command**:
- Added `repolens migrate` command to automatically upgrade workflow files from legacy formats to v0.4.0+
- Auto-detects legacy patterns: `cd tools/repolens`, missing `@latest` suffix, missing Node.js setup, missing environment variables
- Shows preview diff of changes before applying
- Creates backup files (*.backup) for safety
- Supports `--dry-run` flag to preview changes without applying
- Supports `--force` flag to skip interactive confirmation
- Handles multiple workflow files in `.github/workflows/`
- Comprehensive test coverage (7 test cases)

**Migration Detection**:
- Detects outdated `cd tools/repolens` directory changes
- Detects `npx repolens` without `@latest` suffix
- Detects missing `actions/setup-node@v4` setup
- Detects missing environment variables (NOTION_TOKEN, REPOLENS_AI_API_KEY)
- Migrates to `@chappibunny/repolens` scoped package
- Automatically adds AI environment variables to existing env sections
- Skips already-migrated workflows (no-op when up to date)

**Documentation**:
- Added comprehensive migration section to [MIGRATION.md](MIGRATION.md)
- Updated [README.md](README.md) with migration instructions
- Added migration examples to CLI help text
- Updated [RELEASE.md](RELEASE.md) with correct workflow format

### 🐛 Bug Fixes
- Fixed outdated workflow format in RELEASE.md that caused `cd: tools/repolens: No such file or directory` errors

### 📚 Documentation
- Prominently documented workflow migration in MIGRATION.md
- Added troubleshooting section for common migration issues
- Clarified v0.3.0 → v0.4.0 upgrade path
- Added step-by-step migration guide for existing users

---

## 0.4.0

### 💥 Breaking Changes
- **Major architectural transformation**: RepoLens is now an AI-assisted documentation intelligence system
- **New document types**: Added 6 new audience-aware documents (11 total, formerly 6)
- **Three-layer architecture**: deterministic extraction → structured artifacts → AI synthesis
- **Config schema changes**: New sections added: `features`, `ai`, `documentation`, `domains`
- **Default behavior unchanged**: AI features are opt-in via environment variables (deterministic mode by default)

### ✨ New Features - AI-Assisted Documentation

**Multi-Audience Documentation**:
- **Executive Summary**: Non-technical project overview for leadership (500 words)
- **Business Domains**: Functional area descriptions readable by all stakeholders (150 words per domain)
- **Architecture Overview**: Layered technical analysis for engineers (600 words)
- **Data Flows**: How information moves through the system (200 words per flow)
- **Developer Onboarding**: Getting started guide for new contributors (800 words)
- **Change Impact**: Architecture diff with natural language context

**AI Integration**:
- Provider-agnostic design works with any OpenAI-compatible API
- Supported providers: OpenAI (GPT-4, GPT-3.5), Anthropic Claude, Azure OpenAI, local models (Ollama)
- Configurable temperature, max tokens, timeout, and model selection
- Non-blocking AI calls with graceful timeout handling
- Zero hallucination policy: AI receives only structured JSON context, never raw code
- Strict prompts prevent fabrication and enforce word limits

**Intelligent Analysis**:
- **Domain Inference**: Automatically maps folders/files to business domains (Authentication, Market Data, Content, etc.)
- **Context Builder**: Extracts structured artifacts for AI synthesis (no raw code sent to AI)
- **Flow Inference**: Detects major data flows through heuristic pattern matching
- **Deterministic Fallback**: Always generates documentation even if AI unavailable or disabled

**Document Orchestration**:
- New document generation pipeline: scan → generateDocumentSet → writeDocumentSet → publish
- Artifacts saved as JSON in `.repolens/artifacts/` for inspection and debugging
- Backward compatible: Builds legacy renderedPages format for existing Notion integrations

### 🎨 Improvements

**Configuration**:
- New `features` section enables/disables specific documents
- New `ai` section controls AI behavior (enabled, mode, temperature, max_tokens)
- New `documentation` section configures output directory and artifacts
- New `domains` section defines custom business domain mappings
- Extended `SUPPORTED_PAGE_KEYS` with new document types
- All new sections optional for backward compatibility

**Environment Variables**:
- `REPOLENS_AI_ENABLED`: Enable/disable AI features (default: false)
- `REPOLENS_AI_API_KEY`: API key for AI provider
- `REPOLENS_AI_BASE_URL`: Custom provider endpoint (default: OpenAI)
- `REPOLENS_AI_MODEL`: Model to use (default: gpt-4-turbo-preview)
- `REPOLENS_AI_TEMPERATURE`: Creativity level 0.0-1.0 (default: 0.3)
- `REPOLENS_AI_MAX_TOKENS`: Token limit per request (default: 2000)
- `REPOLENS_AI_TIMEOUT_MS`: Request timeout (default: 30000ms)

**Documentation**:
- Created comprehensive AI.md guide (350+ lines)
- Added .env.example with all environment variables documented
- Added .repolens.example.yml with complete configuration examples
- Updated README.md with AI features onboarding
- Cost estimates provided for different repo sizes
- Provider setup guides for OpenAI, Anthropic, Azure, local models

**Cost Management**:
- Configurable token limits prevent runaway costs
- Selective document generation (enable only what you need)
- Usage tips in documentation for cost optimization
- Estimates: Small repos $0.10-$0.30, Medium $0.30-$0.80, Large $0.80-$2.00 per run

### 🔧 Technical Changes

**New Modules**:
- `src/analyzers/domain-inference.js` (155 lines): Business domain mapping from paths
- `src/analyzers/context-builder.js` (145 lines): Structured AI context assembly
- `src/analyzers/flow-inference.js` (185 lines): Data flow detection via heuristics
- `src/ai/provider.js` (130 lines): Provider-agnostic AI text generation
- `src/ai/prompts.js` (280 lines): Strict prompt templates preventing hallucination
- `src/ai/document-plan.js` (95 lines): Canonical document structure definition
- `src/ai/generate-sections.js` (240 lines): AI-powered section generation with fallbacks
- `src/docs/generate-doc-set.js` (95 lines): Document generation orchestration
- `src/docs/write-doc-set.js` (75 lines): Write documentation set to disk with artifacts

**Modified Modules**:
- `src/cli.js`: Updated publish flow to use new document generation pipeline
- `src/core/config-schema.js`: Extended validation for new config sections

**Testing**:
- All 32 existing tests passing
- No breaking changes to existing functionality
- Deterministic mode extensively tested

### 📦 Package Changes
- Total additions: 2116+ lines of production code
- New files: 10 (analyzers, AI layer, docs orchestration)
- Modified files: 4 (cli, config schema, documentation)
- Zero new runtime dependencies (uses existing node-fetch, fs, path)
- Optional AI features add no bundle weight when disabled

### 🎯 Philosophy Shift

RepoLens is no longer just a "flashy code intelligence toy" — it's now a **documentation intelligence system** that serves both engineers and stakeholders:

- **Engineers** get technical architecture docs with code-level detail
- **Product/Ops/Leadership** get readable system docs explaining what the code does
- **Deterministic by default** ensures reliability and zero cost baseline
- **AI-enhanced optionally** adds natural language explanations when needed
- **Zero hallucination** via structured context and strict prompts
- **Provider flexibility** prevents vendor lock-in

## 0.3.0

### 💥 Breaking Changes
- **Removed Mermaid diagram system**: Replaced complex SVG/mermaid.ink pipeline with simple Unicode architecture diagrams
- System map now renders as beautiful ASCII art using box-drawing characters
- No longer requires 50MB @mermaid-js/mermaid-cli dependency
- No longer generates or commits SVG files to repository
- Diagrams now always work reliably in Notion and Markdown without external dependencies

### ✨ New Features
- **Automatic update notifications**: CLI checks for new versions and notifies users
- **Version checking in doctor command**: `repolens doctor` now shows if updates are available
- **24-hour cache**: Update checks cached to avoid excessive npm registry calls
- **Non-blocking**: Update check runs in background, doesn't slow down commands

### 🎨 Improvements
- **Unicode Architecture Diagrams**: Clean, always-working diagrams with emoji icons (🎯, ⚙️, 📋, 🔌, 🛠️, ✅, 📦)
- **Simpler workflow**: Removed Mermaid CLI installation and SVG commit steps from GitHub Actions
- **Faster publishing**: No SVG generation or git operations needed
- **Better reliability**: No URL length limits, no image loading issues, no external service dependencies
- **Interactive credential collection**: `repolens init` now prompts for Notion credentials and auto-creates .env file
- **Smart CI detection**: Prompts skip in CI but work via npx

### 🔧 Technical Changes
- Added `src/utils/update-check.js` with version comparison logic
- Integrated update checking at CLI startup (non-blocking)
- Enhanced doctor command with forced version checking
- Simplified `renderSystemMap()` to return plain markdown with Unicode diagrams
- Removed `generateMermaidImageUrl()`, `prepareDiagramUrl()`, and mermaid.ink fallback logic
- Simplified `replacePageContent()` in notion.js - no longer handles image embedding
- Simplified markdown publisher - no longer generates SVG files
- Cleaned up GitHub Actions workflow - removed write permissions and diagram commits

### 📦 Package Changes
- Removed test artifacts from repository (cleaner npm package)
- Updated .gitignore to exclude test files
- Simplified workflow template to use `npx @chappibunny/repolens@latest`

## 0.2.0

- Added interactive credential collection to `repolens init`
- Improved documentation clarity for non-technical users
- Added emoji icons to all documentation pages
- Auto-detection of Notion secrets for seamless publishing
- Branch-aware publishing with title namespacing
- URL length validation for Notion image embeds
- Package.json metadata extraction for tech stack detection

## 0.1.1

- Initial RepoLens CLI
- Added `init` command
- Added `doctor` command
- Added `publish` command
- Added `version` and `help` commands
- Added Notion publisher
- Added Markdown publisher
- Added route map generation
- Added system map generation
- Added architecture diff generation
- Added PR comment publishing
- Added repo structure autodetection in `init`
- Added `.env.example` generation
- Added `README.repolens.md` generation
- Added test coverage for config, init, doctor, markdown publisher, and CLI