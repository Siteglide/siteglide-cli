/**
 * After a successful pull, update `.siteglide/user/pull/<env>.json` baseline.
 */

const logger = require('./logger');
const { writePullBaseline } = require('./pullBaseline');
const { getGitReadiness, run: runGit } = require('./git/readiness');
const { commitAllSafe, hasStagedOrUnstagedChanges } = require('./git/commit');

/**
 * @param {{ environment: string, moduleFilter?: string | null, skipRemoteCheck?: boolean, cwd?: string }} opts
 */
function recordPullBaselineAfterPull(opts) {
	const environment = opts.environment;
	const cwd = opts.cwd || process.cwd();
	const skipCommitBaseline = process.env.SITEGLIDE_PULL_SKIP_COMMIT_BASELINE === '1';
	const isPartialModulePull = Boolean(opts.moduleFilter);
	const skipRemoteCheck = Boolean(opts.skipRemoteCheck);

	if (skipCommitBaseline || isPartialModulePull || skipRemoteCheck) {
		writePullBaseline(environment, { cwd });
		return;
	}

	const gitReady = getGitReadiness({ cwd });
	if (!gitReady.repoInitialized) {
		writePullBaseline(environment, { cwd });
		return;
	}

	if (hasStagedOrUnstagedChanges(cwd)) {
		const shortDate = new Date().toISOString().slice(0, 10);
		const defaultMsg = `Snapshot after pulling from ${environment} environment ${shortDate}`;
		const committed = commitAllSafe(defaultMsg, { cwd });
		if (!committed.ok && !/nothing to commit/i.test(`${committed.stdout} ${committed.stderr}`)) {
			logger.Warn(`[pull] Could not auto-commit pull snapshot: ${committed.stderr || committed.stdout}`, { exit: false });
			writePullBaseline(environment, { cwd });
			return;
		}
		logger.Info('[pull] Auto-committed pull snapshot for merge-first baseline');
	} else {
		logger.Success('[pull] Working tree is clean — files on the site exactly matched your local files. Nothing to commit.');
	}

	const head = runGit('git', ['rev-parse', 'HEAD'], { cwd });
	if (head.ok && head.stdout) {
		writePullBaseline(environment, { lastPullCommit: head.stdout, cwd });
	} else {
		writePullBaseline(environment, { cwd });
	}
}

module.exports = {
	recordPullBaselineAfterPull
};
