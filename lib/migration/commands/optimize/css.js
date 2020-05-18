const glob = require("globby");
const CleanCSS = require("clean-css");

const getFile = require("../../lib/utils/get-file");
const saveFile = require("../../lib/utils/save-file");

const minify = ({ filePath, fileContent }) => {
	return {
		filePath,
		fileContent: new CleanCSS().minify(fileContent).styles,
	};
};


const run = async() => {
	const files = await glob([`**/*.css`, `!**/*.min.css`]);

	if (files.length === 0) {
		return console.log("No CSS to minify.");
	}

	files.map(getFile).map(minify).map(saveFile);

	console.log(`Minified ${files.length} CSS files.`);
}


module.exports = {
	run
};
