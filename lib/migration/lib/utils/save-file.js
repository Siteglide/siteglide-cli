const fs = require('fs');

const run = ({ filePath, fileContent, input, output }) => {
	return new Promise((resolve) => {
		let outputPath = filePath; // by default, override the same file
		if (input && output) { // save to a different location
			outputPath = filePath.replace(input, output);
		}
		fs.writeFileSync(outputPath, fileContent);
		resolve ({
			filePath,
			fileContent
		});
	});
};

module.exports = {
	run
};