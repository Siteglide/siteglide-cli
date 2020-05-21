const fetch = require('node-fetch');

const getBinary = (path,time) => {
	var url = new URL(time,path);
	return new Promise(function (resolve) {
		fetch(url.href, {timeout: 0})
			.then(res => res.text())
			.then(data => resolve(data))
			.catch(() => resolve('error_missing_file'));
	});
};

module.exports = getBinary;