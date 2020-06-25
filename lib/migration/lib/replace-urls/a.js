const { isEligible, assetify, isAssetified } = require('./utils');

module.exports = (document) => {
	const a = document.querySelectorAll('a[href]');

	a.forEach(el => {

		if(el.href.indexOf('/Default.aspx?PageID')>-1){
			let pageID = el.href.split('?PageID=').pop().split('&')[0];
			let page = el.href.split('&Page=').pop().split('&')[0]
			el.href = `/default-${pageID}-${page}`
		}

		if (!isEligible(el.href)) return;

		if (/\/assets\//.test(el.href)) {
			el.href = assetify(el.href);
		}

		if (isAssetified(el.href)) return;

		el.href = el.href.replace(/^http:/, 'https:');
	});
};
