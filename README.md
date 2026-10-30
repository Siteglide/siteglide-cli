# Siteglide CLI

Siteglide CLI is a tool that enables you to work on your project from your local editor and has similar behaviours to that of using FTP, in that you can sync up and pull down changes from your website. You will be required to use some terminal commands to use this feature.

Run the regression test suite from the repo root with `npm test` (Jest; see `jest.config.js`). Optional live API tests against a local project: `npm run test:integration` (see `test/INTEGRATION.md`).

For features and setup instructions, see our help documentation [here](https://docs.siteglide.com/articles/1541403-introduction-to-the-command-line-interface-cli)

**Verbose CLI output:** pass `-debug` on any command (for example `siteglide-cli pull staging -debug`) for the same effect as `DEBUG=1` for that run — grey progress lines and diagnostic output. Without `-debug`, only errors, warnings, outcomes, and setup messages are shown by default.

Our changelog can be found [here](https://docs.siteglide.com/articles/4471977-cli-changelog)

[![NPM version](https://img.shields.io/npm/v/@siteglide/siteglide-cli)](https://npmjs.org/package/@siteglide/siteglide-cli) [![NPM downloads](https://img.shields.io/npm/dt/@siteglide/siteglide-cli)](https://npmjs.org/package/@siteglide/siteglide-cli)

## Developer notes

### Merge first: temp branch vs. git worktree (revisit if needed)

Merge first (`lib/git/mergeFirst.js`, used by pull, deploy and sync) checks a temporary branch out **in place**, in the user's own folder. That is why every uncommitted change is committed first: checkout moves the files, the pull overwrites them, and the orphan path's `git clean -fd` removes anything untracked. The commit-everything step is required for correctness, not just tidiness, in both the normal and the experimental `-fast` mode.

An alternative we have considered but not built is a `git worktree`: a second working directory sharing the same repository. The pull and remote snapshot commit would happen there, the user's folder would be untouched until the final `git merge`, and the user could never be stranded on a temp branch in their own folder. It would also make a single-file commit in `-fast` mode feasible (scope the snapshot to the pulled paths; refuse fast mode on the orphan strategy). Costs: a directory under `tmp/` that must be removed after a crash, repointing the nested pull and config lookup at it, and a leftover worktree being a confusing thing for a user to find.

If complaints about the current flow (forced commits, temp-branch rescue) prove hard to solve, compare the two properly before changing the mechanics.
