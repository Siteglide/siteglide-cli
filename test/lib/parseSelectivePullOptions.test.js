const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { parseSelectivePullOptions } = require('../../lib/pull/parseSelectivePullOptions');

describe('parseSelectivePullOptions', () => {
	const envBackup = {};

	beforeEach(() => {
		envBackup.SITEGLIDE_PULL_PATHS = process.env.SITEGLIDE_PULL_PATHS;
		envBackup.SITEGLIDE_PULL_MERGE_FIRST_FAST = process.env.SITEGLIDE_PULL_MERGE_FIRST_FAST;
		envBackup.SITEGLIDE_PULL_SELECTIVE = process.env.SITEGLIDE_PULL_SELECTIVE;
		delete process.env.SITEGLIDE_PULL_PATHS;
		delete process.env.SITEGLIDE_PULL_MERGE_FIRST_FAST;
		delete process.env.SITEGLIDE_PULL_SELECTIVE;
	});

	afterEach(() => {
		process.env.SITEGLIDE_PULL_PATHS = envBackup.SITEGLIDE_PULL_PATHS;
		process.env.SITEGLIDE_PULL_MERGE_FIRST_FAST = envBackup.SITEGLIDE_PULL_MERGE_FIRST_FAST;
		process.env.SITEGLIDE_PULL_SELECTIVE = envBackup.SITEGLIDE_PULL_SELECTIVE;
	});

	it('reads paths from params.path array', () => {
		const opts = parseSelectivePullOptions({
			path: ['views/pages/a.liquid']
		});
		assert.deepEqual(opts.paths, ['views/pages/a.liquid']);
	});

	it('honours SITEGLIDE_PULL_SELECTIVE=0', () => {
		process.env.SITEGLIDE_PULL_SELECTIVE = '0';
		const opts = parseSelectivePullOptions({ mergeFirstFast: true, path: ['a'] });
		assert.equal(opts.selectiveDisabled, true);
	});
});
