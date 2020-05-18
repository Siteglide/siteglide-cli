const fs = require('fs');
	glob = require('globby'),
	dir = require('../directories');

const _getAssets = async () => {
	const appAssets = fs.existsSync(`${dir.LEGACY_APP}/assets`) ? await glob(`${dir.LEGACY_APP}/assets/**`) : [];

	return [...appAssets] || [];
};

module.exports = {
	getAssets: _getAssets
}