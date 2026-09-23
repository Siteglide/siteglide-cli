/**
 * After mergeFirstDeploy/Pull returns: wait for conflict resolution, auto-commit, finalize baseline.
 */

const { hasOpenGitConflicts } = require('./workingTree');
const { waitForMergeResolution } = require('./waitForMergeResolution');
const { finalizePullBaseline } = require('./finalizePullBaseline');

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
	return { ok: true, baseline };
}

module.exports = {
	completeMergeFirstResolution
};
