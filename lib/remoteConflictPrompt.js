/**
 * Shared interactive prompts for remote-mtime conflicts (sync + deploy).
 */

const Confirm = require('./confirm');
const logger = require('./logger');
const { getGitReadiness } = require('./git/readiness');
const { writeConflictLog, clearConflictLog } = require('./remoteCheckConflictLog');
const { readPullBaseline } = require('./pullBaseline');

/**
 * @param {object} opts
 * @param {string} opts.environment
 * @param {'sync'|'deploy'|'deploy_post'} opts.command
 * @param {string} opts.reason
 * @param {object[]} [opts.conflicts]
 * @param {boolean} [opts.skipRemoteCheck]
 * @param {string} [opts.cwd]
 * @returns {Promise<'continue'|'pause'|'merge_first'|'abort'>}
 */
async function promptRemoteConflict(opts) {
	const cwd = opts.cwd || process.cwd();
	const git = getGitReadiness({ cwd });
	const baseline = readPullBaseline(opts.environment, cwd);

	const logPath = writeConflictLog(opts.environment, {
		command: opts.command,
		reason: opts.reason,
		conflicts: opts.conflicts || [],
		baseline: {
			lastPulledAt: baseline && baseline.lastPulledAt,
			lastDeployAt: baseline && baseline.lastDeploy && baseline.lastDeploy.deployedAt
		},
		gitInitialized: git.repoInitialized,
		consoleHint: opts.reason === 'missing_baseline'
			? 'No last-pull timestamp for this environment. Continue may overwrite remote work.'
			: 'Remote files are newer than the local pull baseline.'
	}, cwd);

	logger.Warn(`Conflict details written for AI agents: ${logPath}`, { exit: false });

	if (opts.skipRemoteCheck) {
		clearConflictLog(opts.environment, cwd);
		return 'continue';
	}

	const interactive = process.stdin.isTTY && !process.env.CI;
	if (!interactive) {
		logger.Error(
			'Remote conflict detected and no TTY / CI mode — refusing. Use --skip-remote-check only if intentional.'
		);
		return 'abort';
	}

	if (opts.reason === 'missing_baseline') {
		logger.Warn(
			'No last-pull record for this environment. Sync/deploy may overwrite remote CMS edits.',
			{ exit: false }
		);
	} else {
		const sample = (opts.conflicts || []).slice(0, 5);
		for (const c of sample) {
			logger.Warn(
				`  ${c.path || c.physicalPath} remote=${c.remoteUpdatedAt}${c.effectiveBaselineAt ? ` baseline=${c.effectiveBaselineAt}` : ''}`,
				{ exit: false }
			);
		}
		if ((opts.conflicts || []).length > 5) {
			logger.Warn(`  …and ${(opts.conflicts || []).length - 5} more (see conflict log)`, { exit: false });
		}
	}

	let question =
		'Continue and overwrite remote? (Y=continue / N=pause). Prefer committing then: siteglide-cli pull <env>\n';
	if (git.repoInitialized && (opts.command === 'sync' || opts.command === 'deploy')) {
		question =
			'Choose: M=Merge first (recommended with git) / Y=continue overwrite / N=pause. Prefer Merge first or pull after commit.\n';
	}

	const answer = (await Confirm(question)).trim();
	if (git.repoInitialized && /^m$/i.test(answer)) {
		return 'merge_first';
	}
	if (answer === 'Y') {
		clearConflictLog(opts.environment, cwd);
		return 'continue';
	}
	return 'pause';
}

module.exports = {
	promptRemoteConflict
};
