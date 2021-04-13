const { isEligible, assetify, isAssetified } = require('./utils');

module.exports = ($) => {
	const scripts = $('script');

	scripts.each((i,el) => {
		if (!el.children[0]) return;

		if (!el.children[0].data.includes('var suppressMissingFileError = false')) return;

		el.children[0].data = el.children[0].data.replace('var suppressMissingFileError = false', 'var suppressMissingFileError = true');
	});
};