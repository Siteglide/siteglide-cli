/**
 * Spawn a nested siteglide-cli-pull child (merge-first deploy/pull/sync).
 */

const spawn = require('child_process').spawn;
const command = require('../command');
const { nestedCliEnv } = require('../commandLock');
const { tempPullLog } = require('../git/tempPullTrace');
const logger = require('../logger');
const { shouldPassDebugToChild } = require('../cliDebug');

/**
 * @param {object} [opts]
 * @param {string} [opts.configFile]
 * @param {boolean} [opts.mergeFirstSync]
 * @param {boolean} [opts.skipCommitBaseline]
 * @param {boolean} [opts.ignoreAssets]
 * @param {string} [opts.module]
 * @param {number} [opts.concurrency]
 * @param {object} [opts.extraEnv]
 * @param {string[]} [opts.paths]
 * @param {boolean} [opts.mergeFirstFast]
 * @param {boolean} [opts.mergeFirstCompare]
 * @param {string[]} [opts.extraArgs]
 * @returns {string[]}
 */
function buildNestedPullArgs(environment, opts = {}) {
	const configFile = opts.configFile || process.env.CONFIG_FILE_PATH || '.siteglide-config';
	const args = [environment, '-c', configFile];
	if (opts.mergeFirstSync) {
		args.push('--merge-first-sync');
	}
	if (opts.mergeFirstFast) {
		args.push('--merge-first-fast');
	}
	if (opts.mergeFirstCompare) {
		args.push('--merge-first-compare');
	}
	if (opts.paths && opts.paths.length) {
		for (let i = 0; i < opts.paths.length; i++) {
			args.push('--path', opts.paths[i]);
		}
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
	if (shouldPassDebugToChild()) {
		args.push('--debug');
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
	if (opts.mergeFirstFast) {
		env.SITEGLIDE_PULL_MERGE_FIRST_FAST = '1';
	}
	if (opts.mergeFirstCompare) {
		env.SITEGLIDE_PULL_MERGE_FIRST_COMPARE = '1';
	}
	if (opts.paths && opts.paths.length) {
		env.SITEGLIDE_PULL_PATHS = opts.paths.join(',');
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
		if (opts.mergeFirstCompare) {
			logger.Debug(
				`[compare] spawnNestedPull: starting nested pull with --merge-first-compare paths=${JSON.stringify(opts.paths || [])}`
			);
		}
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
