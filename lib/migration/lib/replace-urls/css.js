const { isEligible, assetify } = require('./utils');

module.exports = ($, params) => {
	const css = $('link[rel="stylesheet"]');
	const cssCamel = $('link[rel="StyleSheet"]');
	css.each((i,el) => {

		if (!isEligible(el.attribs.href)) return;

		el.attribs.href = assetify(el.attribs.href);

		el.attribs.href = el.attribs.href.replace(/^http:/, 'https:');
	});

	cssCamel.each((i,el) => {

		if (!isEligible(el.attribs.href)) return;

		el.attribs.href = assetify(el.attribs.href);

		el.attribs.href = el.attribs.href.replace(/^http:/, 'https:');
	});
};