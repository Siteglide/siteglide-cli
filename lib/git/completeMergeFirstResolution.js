/**
 * After mergeFirstDeploy/Pull returns: wait for conflict resolution, auto-commit, finalize baseline.
 */

const { hasOpenGitConflicts } = require('./workingTree');
const { waitForMergeResolution } = require('./waitForMergeResolution');
const { finalizePullBaseline } = require('./finalizePullBaseline');
const { tempPullLog, tempPullGitSnapshot } = require('./tempPullTrace');

/**
 * @param {object} opts
 * @param {string} opts.environment
 * @param {{ ok?: boolean, conflictExpected?: boolean }} opts.result
 * @param {'pull'|'deploy'|'sync'} opts.command
 * @param {string} opts.commitMessage
 * @param {string} [opts.warnMessage]
 * @param {string} [opts.cwd]
 * @param {string} [opts.logPrefix]
 * @param {() => boolean} [opts.shouldAbort]
 * @returns {Promise<{ ok: boolean, baseline?: object, error?: string, aborted?: boolean }>}
 */
async function completeMergeFirstResolution(opts) {
	const cwd = opts.cwd || process.cwd();
	const logPrefix = opts.logPrefix || `[${opts.command}]`;
	const { offerMergeConflictAiHelp } = require('../aiPrompts');

	const conflicts = hasOpenGitConflicts(cwd);
	tempPullLog('completeMergeFirstResolution:conflicts', {
		open: conflicts.open,
		reason: conflicts.reason || '',
		conflictExpected: Boolean(opts.result && opts.result.conflictExpected),
		environment: opts.environment
	});
	tempPullGitSnapshot(cwd, 'completeMergeFirstResolution_entry', {
		environment: opts.environment,
		tempBranch: opts.result && opts.result.tempBranch ? opts.result.tempBranch : ''
	});
	if (conflicts.open || opts.result.conflictExpected) {
		await offerMergeConflictAiHelp({
			environment: opts.environment,
			command: opts.command,
			warnMessage: opts.warnMessage,
			cwd
		});
		const waited = await waitForMergeResolution({
			cwd,
			commitMessage: opts.commitMessage,
			logPrefix,
			shouldAbort: opts.shouldAbort
		});
		if (!waited.ok) {
			return { ok: false, error: waited.error, aborted: waited.aborted };
		}
	}

	const baseline = finalizePullBaseline({
		environment: opts.environment,
		cwd
	});
	tempPullLog('completeMergeFirstResolution:baseline', {
		lastPullCommit: baseline.lastPullCommit ? baseline.lastPullCommit.slice(0, 12) : '',
		path: baseline.path || ''
	});
	return { ok: true, baseline };
}

module.exports = {
	completeMergeFirstResolution
};
