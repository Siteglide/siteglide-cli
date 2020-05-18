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
}

const _isAssetified = url => {
	return /.*{{.*}}.*/.test(url);
}

const isEligible = url => {
	return !_isAbsolute(url) && !_isAssetified(url)
}

const getAssetPath = (url) => {
	return url
		.replace(/^\//, '')
		.split(/\d*\/assets\//) // ../../../assets/instances/106/assets/images/favicon.ico -> images/favicon.ico
		.pop()
};

const assetify = (url) => {
	const assetPath = getAssetPath(url);
	return `{{ '${assetPath}' | asset_url }}`;
};

module.exports = {
	isEligible,
	getAssetPath,
	assetify
}
