const fs = require('fs');

module.exports = ({ filePath, fileContent, input, output }) => {
	let outputPath = filePath; // by default, override the same file
	if (input && output) { // save to a different location
		outputPath = filePath.replace(input, output);
	}
	fs.writeFileSync(outputPath, fileContent);
	return { filePath, fileContent };
};
