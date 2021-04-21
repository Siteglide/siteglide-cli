const _isAbsolute = url => {
	// Don't match Windows paths `c:\`
	if (/^[a-zA-Z]:\\/.test(url)) {
		return false;
	}

	// Schemaless urls, popular in recent years, ex. //example.com/x.txt
	if (/^\/\/.*/.test(url)) {
		return true;
	}

	// Scheme: https://tools.ietf.org/html/rfc3986#section-3.1
	// Absolute URL: https://tools.ietf.org/html/rfc3986#section-4.3
	return /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(url);
};

const isAssetified = url => {
	return /.*{{.*}}.*/.test(url);
};

const isEligible = url => {
	if(!url) {
		return false
	}else{
		return !_isAbsolute(url) && !isAssetified(url);
	}
};

const getAssetPath = (url) => {
	if(url){
		url = url
			.replace(/^\//, '')
			.replace(/\.\.\//g,'');

		if(url.indexOf('assets/')===0){
			url=url.replace('assets/','');
		}
		return url;
	}
};

const assetify = (url) => {
	const assetPath = getAssetPath(url);
	return `{{ '${assetPath}' | asset_url }}`;
};

module.exports = {
	isEligible,
	getAssetPath,
	assetify,
	isAssetified
};
