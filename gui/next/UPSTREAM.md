# gui/next upstream

Vendored from `pos-cli` commit `b6c2948` (release 6.3.0).

Siteglide deltas vs upstream:

- Logs v1 poll interval: 7500ms (match `siteglide-cli logs`)
- Removed Logs v2 / Network routes and homepage tiles (discontinued upstream offering)
- Homepage and header include Database and Users; those views show a Siteglide Admin compatibility caution banner
- Branding: Siteglide titles, docs, portal, npm update check (`@siteglide/siteglide-cli`)

Smoke (global test install):

- Logs: pass
- Constants: pass
