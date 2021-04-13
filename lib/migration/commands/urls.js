require("v8").setFlagsFromString('--expose_gc');
global.gc = require("vm").runInNewContext('gc');

const glob = require('globby');

const getFile = require('../lib/utils/get-file');
const saveFile = require('../lib/utils/save-file');
const replaceUrls = require('../lib/replace-urls');
const fs = require('fs-extra');

const run = async(params) => {

	let files = await glob('marketplace_builder/views/pages/**/*.html');

	try {
		for(var i=0;i<files.length;i++){
			await getFile.run(files[i], i, params)
			.then(async(file) => replaceUrls.run(file))
			.then(async(file) => saveFile.run(file))
			.catch((err) => console.log(err))
			if ( i && (i % 100 === 0)) {
				global.gc();
				await new Promise(resolve => setTimeout(resolve, 5000));
			}
		}
		console.log(`Updated urls in ${files.length} files.`);
	} catch (error) {
		console.log(`Error: ${error}`);
	}

	let museConfigPath = `${process.cwd()}/marketplace_builder/assets/scripts/museconfig.js`;
	try {
		if (fs.existsSync(museConfigPath)) {
			fs.readFile(museConfigPath, 'utf8', function (err,data) {
				var result = data.replace(/"\/?scripts\//g, '"/assets/scripts/');
				fs.writeFile(museConfigPath, result, 'utf8');
			});
		}
	} catch(err) {}

};


module.exports = {
	run
};
