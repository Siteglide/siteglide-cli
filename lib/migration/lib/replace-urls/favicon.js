const { isEligible, assetify, isAssetified } = require('./utils');

module.exports = (document) => {
	const favicon = document.querySelectorAll('link[rel*="icon"]');

	favicon.forEach((el) => {

		if (!isEligible(el.href)) return;

		el.href = assetify(el.href);

		if (isAssetified(el.href)) return;

		el.href = el.href.replace(/^http:/, 'https:');
	});
};
