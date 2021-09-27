const { isEligible, assetify } = require('./utils');

module.exports = ($) => {
	const img = $('img[src]');
	const imgData = $('img[data-src]');
	const imgDataOrig = $('img[data-orig-src]');
	const imgDataHiDpi = $('img[data-hidpi-src]');

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

	imgDataOrig.each((i,el) => {

		if (!isEligible(el.attribs['data-orig-src'])) return;

		el.attribs['data-orig-src'] = assetify(el.attribs['data-orig-src']);

		el.attribs['data-orig-src'] = el.attribs['data-orig-src'].replace(/^http:/, 'https:');
	});

	imgDataHiDpi.each((i,el) => {

		if (!isEligible(el.attribs['data-hidpi-src'])) return;

		el.attribs['data-hidpi-src'] = assetify(el.attribs['data-hidpi-src']);

		el.attribs['data-hidpi-src'] = el.attribs['data-hidpi-src'].replace(/^http:/, 'https:');
	});


};