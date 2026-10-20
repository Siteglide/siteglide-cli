const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { isModuleDeployAssetPath } = require('../../lib/moduleDeployAssetPath');

describe('isModuleDeployAssetPath', () => {
	it('matches public and private module asset trees', () => {
		assert.equal(isModuleDeployAssetPath('public/assets/app.js'), true);
		assert.equal(isModuleDeployAssetPath('public/assets/css/site.css'), true);
		assert.equal(isModuleDeployAssetPath('private/assets/x.png'), true);
	});

	it('does not match non-asset module files', () => {
		assert.equal(isModuleDeployAssetPath('public/views/partials/a.liquid'), false);
		assert.equal(isModuleDeployAssetPath('public/assets-extra/foo.js'), false);
		assert.equal(isModuleDeployAssetPath('private/lib/helper.js'), false);
	});
});
