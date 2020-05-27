const { isEligible, assetify } = require('./utils');

module.exports = (document) => {
	const js = document.querySelectorAll('script[src]');

	js.forEach((el) => {
		el.src = el.src.replace(/^http:/, 'https:'); // do not request http resources from https

		if (!isEligible(el.src)) return;

		el.src = assetify(el.src);
	});
};
