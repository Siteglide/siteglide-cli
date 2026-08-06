const fs = require('fs-extra'),
	path = require('path'),
	dir = require('./directories'),
	logger = require('./logger');

/**
 * Which folder pull should write site files into.
 * Prefer existing on-disk root: app/ if present, else marketplace_builder/.
 * Defaults to app/ only when neither exists yet.
 *
 * @param {string} [cwd]
 * @returns {Promise<string>}
 */
const resolveSiteAppRoot = async (cwd = process.cwd()) => {
	if (await fs.pathExists(path.join(cwd, dir.APP))) {
		return dir.APP;
	}
	if (await fs.pathExists(path.join(cwd, dir.LEGACY_APP))) {
		return dir.LEGACY_APP;
	}
	return dir.APP;
};

/**
 * Resolve exclusive site root for sync/deploy: `app/` OR `marketplace_builder/`.
 * If both exist, warns and exits — source of truth is ambiguous.
 *
 * @param {string} [cwd]
 * @returns {string|null} Folder name, or null if neither exists
 */
const assertExclusiveSiteAppRoot = (cwd = process.cwd()) => {
	if (dir.bothAppRootsExist(cwd)) {
		logger.Error(
			`Both ${dir.APP}/ and ${dir.LEGACY_APP}/ exist. ` +
				'Sort out which is the source of truth (keep one, remove or rename the other) before continuing.'
		);
	}
	return dir.currentApp(cwd) || null;
};

module.exports = {
	resolveSiteAppRoot,
	assertExclusiveSiteAppRoot
};
