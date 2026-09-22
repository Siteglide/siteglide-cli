/**
 * Spawn a nested siteglide-cli-pull child (merge-first deploy/pull/sync).
 */

const spawn = require('child_process').spawn;
const command = require('../command');
const { nestedCliEnv } = require('../commandLock');

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
		const child = spawn(
			command('siteglide-cli-pull'),
			buildNestedPullArgs(opts.environment, opts),
			{
				stdio: 'inherit',
				shell: true,
				env: buildNestedPullEnv(opts)
			}
		);
		child.on('error', reject);
		child.on('close', (code) => {
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
