const { isEligible, assetify } = require('./utils');

module.exports = ($) => {
	const js = $('script[src]');
	const jsData = $('script[data-main]');

	js.each((i,el) => {
		if (!isEligible(el.attribs.src)) return;

		el.attribs.src = assetify(el.attribs.src);
		el.attribs.src = el.attribs.src.replace(/^http:/, "https:");
	});

	jsData.each((i,el) => {
		if (!isEligible(el.attribs['data-main'])) return;

		el.attribs['data-main'] = assetify(el.attribs['data-main']);
		el.attribs['data-main'] = el.attribs['data-main'].replace(/^http:/, "https:");
	});
};
