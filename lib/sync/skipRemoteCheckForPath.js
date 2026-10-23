/**
 * Per-path remote check policy (mixed site + module private workflow).
 */

const { MODE_SITE, MODE_VERSION_CONTROL } = require('../sourceOfTruth');
const { MODULE_PRIVATE_RE } = require('../pull/validatePullPath');
const { normalizePhysicalPath } = require('../pull/validatePullPath');

/**
 * @param {string} physicalPath API / project-relative path
 * @param {'site' | 'versionControl'} sourceOfTruthMode
 * @returns {boolean}
 */
function shouldSkipRemoteCheckForPath(physicalPath, sourceOfTruthMode) {
	if (sourceOfTruthMode === MODE_VERSION_CONTROL) {
		return true;
	}
	if (sourceOfTruthMode !== MODE_SITE) {
		return false;
	}
	const p = normalizePhysicalPath(physicalPath);
	return MODULE_PRIVATE_RE.test(p);
}

module.exports = {
	shouldSkipRemoteCheckForPath,
	MODE_SITE,
	MODE_VERSION_CONTROL
};
