const fs = require('fs');
const path = require('path');

const app = {
	APP: 'app',
	LEGACY_APP: 'marketplace_builder',
	MODULES: 'modules',
};

const internal = {
	TMP: '.tmp'
};

const computed = {
	ALLOWED: [app.APP, app.LEGACY_APP, app.MODULES]
};

const existsInCwd = (name, cwd = process.cwd()) => fs.existsSync(path.join(cwd, name));

const methods = {
	toWatch: (cwd = process.cwd()) => computed.ALLOWED.filter((d) => existsInCwd(d, cwd)),
	/** Prefer app/, else marketplace_builder/. Undefined if neither exists. */
	currentApp: (cwd = process.cwd()) => {
		if (existsInCwd(app.APP, cwd)) {
			return app.APP;
		}
		if (existsInCwd(app.LEGACY_APP, cwd)) {
			return app.LEGACY_APP;
		}
		return undefined;
	},
	bothAppRootsExist: (cwd = process.cwd()) =>
		existsInCwd(app.APP, cwd) && existsInCwd(app.LEGACY_APP, cwd),
	available: (cwd = process.cwd()) => computed.ALLOWED.filter((d) => existsInCwd(d, cwd))
};

module.exports = Object.assign({}, app, internal, computed, methods);
