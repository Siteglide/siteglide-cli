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
		SITEGLIDE_SKIP_REMOTE_CHECK: '1',
		SITEGLIDE_SYNC_MERGE_FIRST_FAST: '',
		SITEGLIDE_SYNC_MERGE_FIRST_COMPARE: ''
	});
});

test('buildSyncWatchEnv sets merge-first fast and compare flags', () => {
	const env = buildSyncWatchEnv({
		processEnv: {},
		authData: { email: 'a@b.com', token: 'tok', url: 'https://example.com' },
		environment: 'staging',
		skipRemoteCheck: false,
		mergeFirstFast: true,
		mergeFirstCompare: false
	});
	expect(env.SITEGLIDE_SYNC_MERGE_FIRST_FAST).toBe('1');
	expect(env.SITEGLIDE_SYNC_MERGE_FIRST_COMPARE).toBe('');

	const compareEnv = buildSyncWatchEnv({
		processEnv: {},
		authData: { email: 'a@b.com', token: 'tok', url: 'https://example.com' },
		environment: 'staging',
		skipRemoteCheck: false,
		mergeFirstCompare: true
	});
	expect(compareEnv.SITEGLIDE_SYNC_MERGE_FIRST_COMPARE).toBe('1');
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
