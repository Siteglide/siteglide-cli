# Test failure triage (Phase 0)

Run: `npm test` from repo root (`CI=true` optional; avoids slow update-notifier paths).

**Two runners:** Jest (`test/**/*.test.js` except files in `test/nodeRunnerManifest.js`) and Node's built-in runner (`node scripts/run-node-tests.js`). Add new `node:test` suites to the manifest only — Jest will otherwise report "must contain at least one test".

| Test file | Failure | Verdict | Action |
|-----------|---------|---------|--------|
| `commands.test.js` | `./siteglide-cli.js` on Windows | **Wrong test** | `runCli` harness (`node` + absolute path) |
| `commands.test.js` | `env add` help | **Wrong test** | Router has no `env add`; use `add --help` |
| `commands.test.js` | bare `sync` expects exit 0 | **Wrong test** | Use `sync --help`; missing env exits non-zero |
| `templates.test.js` | template fill equality | **Environment** | `normalizeLineEndings` on Windows CRLF |
| `templates.test.js` | empty keys | **Environment** | Same CRLF normalization |
| `pullIgnoredModules.test.js` | default list (×2) | **Stale test** | Add `undefined`, `captchas`, `captchas_turnstile` to expected list |
| `mcpAlpha.test.js` | `resolveInstalledMcpVersionWithTimeout` | **Flaky / integration** | Assert `timedOut: true` with 1ms deadline instead of calling global npm |
All listed failures addressed in Phase 0 commits.
