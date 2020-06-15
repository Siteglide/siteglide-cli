const fs = require('fs');

const run = (filePath, i) => {
	return new Promise((resolve) => {
		resolve({
			filePath,
			fileContent: fs.readFileSync(filePath, 'utf8').toString(),
			i
		});
	});
};


module.exports = {
	run
};
