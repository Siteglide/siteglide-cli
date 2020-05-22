const { isEligible, assetify, isAssetified } = require('./utils');

module.exports = (document) => {
	const a = document.querySelectorAll('a[href]');

	a.forEach(el => {
		if (!isEligible(el.href)) return;

		if (/\/assets\//.test(el.href)) {
			el.href = assetify(el.href);
		}

		if (isAssetified(el.href)) return;

		el.href = el.href.replace(/^http:/, 'https:');
	});
};
