const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
	manifestQueueAsset,
	flushAndSendManifest,
	_resetManifestSendStateForTests
} = require('../../lib/sync/assetManifestSend');
const { readPullBaseline } = require('../../lib/pullBaseline');
const { floorFromManifestUpdatedAtSeconds } = require('../../lib/sync/assetManifestFloor');

describe('assetManifestSend module public assets', () => {
	let cwd;
	let assetPath;
	const mtimeSec = 1731065099;

	beforeEach(() => {
		_resetManifestSendStateForTests();
		cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-mod-manifest-'));
		const assetsDir = path.join(cwd, 'modules', 'demo_mod', 'public', 'assets', 'js');
		fs.mkdirSync(assetsDir, { recursive: true });
		assetPath = path.join(assetsDir, 'app.js');
		fs.writeFileSync(assetPath, 'console.log(1);');
		const at = new Date(mtimeSec * 1000);
		fs.utimesSync(assetPath, at, at);
	});

	afterEach(() => {
		_resetManifestSendStateForTests();
		fs.rmSync(cwd, { recursive: true, force: true });
		delete process.env.SITEGLIDE_ENV;
	});

	it('flushAndSendManifest records lastSync for module public asset', async () => {
		process.env.SITEGLIDE_ENV = 'staging';
		const priorCwd = process.cwd();
		process.chdir(cwd);
		try {
			const gateway = {
				sendManifest: async (manifest) => {
					const entry = Object.values(manifest)[0];
					assert.equal(
						entry.physical_file_path.replace(/\\/g, '/'),
						'modules/demo_mod/public/assets/js/app.js'
					);
					assert.equal(entry.updated_at, mtimeSec);
				}
			};
			manifestQueueAsset(assetPath);
			await flushAndSendManifest(gateway);
			assert.deepEqual(readPullBaseline('staging', cwd).lastSync, {
				paths: {
					'modules/demo_mod/public/assets/js/app.js': floorFromManifestUpdatedAtSeconds(mtimeSec)
				}
			});
		} finally {
			process.chdir(priorCwd);
		}
	});
});