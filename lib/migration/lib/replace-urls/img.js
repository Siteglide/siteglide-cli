const { isEligible, assetify } = require('./utils');

module.exports = ($) => {
	const img = $('img[src]');
	const imgData = $('img[data-src]');
	const imgDataMuse = $('img[data-muse-src]');
	const imgDataOrig = $('img[data-orig-src]');

	img.each((i,el) => {

		if (!isEligible(el.attribs.src)) return;

		el.attribs.src = assetify(el.attribs.src);

		el.attribs.src = el.attribs.src.replace(/^http:/, 'https:');
	});

	imgData.each((i,el) => {

		if (!isEligible(el.attribs['data-src'])) return;

		el.attribs['data-src'] = assetify(el.attribs['data-src']);

		el.attribs['data-src'] = el.attribs['data-src'].replace(/^http:/, 'https:');
	});

	imgDataMuse.each((i,el) => {

		if (!isEligible(el.attribs['data-muse-src'])) return;

		el.attribs['data-muse-src'] = assetify(el.attribs['data-muse-src']);

		el.attribs['data-muse-src'] = el.attribs['data-muse-src'].replace(/^http:/, 'https:');
	});

	imgDataOrig.each((i,el) => {

		if (!isEligible(el.attribs['data-orig-src'])) return;

		el.attribs['data-orig-src'] = assetify(el.attribs['data-orig-src']);

		el.attribs['data-orig-src'] = el.attribs['data-orig-src'].replace(/^http:/, 'https:');
	});
};