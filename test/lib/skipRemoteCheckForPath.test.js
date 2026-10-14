const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { shouldSkipRemoteCheckForPath } = require('../../lib/sync/skipRemoteCheckForPath');

describe('shouldSkipRemoteCheckForPath', () => {
	it('skips private module paths in site mode', () => {
		assert.equal(
			shouldSkipRemoteCheckForPath('modules/foo/private/lib/x.liquid', 'site'),
			true
		);
	});

	it('does not skip public module paths in site mode', () => {
		assert.equal(
			shouldSkipRemoteCheckForPath('modules/foo/public/views/partials/x.liquid', 'site'),
			false
		);
	});

	it('skips all paths in versionControl mode', () => {
		assert.equal(
			shouldSkipRemoteCheckForPath('views/pages/a.liquid', 'versionControl'),
			true
		);
	});
});
