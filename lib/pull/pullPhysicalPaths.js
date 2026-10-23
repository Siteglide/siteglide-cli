/**
 * Selective pull: fetch and write one or more physical paths.
 */

const getBinary = require('../assets/getBinary');
const logger = require('../logger');
const { serializeRemoteFile } = require('./serializeRemoteFile');
const { fetchRemoteFileContent } = require('./fetchRemoteFileContent');
const { validateSelectivePullPaths } = require('./validatePullPath');
const { writePulledPath } = require('./writePulledPath');

/**
 * @param {import('../proxy')} gateway
 * @param {string} physicalPath
 * @param {object} [opts]
 */
async function pullOnePhysicalPath(gateway, physicalPath, opts = {}) {
	const fetched = await fetchRemoteFileContent(gateway, physicalPath);
	if (!fetched.ok) {
		return { ok: false, path: physicalPath, reason: fetched.reason };
	}
	let content = null;
	if (fetched.kind === 'asset' && fetched.record.url && !fetched.record.body) {
		const time = '?updated=' + new Date().getTime();
		const body = await getBinary(fetched.record.url, time);
		if (body === 'error_missing_file') {
			return { ok: false, path: physicalPath, reason: 'asset_missing' };
		}
		content = body;
	} else {
		content = serializeRemoteFile({ kind: fetched.kind, record: fetched.record });
		if (content === null) {
			return { ok: false, path: physicalPath, reason: 'serialize_failed' };
		}
	}
	const written = writePulledPath(fetched.physicalPath, content, opts);
	if (!written) {
		return { ok: false, path: physicalPath, reason: 'write_skipped' };
	}
	return {
		ok: true,
		path: fetched.physicalPath,
		kind: fetched.kind,
		updatedAt: fetched.updatedAt,
		writtenPath: written
	};
}

/**
 * @param {import('../proxy')} gateway
 * @param {object} opts
 * @param {string[]} opts.paths
 * @returns {Promise<{ ok: boolean, written: object[], failed: object[], rejected: object[] }>}
 */
async function pullPhysicalPaths(gateway, opts) {
	const validation = validateSelectivePullPaths(opts.paths || []);
	const written = [];
	const failed = [];
	for (let i = 0; i < validation.paths.length; i++) {
		const path = validation.paths[i];
		try {
			const result = await pullOnePhysicalPath(gateway, path, opts);
			if (result.ok) {
				written.push(result);
			} else {
				failed.push(result);
			}
		} catch (err) {
			failed.push({ ok: false, path, reason: err.message || String(err) });
		}
	}
	if (validation.rejected.length) {
		logger.Warn(`[pull] Selective pull rejected ${validation.rejected.length} path(s)`, { exit: false });
	}
	const ok = failed.length === 0 && validation.rejected.length === 0;
	if (!ok && failed.length) {
		logger.Debug(`[pull] Selective pull failures: ${JSON.stringify(failed)}`);
	}
	return {
		ok,
		written,
		failed,
		rejected: validation.rejected,
		fallbackRecommended: failed.length > 0 || validation.rejected.length > 0
	};
}

module.exports = {
	pullOnePhysicalPath,
	pullPhysicalPaths
};
