const fs = require('fs');

module.exports = (filePath, i) => {
	return {
		filePath,
		fileContent: fs.readFileSync(filePath, 'utf8').toString(),
		i
	};
};
