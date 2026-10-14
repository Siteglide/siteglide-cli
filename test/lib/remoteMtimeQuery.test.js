const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildFileMtimeQuery } = require('../../lib/graphql/remoteMtimeQueries');
const { buildFileContentQuery } = require('../../lib/graphql/remoteFileContentQueries');
const { buildNestedPullArgs, buildNestedPullEnv } = require('../../lib/pull/spawnNestedPull');

describe('remoteMtimeQueries buildFileMtimeQuery', () => {
	it('omits body/content by default', () => {
		const query = buildFileMtimeQuery('admin_pages', 'views/pages/a.liquid');
		assert.match(query, /updated_at/);
		assert.doesNotMatch(query, /\bcontent\b/);
		assert.doesNotMatch(query, /\bbody\b/);
	});

	it('includes content for pages when includeBody is true', () => {
		const query = buildFileMtimeQuery('admin_pages', 'views/pages/a.liquid', { includeBody: true });
		assert.match(query, /content/);
	});

	it('includes body for partials when includeBody is true', () => {
		const query = buildFileMtimeQuery('admin_liquid_partials', 'views/partials/a.liquid', { includeBody: true });
		assert.match(query, /body/);
	});
});

describe('remoteFileContentQueries buildFileContentQuery', () => {
	it('includes page content and layout fields', () => {
		const query = buildFileContentQuery('views/pages/a.liquid');
		assert.match(query, /admin_pages/);
		assert.match(query, /content/);
		assert.match(query, /layout/);
	});
});

describe('spawnNestedPull helpers', () => {
	it('adds merge-first-sync flag and env when requested', () => {
		const args = buildNestedPullArgs('staging', {
			configFile: '.siteglide-config',
			mergeFirstSync: true,
			skipCommitBaseline: true
		});
		assert.deepEqual(args, ['staging', '-c', '.siteglide-config', '--merge-first-sync']);

		const env = buildNestedPullEnv({ mergeFirstSync: true, skipCommitBaseline: true });
		assert.equal(env.SITEGLIDE_PULL_ASSUME_YES, '1');
		assert.equal(env.SITEGLIDE_PULL_MERGE_FIRST_SYNC, '1');
		assert.equal(env.SITEGLIDE_PULL_SKIP_COMMIT_BASELINE, '1');
		assert.equal(env.SITEGLIDE_NESTED_CLI, '1');
	});

	it('passes fast, compare, and paths to nested pull', () => {
		const args = buildNestedPullArgs('staging', {
			mergeFirstSync: true,
			mergeFirstFast: true,
			paths: ['views/pages/a.liquid', 'views/partials/b.liquid']
		});
		assert.deepEqual(args, [
			'staging',
			'-c',
			'.siteglide-config',
			'--merge-first-sync',
			'--merge-first-fast',
			'--path',
			'views/pages/a.liquid',
			'--path',
			'views/partials/b.liquid'
		]);

		const env = buildNestedPullEnv({
			mergeFirstSync: true,
			mergeFirstCompare: true,
			paths: ['views/pages/a.liquid']
		});
		assert.equal(env.SITEGLIDE_PULL_MERGE_FIRST_COMPARE, '1');
		assert.equal(env.SITEGLIDE_PULL_PATHS, 'views/pages/a.liquid');
	});
});
