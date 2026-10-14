/**
 * Environment passed to siteglide-cli-watch when sync spawns the watcher.
 * @param {{ processEnv: NodeJS.ProcessEnv, authData: { email: string, token: string, url: string }, environment: string, skipRemoteCheck?: boolean, mergeFirstFast?: boolean, mergeFirstCompare?: boolean }} opts
 * @returns {NodeJS.ProcessEnv}
 */
function buildSyncWatchEnv(opts) {
	return Object.assign({}, opts.processEnv, {
		SITEGLIDE_EMAIL: opts.authData.email,
		SITEGLIDE_TOKEN: opts.authData.token,
		SITEGLIDE_URL: opts.authData.url,
		SITEGLIDE_ENV: opts.environment,
		SITEGLIDE_SKIP_REMOTE_CHECK: opts.skipRemoteCheck
			? '1'
			: (opts.processEnv.SITEGLIDE_SKIP_REMOTE_CHECK || ''),
		SITEGLIDE_SYNC_MERGE_FIRST_FAST: opts.mergeFirstFast ? '1' : '',
		SITEGLIDE_SYNC_MERGE_FIRST_COMPARE: opts.mergeFirstCompare ? '1' : ''
	});
}

module.exports = {
	buildSyncWatchEnv
};
