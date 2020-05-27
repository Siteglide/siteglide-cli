const fetch = require('node-fetch');

const getAsset = (path,time) => {
	var url = new URL(time,path);
	return new Promise(function (resolve) {
		fetch(url.href, {timeout: 0})
			.then(data => resolve(data))
			.catch(() => resolve('error_missing_file'));
	});
};

module.exports = getAsset;