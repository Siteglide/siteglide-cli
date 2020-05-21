const { isEligible, assetify } = require('./utils');

module.exports = (document) => {
	const css = document.querySelectorAll('link[rel="stylesheet"]');

	css.forEach((el) => {
		el.href = el.href.replace(/^http:/, 'https:'); // do not request http resources from https

		if (!isEligible(el.href)) return;

		el.href = assetify(el.href);
	});
};
