const { isEligible, assetify, isAssetified } = require('./utils');

module.exports = ($) => {
	const a = $('a[href]');

	a.each((i,el) => {

		if(el.attribs.href.indexOf('/Default.aspx?PageID')>-1){
			let pageID = el.attribs.href.split('?PageID=').pop().split('&')[0];
			let page = el.attribs.href.split('&Page=').pop().split('&')[0]
			el.attribs.href = `/default-${pageID}-${page}`
		}

		if (!isEligible(el.attribs.href)) return;

		if (/\/assets\//.test(el.attribs.href)) {
			el.attribs.href = assetify(el.attribs.href);
		}

		el.attribs.href = el.attribs.href.replace(/^http:/, 'https:');
	});
};
