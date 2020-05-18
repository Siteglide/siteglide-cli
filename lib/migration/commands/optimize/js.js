const glob = require("globby");
const Terser = require("terser");

const getFile = require("../../lib/utils/get-file");
const saveFile = require("../../lib/utils/save-file");

const minify = ({ filePath, fileContent }) => {
	return {
		filePath,
		fileContent: Terser.minify(fileContent).code,
	};
};

const run = async() => {
	const files = await glob([`**/*.js`, `!**/*.min.js`]);

	if (files.length === 0) {
		return console.log("No JS to minify.");
	}

	files.map(getFile).map(minify).map(saveFile);

	console.log(`Minified ${files.length} JS files.`);
}


module.exports = {
	run
};
