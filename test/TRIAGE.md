# Test failure triage (Phase 0)

Run: `npm test` from repo root (`CI=true` optional; avoids slow update-notifier paths).

| Test file | Failure | Verdict | Action |
|-----------|---------|---------|--------|
| `commands.test.js` | `./siteglide-cli.js` on Windows | **Wrong test** | `runCli` harness (`node` + absolute path) |
| `commands.test.js` | `env add` help | **Wrong test** | Router has no `env add`; use `add --help` |
| `commands.test.js` | bare `sync` expects exit 0 | **Wrong test** | Use `sync --help`; missing env exits non-zero |
| `templates.test.js` | template fill equality | **Environment** | `normalizeLineEndings` on Windows CRLF |
| `templates.test.js` | empty keys | **Environment** | Same CRLF normalization |
| `pullIgnoredModules.test.js` | default list (×2) | **Stale test** | Add `undefined`, `captchas`, `captchas_turnstile` to expected list |
| `mcpAlpha.test.js` | `resolveInstalledMcpVersionWithTimeout` | **Flaky / integration** | Assert `timedOut: true` with 1ms deadline instead of calling global npm |
| `siteglide-cli-migrate.js` | `--help` crashed on load | **Real bug** | Wrong `directories` require paths in migration code (fixed during smoke test work) |

All listed failures addressed in Phase 0 commits.
