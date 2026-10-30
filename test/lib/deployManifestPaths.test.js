const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { collectDeployManifestPaths } = require('../../lib/deployManifestPaths');

/**
 * Deploy's post-upload bookkeeping starts here. A throw in this function used to be swallowed by a
 * bare catch in siteglide-cli-deploy.js and exit 1 after a deploy that had already succeeded
 * (dir.currentApp was renamed and this file was not updated), so it is pinned against a real tree.
 */
describe('collectDeployManifestPaths', () => {
	let cwd;

	beforeEach(() => {
		cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-deploy-manifest-'));
		const write = (rel, body = 'x') => {
			const abs = path.join(cwd, rel);
			fs.mkdirSync(path.dirname(abs), { recursive: true });
			fs.writeFileSync(abs, body);
		};
		write('marketplace_builder/views/pages/home.liquid');
		write('marketplace_builder/assets/app.css');
		write('modules/module_1/public/views/partials/a.liquid');
		write('modules/module_1/public/assets/m.js');
		write('modules/module_1/template-values.json');
	});

	afterEach(() => {
		fs.rmSync(cwd, { recursive: true, force: true });
	});

	it('lists site and module files as API paths, excluding assets by default', () => {
		assert.deepEqual(collectDeployManifestPaths({ cwd }), [
			'modules/module_1/public/views/partials/a.liquid',
			'views/pages/home.liquid'
		]);
	});

	it('includes assets with withAssets', () => {
		assert.deepEqual(collectDeployManifestPaths({ cwd, withAssets: true }), [
			'assets/app.css',
			'modules/module_1/public/assets/m.js',
			'modules/module_1/public/views/partials/a.liquid',
			'views/pages/home.liquid'
		]);
	});

	it('returns an empty list, not a throw, when there is no site root', () => {
		const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-deploy-manifest-empty-'));
		try {
			assert.deepEqual(collectDeployManifestPaths({ cwd: empty }), []);
		} finally {
			fs.rmSync(empty, { recursive: true, force: true });
		}
	});
});
