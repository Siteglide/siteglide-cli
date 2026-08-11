/**
 * Safe git commit helper for pull/deploy prompts.
 * Never stages .siteglide-config (secrets).
 */

const { run } = require('./readiness');

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
 * @param {string} [cwd]
 * @returns {boolean}
 */
function hasStagedOrUnstagedChanges(cwd = process.cwd()) {
	const res = run('git', ['status', '--porcelain'], { cwd });
	return res.ok && res.stdout.length > 0;
}

module.exports = {
	commitAllSafe,
	hasStagedOrUnstagedChanges
};
