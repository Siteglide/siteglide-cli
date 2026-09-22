const { buildSyncWatchEnv } = require('../../lib/syncWatchEnv');

test('buildSyncWatchEnv sets SITEGLIDE_SKIP_REMOTE_CHECK when skipRemoteCheck is true', () => {
	const env = buildSyncWatchEnv({
		processEnv: { FOO: 'bar' },
		authData: { email: 'a@b.com', token: 'tok', url: 'https://example.com' },
		environment: 'staging',
		skipRemoteCheck: true
	});
	expect(env).toEqual({
		FOO: 'bar',
		SITEGLIDE_EMAIL: 'a@b.com',
		SITEGLIDE_TOKEN: 'tok',
		SITEGLIDE_URL: 'https://example.com',
		SITEGLIDE_ENV: 'staging',
		SITEGLIDE_SKIP_REMOTE_CHECK: '1'
	});
});

test('buildSyncWatchEnv preserves existing SITEGLIDE_SKIP_REMOTE_CHECK when skipRemoteCheck is false', () => {
	const env = buildSyncWatchEnv({
		processEnv: { SITEGLIDE_SKIP_REMOTE_CHECK: '1' },
		authData: { email: 'a@b.com', token: 'tok', url: 'https://example.com' },
		environment: 'staging',
		skipRemoteCheck: false
	});
	expect(env.SITEGLIDE_SKIP_REMOTE_CHECK).toBe('1');
});

test('buildSyncWatchEnv clears skip flag when unset and skipRemoteCheck is false', () => {
	const env = buildSyncWatchEnv({
		processEnv: {},
		authData: { email: 'a@b.com', token: 'tok', url: 'https://example.com' },
		environment: 'staging',
		skipRemoteCheck: false
	});
	expect(env.SITEGLIDE_SKIP_REMOTE_CHECK).toBe('');
});
