const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
	manifestQueueAsset,
	isAssetManifestQueuedForPath,
	flushAndSendManifest,
	_resetManifestSendStateForTests
} = require('../../lib/sync/assetManifestSend');
const { readPullBaseline } = require('../../lib/pullBaseline');
const { floorFromManifestUpdatedAtSeconds } = require('../../lib/sync/assetManifestFloor');

describe('assetManifestSend', () => {
	let cwd;
	let siteRoot;
	let assetPath;

	beforeEach(() => {
		_resetManifestSendStateForTests();
		cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-asset-manifest-'));
		siteRoot = 'marketplace_builder';
		const assetsDir = path.join(cwd, siteRoot, 'assets', 'css');
		fs.mkdirSync(assetsDir, { recursive: true });
		assetPath = path.join(assetsDir, 'test-floor.css');
		const mtimeSec = 1731065035;
		fs.writeFileSync(assetPath, 'body { color: red; }');
		const at = new Date(mtimeSec * 1000);
		fs.utimesSync(assetPath, at, at);
	});

	afterEach(() => {
		_resetManifestSendStateForTests();
		fs.rmSync(cwd, { recursive: true, force: true });
		delete process.env.SITEGLIDE_ENV;
	});

	it('isAssetManifestQueuedForPath matches normalized path', () => {
		manifestQueueAsset(assetPath);
		assert.equal(isAssetManifestQueuedForPath(assetPath), true);
	});

	it('flushAndSendManifest posts manifest and records floors', async () => {
		process.env.SITEGLIDE_ENV = 'staging';
		const mtimeSec = 1731065035;
		let manifestPosted = null;
		const gateway = {
			sendManifest: async (manifest) => {
				manifestPosted = manifest;
			}
		};
		const priorCwd = process.cwd();
		process.chdir(cwd);
		try {
			manifestQueueAsset(assetPath);
			await flushAndSendManifest(gateway);
			assert.ok(manifestPosted);
			const entries = Object.values(manifestPosted);
			assert.equal(entries.length, 1);
			const entry = entries[0];
			assert.equal(entry.physical_file_path.replace(/\\/g, '/'), 'assets/css/test-floor.css');
			assert.equal(entry.updated_at, mtimeSec);
			assert.deepEqual(readPullBaseline('staging', cwd).lastSync.paths, {
				'assets/css/test-floor.css': floorFromManifestUpdatedAtSeconds(mtimeSec)
			});
		} finally {
			process.chdir(priorCwd);
		}
	});
});