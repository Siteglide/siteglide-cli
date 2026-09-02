const { execFileSync } = require('child_process');

const npmCommand = () => (process.platform === 'win32' ? 'npm.cmd' : 'npm');

/**
 * Run npm synchronously. On Windows, npm is a .cmd shim and requires shell: true
 * for execFileSync (otherwise spawnSync npm.cmd EINVAL).
 *
 * @param {string[]} args
 * @param {import('child_process').ExecFileSyncOptionsWithStringEncoding} [opts]
 * @returns {string}
 */
const runNpmSync = (args, opts = {}) => execFileSync(
	npmCommand(),
	args,
	Object.assign({
		encoding: 'utf8',
		windowsHide: true,
		stdio: ['ignore', 'pipe', 'pipe'],
		shell: process.platform === 'win32'
	}, opts)
);

module.exports = {
	npmCommand,
	runNpmSync
};
