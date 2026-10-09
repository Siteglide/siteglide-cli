/**
 * Spawn a nested siteglide-cli-pull child (merge-first deploy/pull/sync).
 */

const spawn = require('child_process').spawn;
const command = require('../command');
const { nestedCliEnv } = require('../commandLock');
const { tempPullLog } = require('../git/tempPullTrace');

/**
 * @param {object} [opts]
 * @param {string} [opts.configFile]
 * @param {boolean} [opts.mergeFirstSync]
 * @param {boolean} [opts.skipCommitBaseline]
 * @param {boolean} [opts.ignoreAssets]
 * @param {string} [opts.module]
 * @param {number} [opts.concurrency]
 * @param {object} [opts.extraEnv]
 * @param {string[]} [opts.extraArgs]
 * @returns {string[]}
 */
function buildNestedPullArgs(environment, opts = {}) {
	const configFile = opts.configFile || process.env.CONFIG_FILE_PATH || '.siteglide-config';
	const args = [environment, '-c', configFile];
	if (opts.mergeFirstSync) {
		args.push('--merge-first-sync');
	}
	if (opts.ignoreAssets) {
		args.push('-i');
	}
	if (opts.module) {
		args.push('-m', opts.module);
	}
	if (opts.concurrency) {
		args.push('--concurrency', String(opts.concurrency));
	}
	if (opts.extraArgs && opts.extraArgs.length) {
		args.push(...opts.extraArgs);
	}
	return args;
}

/**
 * @param {object} [opts]
 * @returns {NodeJS.ProcessEnv}
 */
function buildNestedPullEnv(opts = {}) {
	const env = Object.assign({}, process.env, nestedCliEnv(), {
		SITEGLIDE_PULL_ASSUME_YES: '1'
	});
	if (opts.skipCommitBaseline) {
		env.SITEGLIDE_PULL_SKIP_COMMIT_BASELINE = '1';
	}
	if (opts.mergeFirstSync) {
		env.SITEGLIDE_PULL_MERGE_FIRST_SYNC = '1';
	}
	if (opts.extraEnv) {
		Object.assign(env, opts.extraEnv);
	}
	return env;
}

/**
 * @param {object} opts
 * @param {string} opts.environment
 * @returns {Promise<void>}
 */
function spawnNestedPull(opts) {
	return new Promise((resolve, reject) => {
		const executable = command('siteglide-cli-pull');
		const args = buildNestedPullArgs(opts.environment, opts);
		const env = buildNestedPullEnv(opts);
		tempPullLog('spawnNestedPull', {
			executable,
			args: args.join(' '),
			cwd: process.cwd(),
			pid: process.pid,
			environment: opts.environment,
			SITEGLIDE_NESTED_CLI: env.SITEGLIDE_NESTED_CLI || '',
			SITEGLIDE_PULL_ASSUME_YES: env.SITEGLIDE_PULL_ASSUME_YES || '',
			SITEGLIDE_PULL_SKIP_COMMIT_BASELINE: env.SITEGLIDE_PULL_SKIP_COMMIT_BASELINE || '',
			SITEGLIDE_PULL_MERGE_FIRST_SYNC: env.SITEGLIDE_PULL_MERGE_FIRST_SYNC || ''
		});
		const child = spawn(
			executable,
			args,
			{
				stdio: 'inherit',
				shell: true,
				env
			}
		);
		tempPullLog('spawnNestedPull:spawned', { childPid: child.pid });
		child.on('error', (err) => {
			tempPullLog('spawnNestedPull:error', { message: err.message || String(err) });
			reject(err);
		});
		child.on('close', (code) => {
			tempPullLog('spawnNestedPull:close', { exitCode: code });
			if (code === 0) {
				resolve();
			} else {
				reject(new Error(`pull exit ${code}`));
			}
		});
	});
}

module.exports = {
	spawnNestedPull,
	buildNestedPullArgs,
	buildNestedPullEnv
};
