/**
 * Debounced assets_manifest POST for sync watch; floors recorded after ack.
 */

const { debounce } = require('lodash');
const logger = require('../logger');
const manifestGenerateForAssets = require('../assets/generateManifest').manifestGenerateForAssets;
const { recordAssetManifestSyncFloors } = require('./assetManifestFloor');
const { syncErrorFromAssetFailure, recordSyncUploadError } = require('../syncUploadError');

const MANIFEST_DEBOUNCE_MS = 500;
const MANIFEST_MAX_WAIT_MS = 10000;

/** @type {string[]} */
let manifestFilesToAdd = [];

/** @type {Promise<void> | null} */
let manifestInFlight = null;

/**
 * @param {string} localFilePath absolute or project-relative path passed to sendAsset
 */
function manifestQueueAsset(localFilePath) {
	let p = localFilePath.replace(/\\/g, '/');
	const cwd = process.cwd().replace(/\\/g, '/');
	if (p.startsWith(`${cwd}/`)) {
		p = p.slice(cwd.length + 1);
	}
	manifestFilesToAdd.push(p);
}

/**
 * @param {string} localFilePath
 * @returns {boolean}
 */
function isAssetManifestQueuedForPath(localFilePath) {
	const normalized = localFilePath.replace(/\\/g, '/');
	return manifestFilesToAdd.some((p) => p.replace(/\\/g, '/') === normalized);
}

/**
 * @returns {boolean}
 */
function hasAssetManifestWorkPending() {
	return manifestFilesToAdd.length > 0 || manifestInFlight != null;
}

/**
 * @param {import('../proxy')} gateway
 * @param {string[]} batch
 */
async function sendManifestBatch(gateway, batch) {
	const manifest = manifestGenerateForAssets(batch);
	logger.Debug(manifest);
	await gateway.sendManifest(manifest);
	recordAssetManifestSyncFloors(manifest, {
		environment: process.env.SITEGLIDE_ENV,
		cwd: process.cwd()
	});
}

/**
 * Drain queue (or wait for in-flight), one batch at a time.
 * @param {import('../proxy')} gateway
 */
async function flushAndSendManifest(gateway) {
	if (manifestInFlight) {
		await manifestInFlight;
	}
	while (manifestFilesToAdd.length > 0) {
		const batch = manifestFilesToAdd.splice(0);
		manifestInFlight = sendManifestBatch(gateway, batch).catch((err) => {
			const detail = err && err.message ? String(err.message) : 'assets_manifest failed';
			recordSyncUploadError(syncErrorFromAssetFailure('assets manifest', detail));
			throw err;
		}).finally(() => {
			manifestInFlight = null;
		});
		await manifestInFlight;
	}
}

/**
 * @param {import('../proxy')} gateway
 */
function scheduleManifestSend(gateway) {
	debouncedManifestSend(gateway);
}

/** @type {(gateway: import('../proxy')) => void} */
let debouncedManifestSend;

function installDebouncedManifestSend() {
	debouncedManifestSend = debounce((gateway) => {
		flushAndSendManifest(gateway).catch((err) => {
			logger.Debug(err);
		});
	}, MANIFEST_DEBOUNCE_MS, { maxWait: MANIFEST_MAX_WAIT_MS });
}

installDebouncedManifestSend();

/**
 * Before remote check / re-upload: manifest for this path must be settled.
 * @param {import('../proxy')} gateway
 * @param {string} localFilePath
 */
async function ensureAssetManifestSettled(gateway, localFilePath) {
	if (!isAssetManifestQueuedForPath(localFilePath) && !manifestInFlight) {
		return;
	}
	debouncedManifestSend.flush();
	if (manifestInFlight) {
		await manifestInFlight;
	}
	if (manifestFilesToAdd.length > 0) {
		await flushAndSendManifest(gateway);
	}
}

module.exports = {
	MANIFEST_DEBOUNCE_MS,
	manifestQueueAsset,
	isAssetManifestQueuedForPath,
	hasAssetManifestWorkPending,
	ensureAssetManifestSettled,
	scheduleManifestSend,
	flushAndSendManifest,
	/** @internal test hook */
	_resetManifestSendStateForTests() {
		manifestFilesToAdd = [];
		manifestInFlight = null;
		debouncedManifestSend.cancel();
	}
};