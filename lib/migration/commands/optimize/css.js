const glob = require('globby');
const CleanCSS = require('clean-css');

const getFile = require('../../lib/utils/get-file');
const saveFile = require('../../lib/utils/save-file');

const minify = ({ filePath, fileContent }) => {
	return {
		filePath,
		fileContent: new CleanCSS({ inline: false }).minify(fileContent).styles,
	};
};


const run = async() => {
	const files = await glob(['**/*.css', '!**/*.min.css']);

	if (files.length === 0) {
		return console.log('No CSS to minify.');
	}

	for(var i=0;i<files.length;i++){
		await getFile.run(files[i], i)
		.then(async(file) => minify(file))
		.then(async(file) => saveFile.run(file))
	}

	console.log(`Minified ${files.length} CSS files.`);
};


module.exports = {
	run
};
