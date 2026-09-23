/**
 * Write pull baseline from current HEAD after a successful pull / merge-first reconcile.
 */

const { run } = require('./readiness');
const { writePullBaseline } = require('../pullBaseline');
const { clearMergeManifest } = require('./mergeFirst');
const { clearConflictLog } = require('../remoteCheckConflictLog');
const { pullBaselinePath } = require('../pullBaseline');

/**
 * @param {{ environment: string, cwd?: string }} opts
 * @returns {{ lastPullCommit: string, lastPulledAt: string, path: string }}
 */
function finalizePullBaseline(opts) {
	const cwd = opts.cwd || process.cwd();
	const environment = opts.environment;
	const head = run('git', ['rev-parse', 'HEAD'], { cwd });
	if (!head.ok || !head.stdout) {
		throw new Error('Could not read HEAD for pull baseline');
	}
	const logDate = run('git', ['log', '-1', '--format=%cI', 'HEAD'], { cwd });
	const lastPulledAt = logDate.ok && logDate.stdout
		? logDate.stdout
		: new Date().toISOString();
	writePullBaseline(environment, {
		lastPulledAt,
		lastPullCommit: head.stdout,
		cwd
	});
	clearMergeManifest(environment, cwd);
	clearConflictLog(environment, cwd);
	return {
		lastPullCommit: head.stdout,
		lastPulledAt,
		path: pullBaselinePath(environment, cwd)
	};
}

module.exports = {
	finalizePullBaseline
};
