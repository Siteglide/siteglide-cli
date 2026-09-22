/**
 * Environment passed to siteglide-cli-watch when sync spawns the watcher.
 * @param {{ processEnv: NodeJS.ProcessEnv, authData: { email: string, token: string, url: string }, environment: string, skipRemoteCheck?: boolean }} opts
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
			: (opts.processEnv.SITEGLIDE_SKIP_REMOTE_CHECK || '')
	});
}

module.exports = {
	buildSyncWatchEnv
};
