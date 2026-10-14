const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
	validateSelectivePullPath,
	validateSelectivePullPaths
} = require('../../lib/pull/validatePullPath');

describe('validateSelectivePullPath', () => {
	it('accepts marketplace_builder-relative paths', () => {
		assert.equal(validateSelectivePullPath('views/pages/a.liquid').ok, true);
	});

	it('rejects module private paths', () => {
		const result = validateSelectivePullPath('modules/core/private/lib/foo.liquid');
		assert.equal(result.ok, false);
		assert.equal(result.reason, 'module_private');
	});

	it('accepts module public paths', () => {
		assert.equal(
			validateSelectivePullPath('modules/core/public/views/partials/x.liquid').ok,
			true
		);
	});
});

describe('validateSelectivePullPaths', () => {
	it('dedupes paths', () => {
		const result = validateSelectivePullPaths([
			'views/pages/a.liquid',
			'views/pages/a.liquid'
		]);
		assert.deepEqual(result.paths, ['views/pages/a.liquid']);
	});
});
