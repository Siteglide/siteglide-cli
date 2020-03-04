// const axios = require('axios');
const fetch = require('node-fetch');

const getAsset = (path) => {
	var url = new URL('?v='+new Date().getTime(),path)
	asset = encodeURI(url.href);
	return new Promise(function (resolve) {
		fetch(asset).then(function (data) {
			resolve(data);
		}).catch(function (e) {
			console.log(e.message);
			resolve('error_missing_file');
		});
	});
}

module.exports = getAsset;