const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
	isSiteglideManagedModule,
	selectModulesToPull
} = require('../../lib/pull/moduleSelection');

describe('pull moduleSelection', () => {
	it('isSiteglideManagedModule matches siteglide_* and fixed module ids', () => {
		assert.equal(isSiteglideManagedModule('siteglide_studio'), true);
		assert.equal(isSiteglideManagedModule('module_86'), true);
		assert.equal(isSiteglideManagedModule('module_357'), true);
		assert.equal(isSiteglideManagedModule('core'), false);
		assert.equal(isSiteglideManagedModule('module_999'), false);
	});

	it('returns all installed modules by default', () => {
		const result = selectModulesToPull(['core', 'siteglide_foo'], {});
		assert.equal(result.ok, true);
		assert.deepEqual(result.modules, ['core', 'siteglide_foo']);
	});

	it('--skip-sgm removes Siteglide-managed modules', () => {
		const result = selectModulesToPull(['core', 'siteglide_foo', 'module_86', 'user'], { skipSgm: true });
		assert.equal(result.ok, true);
		assert.deepEqual(result.modules, ['core', 'user']);
		assert.deepEqual(result.skipped, ['siteglide_foo', 'module_86']);
	});

	it('-m module_357 with skip-sgm is contradictory', () => {
		const result = selectModulesToPull(['module_357', 'core'], {
			moduleFilter: 'module_357',
			skipSgm: true
		});
		assert.equal(result.ok, false);
		assert.equal(result.code, 'contradictory');
	});

	it('-m core with skip-sgm pulls only core', () => {
		const result = selectModulesToPull(['core', 'siteglide_foo'], {
			moduleFilter: 'core',
			skipSgm: true
		});
		assert.equal(result.ok, true);
		assert.deepEqual(result.modules, ['core']);
	});

	it('reports not_installed for unknown -m filter', () => {
		const result = selectModulesToPull(['core'], { moduleFilter: 'missing' });
		assert.equal(result.ok, false);
		assert.equal(result.code, 'not_installed');
	});
});
