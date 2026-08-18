const fs = require('fs-extra'),
	path = require('path'),
	dir = require('./directories'),
	logger = require('./logger');

/**
 * Which folder pull should write site files into.
 * Prefer existing on-disk root: marketplace_builder/ if present, else app/.
 * Defaults to marketplace_builder/ when neither exists yet.
 *
 * @param {string} [cwd]
 * @returns {Promise<string>}
 */
const resolveSiteAppRoot = async (cwd = process.cwd()) => {
	if (await fs.pathExists(path.join(cwd, dir.SITE_ROOT))) {
		return dir.SITE_ROOT;
	}
	if (await fs.pathExists(path.join(cwd, dir.APP))) {
		return dir.APP;
	}
	return dir.SITE_ROOT;
};

/**
 * Resolve exclusive site root for sync/deploy: `marketplace_builder/` OR `app/`.
 * If both exist, warns and exits — source of truth is ambiguous.
 *
 * @param {string} [cwd]
 * @returns {string|null} Folder name, or null if neither exists
 */
const assertExclusiveSiteAppRoot = (cwd = process.cwd()) => {
	if (dir.bothSiteRootsExist(cwd)) {
		logger.Error(
			`Both ${dir.SITE_ROOT}/ and ${dir.APP}/ exist. ` +
				'Sort out which is the source of truth (keep one, remove or rename the other) before continuing.'
		);
	}
	return dir.getSiteRoot(cwd) || null;
};

module.exports = {
	resolveSiteAppRoot,
	assertExclusiveSiteAppRoot
};
