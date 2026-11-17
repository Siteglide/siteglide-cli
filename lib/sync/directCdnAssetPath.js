/**
 * Local paths that sync via S3 presign + assets_manifest (site or module asset trees).
 */

const { isModuleDeployAssetPath } = require('../moduleDeployAssetPath');

/**
 * @param {string} syncedFilePath project-relative or absolute path
 * @param {string | null | undefined} siteRoot e.g. marketplace_builder
 * @returns {boolean}
 */
function isDirectCdnAssetPath(syncedFilePath, siteRoot) {
	const normalized = String(syncedFilePath || '').replace(/\\/g, '/');
	if (siteRoot && normalized.startsWith(`${siteRoot}/assets`)) {
		return true;
	}
	const modulesSegment = 'modules/';
	const idx = normalized.indexOf(modulesSegment);
	if (idx === -1) {
		return false;
	}
	const afterModule = normalized.slice(idx + modulesSegment.length);
	const slash = afterModule.indexOf('/');
	if (slash === -1) {
		return false;
	}
	const withinModule = afterModule.slice(slash + 1);
	return isModuleDeployAssetPath(withinModule);
}

module.exports = {
	isDirectCdnAssetPath
};