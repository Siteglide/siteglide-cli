const { spawnSync } = require('child_process');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '../..');

/**
 * Run a CLI entry script via `node` (cross-platform; avoids `./script.js` on Windows).
 *
 * @param {string} entry - Filename under repo root (e.g. `siteglide-cli.js`)
 * @param {string[]} [args]
 * @param {{ cwd?: string, env?: Record<string, string> }} [opts]
 */
const runCli = (entry, args = [], opts = {}) => {
	const scriptPath = path.join(REPO_ROOT, entry);
	const result = spawnSync(process.execPath, [scriptPath, ...args], {
		encoding: 'utf8',
		cwd: opts.cwd || REPO_ROOT,
		env: {
			...process.env,
			UPDATE_NOTIFIER_DISABLE: '1',
			...opts.env
		},
		windowsHide: true
	});

	const stdout = result.stdout || '';
	const stderr = result.stderr || '';

	return {
		code: result.status,
		stdout,
		stderr,
		output: stdout + stderr
	};
};

/**
 * Normalize CRLF fixtures/assertions to LF for cross-platform template tests.
 * @param {string} text
 */
const normalizeLineEndings = (text) => text.replace(/\r\n/g, '\n');

module.exports = {
	REPO_ROOT,
	runCli,
	normalizeLineEndings
};
