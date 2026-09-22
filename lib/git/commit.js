/**
 * Safe git commit helper for pull/deploy prompts.
 * Never stages .siteglide-config (secrets).
 */

const { run } = require('./readiness');
const { runWithRetry } = require('./runWithRetry');

/**
 * Stage project changes (respecting .gitignore) and commit.
 * @param {string} message
 * @param {{ cwd?: string }} [opts]
 * @returns {{ ok: boolean, stdout: string, stderr: string }}
 */
function commitAllSafe(message, opts = {}) {
	const cwd = opts.cwd || process.cwd();
	const add = run('git', ['add', '-A'], { cwd });
	if (!add.ok) {
		return add;
	}
	run('git', ['reset', 'HEAD', '--', '.siteglide-config'], { cwd });
	return run('git', ['commit', '-m', message], { cwd });
}

/**
 * Like commitAllSafe but retries when git index.lock is busy.
 * @param {string} message
 * @param {{ cwd?: string, maxWaitMs?: number, pollIntervalMs?: number }} [opts]
 * @returns {Promise<{ ok: boolean, stdout: string, stderr: string, timedOut?: boolean, lockBusy?: boolean }>}
 */
async function commitAllSafeAsync(message, opts = {}) {
	const cwd = opts.cwd || process.cwd();
	const retryOpts = {
		cwd,
		maxWaitMs: opts.maxWaitMs,
		pollIntervalMs: opts.pollIntervalMs
	};
	const add = await runWithRetry('git', ['add', '-A'], retryOpts);
	if (!add.ok) {
		return add;
	}
	await runWithRetry('git', ['reset', 'HEAD', '--', '.siteglide-config'], retryOpts);
	return runWithRetry('git', ['commit', '-m', message], retryOpts);
}

/**
 * @param {string} [cwd]
 * @returns {boolean}
 */
function hasStagedOrUnstagedChanges(cwd = process.cwd()) {
	const res = run('git', ['status', '--porcelain'], { cwd });
	return res.ok && res.stdout.length > 0;
}

module.exports = {
	commitAllSafe,
	commitAllSafeAsync,
	hasStagedOrUnstagedChanges
};
