# Siteglide CLI

Siteglide CLI is a tool that enables you to work on your project from your local editor and has similar behaviours to that of using FTP, in that you can sync up and pull down changes from your website. You will be required to use some terminal commands to use this feature.

Run the regression test suite from the repo root with `npm test` (Jest; see `jest.config.js`). Optional live API tests against a local project: `npm run test:integration` (see `test/INTEGRATION.md`).

For features and setup instructions, see our help documentation [here](https://docs.siteglide.com/articles/1541403-introduction-to-the-command-line-interface-cli)

**Verbose CLI output:** pass `-debug` on any command (for example `siteglide-cli pull staging -debug`) for the same effect as `DEBUG=1` for that run — grey progress lines and diagnostic output. Without `-debug`, only errors, warnings, outcomes, and setup messages are shown by default.

Our changelog can be found [here](https://docs.siteglide.com/articles/4471977-cli-changelog)

[![NPM version](https://img.shields.io/npm/v/@siteglide/siteglide-cli)](https://npmjs.org/package/@siteglide/siteglide-cli) [![NPM downloads](https://img.shields.io/npm/dt/@siteglide/siteglide-cli)](https://npmjs.org/package/@siteglide/siteglide-cli)
