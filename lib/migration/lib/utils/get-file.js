const fs = require('fs');

const run = (filePath, i, params) => {
	return new Promise((resolve) => {
		resolve({
			filePath,
			fileContent: fs.readFileSync(filePath, 'utf8').toString(),
			i,
			params
		});
	});
};


module.exports = {
	run
};
