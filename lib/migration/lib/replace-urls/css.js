const { isEligible, assetify } = require('./utils');

module.exports = ($, params) => {
	const css = $('link[rel="stylesheet"]');
	const cssCamel = $('link[rel="StyleSheet"]'); //Support for BC Module Stlyesheets file
	if(!params.muse){
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
	}else {
		css.each((i,el) => {
			if (!isEligible(el.attribs.href)) return;

			el.attribs.href = assetify(el.attribs.href);

			el.attribs.href = el.attribs.href.replace(/^http:/, 'https:');

		});
	}
};