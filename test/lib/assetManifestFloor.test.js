const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
	manifestUpdatedAtToIso,
	floorFromManifestUpdatedAtSeconds,
	physicalPathFromManifestEntry,
	shouldRecordManifestSyncFloor,
	maxManifestFloorIso,
	recordAssetManifestSyncFloors
} = require('../../lib/sync/assetManifestFloor');
const { readPullBaseline, SYNC_FLOOR_BUFFER_MS } = require('../../lib/pullBaseline');

describe('assetManifestFloor', () => {
	it('manifestUpdatedAtToIso maps unix seconds', () => {
		const sec = 1731065035;
		assert.equal(manifestUpdatedAtToIso(sec), new Date(sec * 1000).toISOString());
	});

	it('floorFromManifestUpdatedAtSeconds applies SYNC_FLOOR_BUFFER_MS', () => {
		const sec = 1731065035;
		assert.equal(SYNC_FLOOR_BUFFER_MS, 1);
		assert.equal(
			floorFromManifestUpdatedAtSeconds(sec),
			new Date(sec * 1000 + SYNC_FLOOR_BUFFER_MS).toISOString()
		);
	});

	it('physicalPathFromManifestEntry uses physical_file_path', () => {
		assert.equal(
			physicalPathFromManifestEntry({
				physical_file_path: 'assets/css/site.css',
				updated_at: 1
			}),
			'assets/css/site.css'
		);
	});

	it('shouldRecordManifestSyncFloor is false for module private assets', () => {
		assert.equal(shouldRecordManifestSyncFloor('modules/core/private/assets/app.js'), false);
		assert.equal(shouldRecordManifestSyncFloor('modules/core/public/assets/app.js'), true);
	});

	it('maxManifestFloorIso picks latest row', () => {
		const iso = maxManifestFloorIso({
			a: { updated_at: 100 },
			b: { updated_at: 110 }
		});
		assert.equal(iso, floorFromManifestUpdatedAtSeconds(110));
	});

	describe('recordAssetManifestSyncFloors', () => {
		let cwd;

		beforeEach(() => {
			cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-asset-floor-'));
		});

		afterEach(() => {
			fs.rmSync(cwd, { recursive: true, force: true });
		});

		it('records lastSync.paths from manifest updated_at', () => {
			const manifest = {
				'css/a.css': {
					physical_file_path: 'assets/css/a.css',
					updated_at: 1731065035,
					file_size: 10
				}
			};
			recordAssetManifestSyncFloors(manifest, {
				environment: 'staging',
				cwd
			});
			const sec = 1731065035;
			assert.deepEqual(readPullBaseline('staging', cwd).lastSync, {
				paths: {
					'assets/css/a.css': floorFromManifestUpdatedAtSeconds(sec)
				}
			});
		});

		it('records module public asset paths', () => {
			const sec = 1731065040;
			recordAssetManifestSyncFloors({
				x: {
					physical_file_path: 'modules/my_mod/public/assets/js/widget.js',
					updated_at: sec,
					file_size: 8
				}
			}, {
				environment: 'staging',
				cwd
			});
			assert.deepEqual(readPullBaseline('staging', cwd).lastSync, {
				paths: {
					'modules/my_mod/public/assets/js/widget.js': floorFromManifestUpdatedAtSeconds(sec)
				}
			});
		});

		it('does not record module private asset paths', () => {
			recordAssetManifestSyncFloors({
				pub: {
					physical_file_path: 'modules/my_mod/public/assets/a.js',
					updated_at: 100,
					file_size: 1
				},
				priv: {
					physical_file_path: 'modules/my_mod/private/assets/b.js',
					updated_at: 200,
					file_size: 1
				}
			}, {
				environment: 'staging',
				cwd
			});
			assert.deepEqual(readPullBaseline('staging', cwd).lastSync, {
				paths: {
					'modules/my_mod/public/assets/a.js': floorFromManifestUpdatedAtSeconds(100)
				}
			});
		});
	});
});