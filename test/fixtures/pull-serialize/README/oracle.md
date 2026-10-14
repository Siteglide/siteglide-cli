# Pull format oracle

Golden on-disk files live under `test/fixtures/pull-serialize/` (copied from `mj-autumn-2026` where noted).

- Run `node scripts/pull-format-oracle.mjs` for the path checklist.
- On a live env, use `siteglide-cli sync <env> -compare` when merge-first triggers for a **single** conflict path; reports land in `.siteglide/user/selective-pull-compare/`.
- Unit tests: `serializeRemoteFile.test.js` uses partial `404.liquid` golden bytes.
