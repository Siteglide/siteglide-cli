const fetch = require('node-fetch');

const getAsset = (path,time) => {
	var url = new URL(time,path)
	return new Promise(function (resolve) {
		fetch(url.href, {timeout: 0}).then(function (data) {
			resolve(data);
		}).catch(function (e) {
			resolve('error_missing_file');
		});
	});
}

module.exports = getAsset;