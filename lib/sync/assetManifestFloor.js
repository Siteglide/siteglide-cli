/**
 * Per-path sync floors for CDN asset manifests (manifest updated_at only).
 */

const { MODULE_PRIVATE_RE } = require('../pull/validatePullPath');
const {
	recordSyncPath,
	floorFromRemoteUpdatedAt
} = require('../pullBaseline');

/**
 * Unix seconds from manifest → ISO instant.
 * @param {number} updatedAtSeconds
 * @returns {string}
 */
function manifestUpdatedAtToIso(updatedAtSeconds) {
	const sec = Number(updatedAtSeconds);
	if (!Number.isFinite(sec)) {
		return new Date().toISOString();
	}
	return new Date(sec * 1000).toISOString();
}

/**
 * Per-path floor from manifest updated_at (seconds), same buffer as GraphQL floors.
 * @param {number} updatedAtSeconds
 * @returns {string}
 */
function floorFromManifestUpdatedAtSeconds(updatedAtSeconds) {
	return floorFromRemoteUpdatedAt(manifestUpdatedAtToIso(updatedAtSeconds));
}

/**
 * @param {string} physicalPath
 * @returns {boolean}
 */
function shouldRecordManifestSyncFloor(physicalPath) {
	const p = String(physicalPath || '').replace(/\\/g, '/').replace(/^\//, '');
	return !MODULE_PRIVATE_RE.test(p);
}

/**
 * Baseline physical_path for recordSyncPath / GraphQL (uses entry field from generateManifest).
 * @param {{ physical_file_path?: string }} entry
 * @returns {string | null}
 */
function physicalPathFromManifestEntry(entry) {
	if (!entry || !entry.physical_file_path) {
		return null;
	}
	return String(entry.physical_file_path).replace(/\\/g, '/').replace(/^\//, '');
}

/**
 * Latest manifest row floor ISO (last asset in batch by updated_at).
 * @param {Record<string, { updated_at?: number }>} manifest
 * @returns {string | null}
 */
function maxManifestFloorIso(manifest) {
	if (!manifest || typeof manifest !== 'object') {
		return null;
	}
	let bestSec = null;
	for (const entry of Object.values(manifest)) {
		if (!entry || entry.updated_at == null) {
			continue;
		}
		const sec = Number(entry.updated_at);
		if (!Number.isFinite(sec)) {
			continue;
		}
		if (bestSec == null || sec > bestSec) {
			bestSec = sec;
		}
	}
	if (bestSec == null) {
		return null;
	}
	return floorFromManifestUpdatedAtSeconds(bestSec);
}

/**
 * After successful assets_manifest POST: record lastSync.paths from manifest payload (sync watch).
 * @param {Record<string, { physical_file_path?: string, updated_at?: number, file_size?: number }>} manifest
 * @param {{ environment: string, cwd?: string }} opts
 */
function recordAssetManifestSyncFloors(manifest, opts) {
	const environment = opts.environment;
	if (!environment) {
		return;
	}
	const cwd = opts.cwd || process.cwd();

	for (const entry of Object.values(manifest)) {
		const physicalPath = physicalPathFromManifestEntry(entry);
		if (!physicalPath || entry.updated_at == null) {
			continue;
		}
		if (!shouldRecordManifestSyncFloor(physicalPath)) {
			continue;
		}
		const recordedSyncedAt = floorFromManifestUpdatedAtSeconds(entry.updated_at);
		recordSyncPath(environment, physicalPath, {
			syncedAt: recordedSyncedAt,
			cwd,
			immediate: true
		});
	}
}

module.exports = {
	manifestUpdatedAtToIso,
	floorFromManifestUpdatedAtSeconds,
	physicalPathFromManifestEntry,
	shouldRecordManifestSyncFloor,
	maxManifestFloorIso,
	recordAssetManifestSyncFloors
};
