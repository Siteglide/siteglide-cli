# Integration tests (Phase 0.5)

Optional network tests that run CLI commands against a **real Siteglide project** on your machine. Default `npm test` does not run these.

## Setup (Option B — local.json)

1. Copy the example file:

   ```bash
   cp test/integration/local.json.example test/integration/local.json
   ```

   On Windows (PowerShell):

   ```powershell
   Copy-Item test/integration/local.json.example test/integration/local.json
   ```

2. Edit `test/integration/local.json`:

   ```json
   {
     "project": "D:/git/testing_sites/mj-2026",
     "env": "staging",
     "configFile": ".siteglide-config",
     "pullModule": "core"
   }
   ```

   Optional `pullModule` limits `pull -m` to one module (faster). Omit to pull all non-ignored modules.

3. Use a **dedicated test site** — mutating tests run deploy and pull against this project.

4. Ensure the project has an environment from `siteglide-cli add` (creates `.siteglide-config` with `url`, `email`, `token`).

`test/integration/local.json` is gitignored — never commit it.

## Run

```bash
npm run test:integration
```

## Environment variable overrides

Env vars override `local.json` (useful for CI):

| Variable | Purpose |
|----------|---------|
| `SITEGLIDE_TEST_PROJECT` | Absolute path to project root |
| `SITEGLIDE_TEST_ENV` | Config key (default: `staging`) |
| `SITEGLIDE_TEST_CONFIG` | Config file path relative to project, or absolute |
| `SITEGLIDE_TEST_PULL_MODULE` | Module name for `pull -m` (optional) |

Example (PowerShell):

```powershell
$env:SITEGLIDE_TEST_PROJECT = "D:\git\testing_sites\mj-2026"
npm run test:integration
```

## What runs

### Read-only (`test/integration/project.test.js`)

| Test | Network |
|------|---------|
| `list` / `list --details` | No — reads `.siteglide-config` only |
| `Gateway.ping` | Yes — auth + API |
| `modules <env>` | Yes — read-only module list |

### Mutating (`test/integration/mutating.test.js`) — dedicated test site only

| Test | What it does |
|------|----------------|
| `Gateway.sync` | Uploads `_siteglide_cli_integration.liquid`, then deletes it remotely |
| `deploy <env>` | Full codebase deploy (confirms with `Y`, no `--with-assets`) |
| `pull <env> -i` | Pull site + modules; skips asset download; optional `-m` from `pullModule` |

Mutating tests can take several minutes (5-minute Jest timeout per test).

If project/config is not configured, the suite **skips** with a message (exit 0).

## Security

Tests assert that CLI output does **not** contain the API token. Do not commit `.siteglide-config` or `local.json`.
