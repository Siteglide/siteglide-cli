const fs = require('fs');
const path = require('path');

const app = {
	SITE_ROOT: 'marketplace_builder',
	APP: 'app',
	MODULES: 'modules',
};

const internal = {
	TMP: '.tmp'
};

const computed = {
	ALLOWED: [app.SITE_ROOT, app.APP, app.MODULES]
};

const existsInCwd = (name, cwd = process.cwd()) => fs.existsSync(path.join(cwd, name));

const methods = {
	toWatch: (cwd = process.cwd()) => computed.ALLOWED.filter((d) => existsInCwd(d, cwd)),
	/**
	 * Prefer marketplace_builder/, else app/. Undefined if neither exists.
	 *
	 * @param {string} [cwd]
	 * @returns {string|undefined}
	 */
	getSiteRoot: (cwd = process.cwd()) => {
		if (existsInCwd(app.SITE_ROOT, cwd)) {
			return app.SITE_ROOT;
		}
		if (existsInCwd(app.APP, cwd)) {
			return app.APP;
		}
		return undefined;
	},
	/**
	 * Resolved site root, or marketplace_builder/ when neither exists yet (e.g. first pull).
	 *
	 * @param {string} [cwd]
	 * @returns {string}
	 */
	defaultSiteRoot: (cwd = process.cwd()) => methods.getSiteRoot(cwd) || app.SITE_ROOT,
	bothSiteRootsExist: (cwd = process.cwd()) =>
		existsInCwd(app.SITE_ROOT, cwd) && existsInCwd(app.APP, cwd),
	available: (cwd = process.cwd()) => computed.ALLOWED.filter((d) => existsInCwd(d, cwd))
};

module.exports = Object.assign({}, app, internal, computed, methods);
