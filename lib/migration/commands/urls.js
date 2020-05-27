const glob = require('globby');

const getFile = require('../lib/utils/get-file');
const saveFile = require('../lib/utils/save-file');
const replaceUrls = require('../lib/replace-urls');

const run = async() => {

	let files = await glob('marketplace_builder/views/pages/**/*.html');

	try {
		files.map(getFile).map(replaceUrls).map(saveFile);
		console.log(`Updated urls in ${files.length} files.`);
	} catch (error) {
		console.log(`Error: ${error}`);
	}
};


module.exports = {
	run
};
