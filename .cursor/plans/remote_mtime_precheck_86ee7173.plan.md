---
name: Remote mtime precheck
overview: Remote mtime precheck, deploy/sync git guardrails, and Merge first — sync merges one remote file via GraphQL; deploy merges a full pull on a temp branch — CLI for workflow, AI/MCP for setup and conflict resolution.
todos:
  - id: baseline
    content: Add lib/pullBaseline.js (detailed comments) for lastPulledAt + lastDeploy replace/clear + effectiveBaseline + advancePullBaseline; gitignore .siteglide/
    status: completed
  - id: graphql-lib
    content: Add GraphQL queries + path mapper + file check + deploy since-pull drift queries (pre and post); detailed comments
    status: completed
  - id: conflict-log
    content: Add lib/remoteCheckConflictLog.js — per-env write/clear of .siteglide/remote-check/<env>.json; wire into warn/continue/pull/pass paths
    status: completed
  - id: bin
    content: Add siteglide-cli-remote-check.js bin (commented) and package.json registration
    status: completed
  - id: deploy-wire
    content: Pre-check approach A; production optional commit-first; on success path manifest + post-check; --skip-remote-check
    status: completed
  - id: sync-wire
    content: Per-file remote check; Merge first option; refuse sync/deploy on conflict markers; confirm mutex; skip env
    status: completed
  - id: merge-first
    content: Implement Merge first for sync (single-file GraphQL) and deploy (full pull on temp branch); mid-merge + WIP; safe re-check gates; AI handoff
    status: completed
  - id: git-lib-cli
    content: Add lib/git/* + siteglide-cli git helpers; pull clean-tree/stash + post-pull commit; stash-pop conflict log for AI; production deploy pre-commit prompt
    status: completed
  - id: mcp-status
    content: Add MCP remote_check_status + git_status / setup wizard + conflict-resolution guidance rules
    status: completed
  - id: tests
    content: Unit tests for baseline, remote check, conflict log, git readiness, merge-first safe-sync gate
    status: completed
  - id: test-zip
    content: After implementation, build dated dist zip; rewrite INSTALL for unpack-anywhere + global install; pull always rewrites mcp.json to global MCP launch paths
    status: completed
isProject: false
---

# Remote mtime check before sync/deploy

## Goal

Before overwriting remote files via `sync` or `deploy`, compare remote `updated_at` against a per-path effective baseline derived from:

1. **`lastPulledAt`** — full reconcile with remote (successful pull, and sometimes after a “clean” deploy — see below)
2. **`lastDeploy`** — optional path manifest from the most recent successful deploy (replaced each deploy; cleared on pull or when pull baseline is advanced)

When a conflict warning is shown, also write a **structured per-env JSON log** under `.siteglide/` so AI agents can decide next steps without parsing terminal scrollback (same idea as `sync_status` vs watching the terminal).

Land primarily in **siteglide-cli**, using existing `Gateway.graph()` → `POST /api/cli/graph`. Thin **read-only** MCP status tool in Siteglide-MCP---Experimental. No Siteglide-API changes.

## Architecture

```mermaid
flowchart TD
  pull[siteglide-cli pull] -->|success| state[".siteglide/pull/env.json"]
  pull -->|clears| lastDeploy[lastDeploy manifest]
  deploy[siteglide-cli deploy] --> preCheck["pre-check: since lastPulledAt minus prior lastDeploy"]
  preCheck --> graph[Gateway.graph]
  preCheck -->|conflict| promptPre{continue or abort?}
  promptPre -->|continue| archive[archive and push]
  archive -->|success| writeManifest[replace lastDeploy paths]
  writeManifest --> postCheck["post-check leftovers after pull before deploy"]
  postCheck -->|clean| advance["advance lastPulledAt; clear lastDeploy"]
  postCheck -->|dirty| offerPull["prompt optional pull"]
  watch[siteglide-cli-watch] -->|per file| effective[effectiveBaseline path]
  effective --> state
  watch --> graph
  preCheck -->|conflict| conflictLog[".siteglide/remote-check/env.json"]
  watch -->|conflict| conflictLog
  postCheck -->|dirty| conflictLog
  conflictLog -->|agent| mcpTool[MCP remote_check_status]
```

## AI-readable conflict log

Mirror the `sync_status` pattern: **do not force agents to parse terminal output**. On every conflict warning, write structured JSON; clear it when the situation is no longer blocking.

### Location

`.siteglide/remote-check/<environment>.json` — one overwrite file per env (latest state for that env).

### Schema (`schemaVersion: 1`)

```json
{
  "schemaVersion": 1,
  "environment": "staging",
  "status": "conflict",
  "command": "sync",
  "reason": "remote_newer",
  "detectedAt": "2026-08-11T15:30:00.000Z",
  "baseline": {
    "lastPulledAt": "2026-08-07T16:00:00.000Z",
    "lastDeployAt": "2026-08-11T14:00:00.000Z"
  },
  "conflicts": [
    {
      "path": "views/pages/home.liquid",
      "type": "page",
      "remoteUpdatedAt": "2026-08-11T15:00:00.000Z",
      "effectiveBaselineAt": "2026-08-07T16:00:00.000Z",
      "baselineSource": "pull"
    }
  ],
  "recommendedActions": [
    {
      "id": "merge_first",
      "priority": 1,
      "summary": "Merge remote file into local with conflict markers (git required), then ask AI to help resolve"
    },
    {
      "id": "commit_then_pull",
      "priority": 2,
      "summary": "Commit local work, then siteglide-cli pull <env>"
    },
    {
      "id": "pause_sync",
      "priority": 3,
      "summary": "Pause sync until remote changes are pulled"
    },
    {
      "id": "continue_overwrite",
      "priority": 4,
      "summary": "Continue only if overwriting remote is intentional"
    }
  ],
  "userDecision": null,
  "consoleHint": "Remote files are newer than the local pull baseline. Prefer Merge first (git) or pull after committing."
}
```

| Field | Notes |
| --- | --- |
| `status` | `conflict` while open; file **deleted** (or replaced with `status: "clear"` briefly — prefer **unlink**) when resolved |
| `command` | `sync` \| `deploy` \| `deploy_post` |
| `reason` | `missing_baseline` \| `remote_newer` \| `deploy_pre` \| `deploy_post_untracked` \| `merge_in_progress` \| `conflict_markers` |
| `conflicts[]` | Empty for `missing_baseline`; otherwise concrete paths (cap list e.g. first 50 + `conflictsTruncated: true` if needed) |
| `recommendedActions` | Stable `id`s agents can branch on — not prose-only. When git is initialized and reason is `remote_newer`, **`merge_first` is priority 1**. |
| `userDecision` | Set when known: `merge_first` \| `continue` \| `pause` \| `pull` \| `abort` \| `skip_flag`; then clear file on successful resolution path |
| Secrets | Never include tokens, emails, or `.siteglide-config` contents |

### Lifecycle

| Event | Log action |
| --- | --- |
| Conflict / missing baseline / deployPost dirty | **Write** (overwrite) that env’s file before/while prompting |
| User continues (`Y`) after acknowledging | Set `userDecision: continue`, then **unlink** (check already handled) |
| User pauses / aborts | Set `userDecision: pause` \| `abort`; **keep file** until pull succeeds or a later check passes (agent can still see why sync stopped) — **on next successful clean check or successful pull: unlink** |
| `--skip-remote-check` | Write once with `userDecision: skip_flag` then unlink after command proceeds, **or** skip write when intentionally skipping — prefer **write + unlink** so agents see skip was used if they race the file; simplest: **do not write** when skip flag set (no conflict surfaced) |
| Successful pull | **Unlink** that env’s conflict file |
| Clean deploy post-check (advance baseline) | **Unlink** |
| Sync/deploy check passes with no conflict | **Unlink** if a stale file exists |

Helper module: [`lib/remoteCheckConflictLog.js`](d:\git\siteglide-cli\lib\remoteCheckConflictLog.js) — `writeConflictLog`, `clearConflictLog`, with file-level + per-function comments.

Console still prints the human warning; one line may note the log path for humans/agents: `Conflict details: .siteglide/remote-check/<env>.json`.

### MCP (thin reader)

In Siteglide-MCP---Experimental (same pattern as `sync_status`):

- Tool `remote_check_status` — optional `environment`; reads `.siteglide/remote-check/*.json` (or one env); returns `{ activeConflict, environments: [...] }`
- Rule in `siteglide-core.md`: when sync/deploy may be blocked or the user mentions remote conflicts, call `remote_check_status` — **do not** infer from terminal scrollback alone

CLI remains source of truth for writes; MCP is read-only.
## State file

Mirror [`lib/syncStatus.js`](d:\git\siteglide-cli\lib\syncStatus.js) under `.siteglide/`.

- Path: `.siteglide/pull/<environment>.json`
- Shape:

```json
{
  "environment": "staging",
  "lastPulledAt": "2026-08-07T16:00:00.000Z",
  "lastDeploy": {
    "deployedAt": "2026-08-11T15:00:00.000Z",
    "paths": [
      "views/pages/home.liquid",
      "views/partials/header.liquid",
      "modules/core/public/graphql/foo.graphql"
    ]
  }
}
```

Helpers in [`lib/pullBaseline.js`](d:\git\siteglide-cli\lib\pullBaseline.js):

- `readPullBaseline` / `writePullBaseline` — pull success writes `lastPulledAt` and **clears `lastDeploy`**
- `replaceDeployManifest` — deploy success; **replace entire `lastDeploy`**, never merge
- `advancePullBaseline(env, at)` — set `lastPulledAt = at`, **clear `lastDeploy`** (used after a clean deploy)
- `effectiveBaseline(env, physicalPath)` — see below

Gitignore: `.siteglide/`.

### Concise deploy manifest

| Field | Purpose |
| --- | --- |
| `deployedAt` | ISO time when that deploy finished; floor only for listed paths |
| `paths` | Sorted unique unixified API `physical_file_path`s (no `app/` prefix; keep `modules/...`) |

Path set = same globs as [`siteglide-cli-archive.js`](d:\git\siteglide-cli\siteglide-cli-archive.js) (+ assets if `--with-assets`). Single-file sync does not update the manifest (v1).

### Per-path effective baseline (sync)

```text
effectiveBaseline(path):
  if lastDeploy exists
     and path is in lastDeploy.paths
     and deployedAt > lastPulledAt (or lastPulledAt missing)
    return deployedAt
  return lastPulledAt
```

## Deploy false positives — approach A + post-deploy clean/dirty

Tip-only “newest per type vs `lastPulledAt`” false-positives after your own deploy/sync, and tip+effectiveBaseline can **hide** older CMS edits under a newer tip you uploaded.

### Pre-deploy check (before archive)

For each supported type, query files with `updated_at > lastPulledAt` (page through results). Then **ignore** a hit if:

- its path is in the **previous** `lastDeploy.paths`, and
- remote `updated_at` is within a small grace window around previous `lastDeploy.deployedAt` (clock skew / push lag)

Anything left → conflict UX (continue / abort). Missing `lastPulledAt` → missing-baseline UX.

This catches remote drift since last pull without re-nagging files only bumped by the previous deploy.

### Post-deploy (after successful push)

1. Record `deployedAt = now` and `replaceDeployManifest` with paths actually packaged in **this** deploy.
2. Query leftovers: remotes with  
   `lastPulledAt < updated_at < deployedAt − grace`  
   (changed after last pull, but **not** refreshed by this deploy — typical remote-only / not-in-archive files).
3. **Clean** (no leftovers): `advancePullBaseline(deployedAt)` — auto-advance `lastPulledAt`, clear `lastDeploy`. Next checks are quiet until new remote edits.
4. **Dirty** (any leftovers): keep `lastPulledAt`; keep the new `lastDeploy` path manifest for sync floors on uploaded paths. Prompt (interactive):

   > After your latest deploy there are still a few files on the site which are not tracked locally, pull now to track them? (Y/n)

   - `Y` → run pull (spawn / invoke existing pull flow), which writes a fresh `lastPulledAt` and clears `lastDeploy`
   - `n` → leave state as-is (manifest helps sync for uploaded paths; leftover remotes still warn on sync if those paths are uploaded later)

Non-interactive / CI: do not auto-pull; leave dirty state after writing the manifest. Pre-check remains fail-closed unless `--skip-remote-check`.

**Grace period:** small constant (e.g. 60–120s) applied consistently for “within deploy window” and “older than this deploy” comparisons. Document in code comments.

## Sync check

Per file before push/delete: query that path’s remote `updated_at`, compare to `effectiveBaseline(path)`. Async + confirmation mutex; pause clears sync status and exits. `--skip-remote-check` / `SITEGLIDE_SKIP_REMOTE_CHECK=1`.

## GraphQL + bin

[`lib/remoteMtimeCheck.js`](d:\git\siteglide-cli\lib\remoteMtimeCheck.js) + [`lib/graphql/remoteMtimeQueries.js`](d:\git\siteglide-cli\lib\graphql\remoteMtimeQueries.js):

| Mode | Behavior |
| --- | --- |
| `file` | Exact path → compare to `effectiveBaseline` |
| `deployPre` | Since-`lastPulledAt` list, minus prior-deploy window ignores |
| `deployPost` | Leftover window `lastPulledAt < updated_at < deployedAt − grace` |

Types: pages, layouts, partials, assets, graphql, auth policies, forms, emails, model schemas (skip if GraphQL rejects). Unmapped local paths: skip check.

Bin [`siteglide-cli-remote-check.js`](d:\git\siteglide-cli\siteglide-cli-remote-check.js) for deploy subprocess / modes; sync uses lib in-process.

## Conflict UX (pre-check / sync / deploy)

### Sync — remote newer (git initialized)

1. Write conflict log with **`merge_first` as recommended option (priority 1)**.
2. Prompt roughly: Merge first / pause / continue overwrite (and mention full pull as alternative).
3. On **Merge first** → run [Merge first (sync)](#merge-first-sync) then **stop sync** (do not upload).
4. On pause/abort → stop; on continue → upload as today.

Missing baseline / no git: no Merge first (only continue / pause / suggest AI git setup or pull).

### Deploy — pre-check finds remote drift (git initialized)

When deploy pre-check (approach A) finds conflicts:

1. Conflict log with **`merge_first` priority 1** (`command: deploy`, `reason: deploy_pre`).
2. On **Merge first** → run [Merge first (deploy)](#merge-first-deploy) then **stop deploy** (do not archive/push).
3. On continue → proceed with deploy; on pause/abort → stop.

CI: fail closed unless `--skip-remote-check`.

### Hard refuse while conflicts open

If git is initialized and either:

- a merge is in progress (`git` unmerged paths), or
- working tree files contain conflict markers (`<<<<<<<` / `=======` / `>>>>>>>`),

then **sync and deploy must refuse** the operation. Message: ask AI agent + MCP to help resolve conflicts first; write/update conflict log (`reason: conflict_markers` or `merge_in_progress`).

### Merge first (sync)

Goal: put GraphQL remote contents into the file as **incoming** and keep local as **ours**, via a real git merge (easier for AI than inventing markers by hand). Prefer **merge** over rebase (beginner-friendly).

**Suggested adjustments vs the original sketch (adopted):**

- Compare **stored remote `updated_at` at fetch** for the “safe to sync again” gate (not wall-clock alone).
- Leave a **real mid-merge** + labeled WIP commit (do **not** soft-reset the WIP commit — that fights mid-merge state and is harder for AI). Soft-reset was considered; mid-merge wins for recoverable agent help.
- Soft loop risk on step 8 accepted for v1; debug if infinite re-merge appears.

**Algorithm (per conflicted file, or batch one file first in v1):**

1. Require git repo; refuse Merge first if conflict markers / merge already in progress.
2. Commit entire working tree as WIP: e.g. `siteglide: WIP before merge-first (<path>)` (skip if already clean).
3. Create temp branch from current HEAD: `siteglide-merge/<pid>-<timestamp>` (starts identical).
4. On temp branch: fetch file body via GraphQL; write to that path; commit `siteglide: remote copy for merge-first`.
5. Record per-file merge manifest entry (e.g. under `.siteglide/merge/<env>.json` or nested in pull baseline):  
   `{ path, remoteUpdatedAtAtFetch, fetchedAt, tempBranch }` — this is a **single-file** pull record, not a full site pull.
6. Checkout original branch; `git merge <tempBranch>` so **ours = local (WIP)**, **theirs = remote**. Expect conflicts.
7. CLI suggests using AI agent + MCP to resolve conflict markers; update conflict log (`userDecision: merge_first`, `recommendedActions: resolve_conflicts`).
8. **Stop** — do not sync upload; do not delete temp branch until merge completes (or document cleanup on success).
9. Later sync of that path: GraphQL current `updated_at`; if `updated_at <= remoteUpdatedAtAtFetch`, treat as **safe to sync** (remote not edited again since merge fetch) and allow upload once markers are gone / merge committed. If remote is newer again, re-enter Merge first (possible loop — monitor).
10. After successful sync of that path: clear that path’s merge-manifest entry; after merge commit completes, delete temp branch if still present.

Role split: CLI runs the mechanical merge-first steps; AI resolves markers and finishes the merge commit.

### Merge first (deploy)

Same skeleton as sync, but the temp branch receives a **full site pull** (existing pull pipeline on that branch), not a single GraphQL file.

1. Require git repo; refuse if markers / merge already in progress.
2. Commit entire working tree as WIP (skip if clean) so the temp-branch pull can satisfy clean-tree rules.
3. Create temp branch: `siteglide-merge-deploy/<pid>-<timestamp>`.
4. On temp branch: run **full pull** for the deploy target environment (default: normal pull including assets unless a later flag says otherwise).
5. Commit all pulled changes on the temp branch: `siteglide: remote full pull for merge-first deploy`.
6. Record merge manifest: `{ mode: "deploy_full_pull", remoteSnapshotAt, pulledAt, tempBranch, environment }`.
7. Checkout original branch; `git merge <tempBranch>` (entire tree). Expect conflicts on divergent paths.
8. Suggest AI + MCP to resolve; update conflict log; **stop deploy**.
9. On a later deploy attempt (markers gone, merge finished): write `lastPulledAt` from `remoteSnapshotAt` / `pulledAt` so pre-check does not immediately re-fire the same drift; if remote moved again since the snapshot, warn again.
10. Delete temp branch after the merge commit completes.

## Wiring points

| File | Change |
| --- | --- |
| [`lib/pullBaseline.js`](d:\git\siteglide-cli\lib\pullBaseline.js) | pull write, deploy replace, advance, effectiveBaseline |
| [`lib/remoteMtimeCheck.js`](d:\git\siteglide-cli\lib\remoteMtimeCheck.js) | file / deployPre / deployPost |
| [`lib/remoteCheckConflictLog.js`](d:\git\siteglide-cli\lib\remoteCheckConflictLog.js) | write/clear per-env conflict JSON |
| [`lib/deployManifestPaths.js`](d:\git\siteglide-cli\lib\deployManifestPaths.js) | collect archive (+ asset) paths |
| [`siteglide-cli-remote-check.js`](d:\git\siteglide-cli\siteglide-cli-remote-check.js) | CLI entry |
| [`siteglide-cli-pull.js`](d:\git\siteglide-cli\siteglide-cli-pull.js) | write `lastPulledAt`, clear `lastDeploy`, clear conflict log |
| [`siteglide-cli-deploy.js`](d:\git\siteglide-cli\siteglide-cli-deploy.js) | pre-check → Merge first (full pull) option → deploy → post-check |
| [`siteglide-cli-sync.js`](d:\git\siteglide-cli\siteglide-cli-sync.js) / [`siteglide-cli-watch.js`](d:\git\siteglide-cli\siteglide-cli-watch.js) | per-file check, Merge first, refuse on markers |
| [`lib/git/mergeFirst.js`](d:\git\siteglide-cli\lib\git\mergeFirst.js) | sync single-file GraphQL + deploy full-pull on temp branch |
| [`lib/git/conflictMarkers.js`](d:\git\siteglide-cli\lib\git\conflictMarkers.js) | detect unmerged / marker files; gate sync+deploy |
| Siteglide-MCP `register.js` + `remoteCheckStatus.js` + `siteglide-core.md` | status tools + resolve-conflict guidance |
| gitignore / package.json / tests | as above |

## Documentation / comments (required)

Cover especially:

- Why tip-only deploy checks false-positive after own deploy
- Why deployPre ignores prior-manifest paths inside the grace window
- Why deployPost leftovers decide advance vs optional pull
- Exact dirty prompt wording and why (“not tracked locally”)
- Why clean deploy advances `lastPulledAt` and clears `lastDeploy`
- Why sync uses `effectiveBaseline`; why sync does not update the manifest
- Why conflict log exists (agents vs terminal); write/clear lifecycle; stable `recommendedActions[].id`
- Why Merge first (sync) uses single-file GraphQL vs Merge first (deploy) uses full pull on the temp branch
- Why Merge first uses mid-merge + WIP commit (not soft-reset); sync safe-gate uses remoteUpdatedAtAtFetch; deploy advances pull baseline from snapshot after merge completes
- Why sync/deploy refuse while conflict markers / unmerged paths exist

## Performance note

Pre/post deploy may page GraphQL for files since last pull (usually small). Sync remains per-file async with a confirm mutex.

## Out of scope

- Siteglide-API endpoints
- Updating baseline/manifest on every successful single-file sync
- Three-way merge / content diffs
- Append-only conflict history (latest per env only)
- Forcing GitHub remote creation (remains optional wizard step)
- Auto `stash pop` without asking

## Git readiness (MCP) + CLI git guardrails

Related but separate from mtime checks: keep local git history aligned with pull/deploy, and help agents onboard projects that lack git.

### Role split (clarifying — how we hold the user’s hand)

Many Siteglide users are beginners or non-technical agencies. The product should walk them through good practice **without** requiring them to already know git.

| Actor | Owns | Does not own |
| --- | --- | --- |
| **CLI** | The **routine workflow** tied to pull/deploy/sync: soft tip if git missing; enforce clean tree (stash or cancel) before pull; optional post-pull commit; offer stash pop **after** that commit step; production optional commit-before-deploy; remote-mtime prompts including **Merge first**; refuse sync/deploy while conflict markers exist; write AI-readable logs | Teaching git from scratch; interactive conflict-resolution counselling; full repo/GitHub onboarding |
| **AI agent + MCP** | **Machine/project setup** and **conflict recovery**: detect git install / identity / `git init`; guided elicitation wizard (optional remote); read conflict/stash/merge logs; help resolve merge conflict markers and complete merges in plain language | Replacing CLI prompts for every pull/deploy; silent force-push or destructive git without user consent |

**Overlap:** CLI leaves structured breadcrumbs (conflict log, stash-pop log, quiet “ask your AI to set up git”); MCP/`git_status` (and related tools) let the agent pick up those breadcrumbs. Users experience one continuous “hand-holding” path: CLI for the happy-path cadence around pull/deploy, agent for setup and when something goes wrong.

### Shared readiness probe (`lib/git/readiness.js` + MCP)

Expose via MCP tool `git_status` (and reuse from CLI):

| Check | How | Ready when |
| --- | --- | --- |
| Git installed | `git --version` | exit 0 |
| Git identity | `git config user.name` + `user.email` (local or global) | both non-empty |
| Repo initialized | `git rev-parse --is-inside-work-tree` in project cwd | true |
| Remote present | `git remote -v` | optional for v1 — report only; never required |
| GitHub CLI auth | `gh auth status` | only if user opts into GitHub remote setup |

Return structured JSON (no secrets), e.g. `{ installed, identityConfigured, repoInitialized, remotes[], ghAuthenticated, missing[] }`.

### MCP wizard (Siteglide-MCP---Experimental)

When MCP is used on a Siteglide project folder (with `sync_status` / early project checks):

1. Call `git_status` on the project root.
2. If **installed**, **identity**, or **repoInitialized** is false:
   - Elicit whether they want guided git setup.
   - If yes, form-elicitation wizard:
     - Install guidance if git missing (OS-aware; do not use `npm` to install git)
     - Collect/confirm `user.name` + `user.email`, then set via `git config` after consent
     - `git init` if needed (confirm first)
     - **Optional:** create a GitHub repo or connect an existing remote (`gh` when authenticated; otherwise instruct + verify `git remote add`)
3. Remotes are always optional to configure; if already present, report them and leave connecting/changing remote as an optional step only.
4. Rules in `siteglide-core.md`: prefer `git_status` over shell guesswork; never read `.siteglide-config`; never force remote.

### CLI — before pull

In [`siteglide-cli-pull.js`](d:\git\siteglide-cli\siteglide-cli-pull.js):

1. **Not a git repo:** quiet Info only — suggest asking their AI/MCP to help set up git. Do **not** block pull.
2. **Git repo + dirty tree** (`git status --porcelain` non-empty):
   - Refuse pull until resolved.
   - Offer: **(i)** stash (prompt for message) → pull → post-pull commit prompt → **then** offer `stash pop`; **(ii)** cancel.
3. **Git repo + clean:** continue pull (then baseline write / conflict-log clear, etc.).

### CLI — after pull

If git repo and pull succeeded, in this order:

1. Ask whether to commit the pull (Y/n).
   - No → skip commit.
   - Yes → ask for message → commit via shared helper / subcommand (`siteglide-cli git commit` or `lib/git/commit.js`). Never stage `.siteglide-config`; honour `.gitignore`.
2. **If this pull used a stash:** only **after** step 1 (commit done or declined), offer `stash pop` (not automatic). Never pop before the post-pull commit prompt — that would mix stashed local work into the pull commit.

**Stash pop conflicts:** if the user accepts pop and `git stash pop` fails (conflicts with pull-introduced changes):

- Pull (and any post-pull commit) already succeeded — **do not** unwind them.
- Report clearly: pop failed; conflict markers may be in the working tree; the stash entry is **kept** (git does not drop on failed pop).
- Write an AI-readable log (same spirit as remote-check conflicts), e.g. `.siteglide/git/<env-or-project>.json` / `.siteglide/git/last-stash-conflict.json`, including `{ status: "stash_pop_conflict", stashRef, detectedAt, conflictedPaths[] if detectable, recommendedActions: ["resolve_conflicts", "retry_stash_pop", "stash_drop_when_done"] }`.
- Console: point humans/agents at that log path; suggest resolving conflicts, then retry pop or `git stash drop` when finished.
- MCP: expose via `git_status` (or small `git_stash_status`) so an agent can later retry pop and help resolve conflicts without scraping the terminal.

Never auto-resolve merge conflicts in v1.
### CLI — before deploy (production only)

Using [`lib/envClassification.js`](d:\git\siteglide-cli\lib\envClassification.js):

- If env is **production** and repo is git-initialized: ask to commit first; if yes, message + commit helper; if no, allow deploy.
- Staging / non-git: skip this prompt.

Order: **prod commit prompt → remote-mtime pre-check → archive/push**.

### CLI — CI / non-interactive

- Dirty tree → fail pull (no stash prompt).
- Skip post-pull commit and prod pre-deploy commit prompts.

### Git wiring

| File | Change |
| --- | --- |
| [`lib/git/readiness.js`](d:\git\siteglide-cli\lib\git\readiness.js) | probes |
| [`lib/git/workingTree.js`](d:\git\siteglide-cli\lib\git\workingTree.js) | dirty / stash / pop offer |
| [`lib/git/commit.js`](d:\git\siteglide-cli\lib\git\commit.js) | safe commit |
| git bin / pull / deploy | hooks |
| MCP `git_status` + wizard + rules | elicitation flow |
| tests | readiness + dirty-tree matrix |

### Git comments required

Why pull refuses dirty trees; why missing git is soft; why prod-only deploy commit prompt; why remote stays optional; why stash pop is offered only after the post-pull commit step (so the pull commit stays clean of stashed local work); why failed stash pop keeps the stash, leaves an AI log, and does not undo the pull.

## Delivery — colleague test zip (after implementation)

Build with existing script from `siteglide-cli`:

```bash
node scripts/build-test-share-zip.js
```

Output: `siteglide-cli-workspace-notes/dist/siteglide-cli-test-YYYY-MM-DD-HHMMSS.zip` (and refreshed `siteglide-cli-test-bundle/`).

### Install story (clarify for testers — previous confusion)

Document in generated `INSTALL.md` / `ASK-AI-TO-INSTALL.txt` as the **only** supported path:

1. **Unpack the zip anywhere** (Desktop, Downloads, etc.) — location does not matter after install.
2. From the unpacked bundle, **install the CLI globally** (`npm install` in `siteglide-mcp` and `siteglide-cli-test`, then `npm install -g .` from `siteglide-cli-test`).
3. Use **`siteglide-cli-test`** commands from any project directory thereafter — do not run forever from the unpacked folder.
4. Does **not** replace production `siteglide-cli` (test package name / bins).

Short headline at top of INSTALL: **Unpack anywhere → install globally → use `siteglide-cli-test` from your site folder.**

### mcp.json must target the globally installed MCP

Today [`lib/ai.js`](d:\git\siteglide-cli\lib\ai.js) writes MCP launch as `node` + absolute path to `siteglide-cli-mcp.js` **inside the CLI package that executed pull**.

**Required behaviour for this work / test builds:**

- Testers must pull with the **global** `siteglide-cli-test` so that absolute path resolves under the global npm install (not a leftover path into the unpacked zip folder).
- On every pull, `ensureMcpRegistered` **always rewrites** the Siteglide / siteglide-test server entry to that absolute global launcher (overwrite local hand-edits or stale unpack-path entries for that server id only).
- INSTALL must say: do not hand-edit `mcp.json`; always use global CLI for pull so registration stays correct.

### MCP package overwrite on reinstall

- Re-running the zip’s global install (or installing a newer test MCP/CLI globally) **replaces** the previously globally installed test MCP/CLI packages (`npm install -g` overwrite semantics).
- No side-by-side retention of an older global test MCP unless the user intentionally keeps a different package name.
- Document that updating the test build = unpack new zip → `npm install -g .` again (overwrites prior test global).

### AI install paste blob

Refresh the “Ask an AI to install” block so it leads with unpack-anywhere + global install, forbids installing as a one-off from a random path without `-g`, and ends with `siteglide-cli-test pull <env>` to register MCP.