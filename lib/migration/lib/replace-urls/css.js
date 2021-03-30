const { isEligible, assetify } = require('./utils');

module.exports = ($) => {
	const css = $('link[rel="stylesheet"]');
	const cssCamel = $('link[rel="StyleSheet"]'); //Support for BC Module Stlyesheets file

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
