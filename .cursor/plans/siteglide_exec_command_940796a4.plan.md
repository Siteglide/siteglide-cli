---
name: siteglide MCP desktop
overview: Scaffold Siteglide-MCP---Experimental (compose platformOS validate_code + Siteglide rules/ops + marketplace_builder path bridge) and wire siteglide-cli ai init + thin mcp/supervisor launchers. Stdio first; HTTP/SSE/Docker deferred. CLI exec intentionally not shipped (ops live in MCP only).
todos:
  - id: lib-exec
    content: "CANCELLED: siteglide-cli exec — ops live in MCP graphql_exec/liquid_exec instead"
    status: cancelled
  - id: cli-exec
    content: "CANCELLED: siteglide-cli exec bins"
    status: cancelled
  - id: mcp-repo
    content: Scaffold Siteglide-MCP---Experimental (compose upstream supervisor + Siteglide rules + ops tools; stdio entrypoints)
    status: completed
  - id: layout-bridge
    content: "CANCELLED: MCP path bridge — replaced by pull migrate marketplace_builder → app (platformOS advice)"
    status: cancelled
  - id: pull-app-migrate
    content: On pull, git mv or rename marketplace_builder → app; pull site/assets into app/
    status: completed
  - id: cli-ai-wrappers
    content: "CANCELLED: ai init / dual supervisor — replaced by single mcp + pull-time IDE registration"
    status: cancelled
  - id: pull-mcp-register
    content: On pull, merge-safe register siteglide MCP for cursor/claude/copilot/windsurf if missing
    status: completed
  - id: rebase-pull-modules
    content: Rebase onto Pull-should-pull-all-modules'-public-files-
    status: completed
  - id: deps-tests
    content: Wire package deps; smoke tests; update explain_to_my_boss; document Docker/HTTP as phase-later
    status: completed
  - id: http-docker-later
    content: "DEFERRED: HTTP/SSE + Docker for browser agents"
    status: cancelled
isProject: false
---

# Siteglide-MCP desktop + CLI wrappers

## MCP home (locked)

All Siteglide MCP implementation lives in [`d:\git\Siteglide-MCP---Experimental`](d:\git\Siteglide-MCP---Experimental) — not inside the CLI package tree.

| Keep in `siteglide-cli` | Put in `Siteglide-MCP---Experimental` |
| --- | --- |
| `ai init` (writes config pointing at MCP bins) | Composed supervisor (`validate_code` + Siteglide rules) |
| Thin wrapper bins that call / spawn the MCP package | Operational MCP tools (`envs_list`, `graphql_exec`, `liquid_exec`, `logs_fetch`) |
| | Modular `rules/` / `guides/` data |
| | **Layout bridge** (`marketplace_builder` ↔ `app` temp overlay) |
| | Future HTTP/SSE + Docker image |

**Not in scope:** CLI `exec graphql|liquid` — agents use MCP ops tools; humans can use existing GUI evaluators.
**Why separate:** independent versioning, npm-bump of `@platformos/platformos-mcp-supervisor` without a CLI release, reusable by web agents / Docker without installing the whole CLI, cleaner boundary for Siteglide rules.

**How CLI consumes it:** `siteglide-cli` depends on or invokes this repo’s published package / bins; `siteglide-cli mcp` / `supervisor` are thin launchers; `ai init` registers those commands.

## Docker / browser later

**Yes**, if transports stay swappable.

- **v1:** stdio — Cursor / Claude Code / local agents
- **Later:** HTTP + SSE (or streamable HTTP); browser → Siteglide agent BFF → Docker MCP (no secrets in the browser)

```mermaid
flowchart LR
  browser["Browser AI UI"] --> bff["Siteglide agent backend"]
  bff --> httpMcp["Docker MCP HTTP/SSE"]
  httpMcp --> tools["Same tool registry"]
  tools --> upstream["@platformos/platformos-mcp-supervisor"]
  tools --> rules["Siteglide rules"]
  tools --> bridge["layout bridge overlay"]
  tools --> api["Siteglide-API / Gateway"]
```

**Not in v1:** shipping HTTP/Docker — only design so tool registration is transport-agnostic.

## Scope

1. **`Siteglide-MCP---Experimental`** — compose upstream check engine + Siteglide rules + ops tools + layout bridge
2. **`siteglide-cli ai init`** — register MCP bins
3. **Thin CLI wrappers** for `mcp` / `supervisor`

No Siteglide-API changes. Do not fork `platformos-tools`. No CLI `exec` command.

## Two supervisors (use the new one)

| Version | Use? |
| --- | --- |
| Legacy `pos-supervisor` | No |
| `@platformos/platformos-mcp-supervisor` (platformos-tools) | **Yes** |

## Compose, do not fork (update-friendly)

Upstream embedding API:

- `startServer({ projectDir })` → `{ server, context, shutdown }`
- `registerValidateCode(server, context)`
- `ValidateCodeResult` types

In `Siteglide-MCP---Experimental`:

1. Detect layout; if needed, create **temp overlay bridge** → `bridgedProjectDir`
2. `startServer` / lint against bridged dir (rewrite `file_path` for agents using `marketplace_builder/...`)
3. `registerSiteglideTools(server, …)` on the **same** `McpServer`
4. Ops tools (sibling stdio entry or same process)
5. Bump `@platformos/platformos-mcp-supervisor` for pOS updates — Siteglide rules/bridge unchanged unless public API breaks

```mermaid
flowchart TB
  cliAi["siteglide-cli ai init"]
  cliAi --> bins["siteglide-cli-mcp / siteglide-cli-supervisor"]
  bins --> pkg["Siteglide-MCP---Experimental"]
  pkg --> bridge["layout bridge if needed"]
  bridge --> start["startServer upstream"]
  pkg --> sg["registerSiteglideTools"]
  pkg --> ops["ops tools Gateway"]
  npmBump["npm bump platformos-mcp-supervisor"] -.-> start
```

### Layout (in MCP repo)

```
Siteglide-MCP---Experimental/
  src/supervisor/compose.js    # bridge + startServer + registerSiteglideTools
  src/layout/
    detect.js                  # app | marketplace_builder | null
    bridge.js                  # create/destroy temp overlay
    rewritePath.js             # path rewrite for validate_code
  src/siteglide/register.js
  src/siteglide/rules/
  src/siteglide/guides/
  src/ops/                     # envs-list, graphql-exec, liquid-exec, logs-fetch
  src/stdio.js                 # stdio transport bootstrap
  src/http.js                  # deferred — same registerTools for later Docker
```

## Path bridge (locked interim)

platformOS **already** classifies `marketplace_builder/` files (`getFileType` / `isKnownLiquidFile` in platformos-common). Gaps remain: `getAppPaths` / `DocumentsLocator` search **`app/` only**; some checks hardcode `app/...`. Native LSP support was asked of platformOS; until that ships, Siteglide uses an interim bridge.

**Do not** create `app` → `marketplace_builder` inside the customer project (git noise, deploy confusion).

**Do** build a **session temp overlay** before lint:

```
<tmpdir>/siteglide-mcp-bridge-XXXX/
  app/          → junction/symlink to <project>/marketplace_builder
  modules/      → junction/symlink to <project>/modules   (if present)
  .platformos-check.yml  (copy from project if present, else minimal stub)
```

```mermaid
flowchart LR
  agent["Agent validate_code"] --> wrap["Siteglide wrapper"]
  wrap --> rewrite["Rewrite file_path prefixes"]
  wrap --> overlay["Temp overlay projectDir"]
  overlay --> appLink["app junction"]
  appLink --> mb["project/marketplace_builder"]
  overlay --> upstream["upstream runLint / validate_code"]
```

### When to activate

| Project state | Bridge? |
| --- | --- |
| Only `marketplace_builder/` (no real `app/`) | **Yes** |
| Real `app/` exists | **No** |
| Both exist | **No** — prefer real `app/`; log once |
| Only `modules/` | **No** |

Detect real `app/` with `fs.lstat` (don’t nest or delete foreign symlinks/junctions).

### Cross-platform links

| OS | Directory link type | Notes |
| --- | --- | --- |
| Windows | `'junction'` | No admin / Developer Mode for directory junctions |
| macOS / Linux | `'dir'` (or default) | Standard symlink |

Normalize paths to `/` for MCP/agent strings; `path.resolve` absolute targets before linking.

Lifecycle: create once at MCP start → reuse for all `validate_code` → destroy on `shutdown()` / process exit.

### file_path rewrite

When bridge active: map `marketplace_builder/...` (relative or absolute under project) → overlay `app/...`; accept `app/...` relative to overlay. **v1:** diagnostics may still say `app/...` (alias documented via skills); optional reverse-map later.

### validate_code wiring

Prefer public lint API from the supervisor package (`runLint` / equivalent) behind `runValidateCodeWithBridge`. If only `startServer` is exported, use documented lower-level registration; avoid monkey-patching. Fallback to check-node only if supervisor exports are insufficient.

### Bridge tests

- detect: only-mb → bridge; only-app → no; both → no
- rewritePath: relative + absolute (win32/posix fixtures)
- overlay create/destroy + readable `app/...` through junction
- smoke: lint fixture under `marketplace_builder` via bridged `validate_code`

### Bridge out of scope

- Patching `platformos-tools` in our tree
- Persistent in-repo `app` symlinks
- Keeping the bridge forever after upstream native support (remove when they ship and we bump)

## Decisions (locked)

### MCP (`Siteglide-MCP---Experimental`)
- Compose upstream check engine + Siteglide rules
- Ops MVP: `envs_list`, `graphql_exec`, `liquid_exec`, `logs_fetch`
- **Layout bridge:** temp overlay when only `marketplace_builder/` (cross-platform junctions/symlinks)
- **v1 transport: stdio only**; transport-agnostic registration for HTTP/Docker later
- Auth for ops: `.siteglide-config` / `MPKIT_*` / explicit params (HTTP auth later)
- Upstream `validate_code` needs **no** Siteglide auth; ops tools do

### ai init (CLI)
- Registers `siteglide-cli-mcp` + `siteglide-cli-supervisor` (wrappers → MCP repo)

### Skills vs MCP
- Skills = guidance (temporary `Siteglide-AI-Skills`; later modules/CLI install)
- MCP = callable tools; they coexist
- Rules/skills cannot alone fix `app/` search paths — bridge handles that until pOS does

### Not shipping
- CLI `exec graphql|liquid` (undone; MCP ops cover agent GraphQL/Liquid)

## Phases

### 1 — scaffold `Siteglide-MCP---Experimental`
Compose supervisor + layout bridge + Siteglide guide/rules tool + ops MVP + stdio entries

### 2 — wire CLI
Depend on / invoke MCP package; `ai init`; thin `mcp` / `supervisor` bins

### 3 — (later)
HTTP/SSE, Dockerfile, web agent BFF auth; drop bridge when upstream marketplace_builder support is enough

## Out of scope (this pass)

- CLI `exec` command
- Implementing Docker/HTTP hosting now
- Forking platformos-mcp-supervisor
- Legacy pos-supervisor / `load_development_guide`
- Full pos-cli mcp-min parity
- Patching upstream pos-cli / platformos-tools
- Persistent customer-repo `app` symlinks

## Usage (target)

```bash
siteglide-cli pull staging
siteglide-cli mcp
# Later: docker run … siteglide-mcp --transport http --port 5910
```
