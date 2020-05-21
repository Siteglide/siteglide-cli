const { isEligible, assetify } = require('./utils');

module.exports = (document) => {
	const favicon = document.querySelectorAll('link[rel*="icon"]');

	favicon.forEach((el) => {
		el.href = el.href.replace(/^http:/, 'https:'); // do not request http resources from https

		if (!isEligible(el.href)) return;

		el.href = assetify(el.href);
	});
};
