/**
 * Normalize and validate physical paths for selective pull.
 */

const MODULE_PRIVATE_RE = /^modules\/[^/]+\/private(?:\/|$)/;

/**
 * @param {string} physicalPath
 * @returns {string}
 */
function normalizePhysicalPath(physicalPath) {
	return physicalPath.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\//, '');
}

/**
 * Selective pull cannot target module private files.
 * @param {string} physicalPath
 * @returns {{ ok: true, path: string } | { ok: false, path: string, reason: string }}
 */
function validateSelectivePullPath(physicalPath) {
	const path = normalizePhysicalPath(physicalPath);
	if (!path) {
		return { ok: false, path, reason: 'empty_path' };
	}
	if (MODULE_PRIVATE_RE.test(path)) {
		return { ok: false, path, reason: 'module_private' };
	}
	return { ok: true, path };
}

/**
 * @param {string[]} paths
 * @returns {{ paths: string[], rejected: { path: string, reason: string }[] }}
 */
function validateSelectivePullPaths(paths) {
	const accepted = [];
	const rejected = [];
	for (let i = 0; i < paths.length; i++) {
		const result = validateSelectivePullPath(paths[i]);
		if (result.ok) {
			if (accepted.indexOf(result.path) === -1) {
				accepted.push(result.path);
			}
		} else {
			rejected.push({ path: result.path, reason: result.reason });
		}
	}
	return { paths: accepted, rejected };
}

module.exports = {
	normalizePhysicalPath,
	validateSelectivePullPath,
	validateSelectivePullPaths,
	MODULE_PRIVATE_RE
};
