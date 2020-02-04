const axios = require('axios');

const getAsset = (path) => {
	return new Promise(function (resolve) {
		axios({
			method: 'GET',
			url: path+'?v='+new Date().getTime()
		}).then(function (data) {
			resolve(data);
		}).catch(function () {
			resolve('error_missing_file');
		});
	});
}

module.exports = getAsset;