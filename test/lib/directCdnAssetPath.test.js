const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { isDirectCdnAssetPath } = require('../../lib/sync/directCdnAssetPath');

describe('isDirectCdnAssetPath', () => {
	it('matches site assets under site root', () => {
		assert.equal(isDirectCdnAssetPath('marketplace_builder/assets/css/a.css', 'marketplace_builder'), true);
		assert.equal(isDirectCdnAssetPath('marketplace_builder/views/pages/x.liquid', 'marketplace_builder'), false);
	});

	it('matches module public and private asset trees', () => {
		assert.equal(
			isDirectCdnAssetPath('modules/foo/public/assets/x.js', 'marketplace_builder'),
			true
		);
		assert.equal(
			isDirectCdnAssetPath('modules/foo/private/assets/x.js', 'marketplace_builder'),
			true
		);
		assert.equal(
			isDirectCdnAssetPath('modules/foo/public/views/x.liquid', 'marketplace_builder'),
			false
		);
	});
});