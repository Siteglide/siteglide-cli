const cheerio = require('cheerio');

const saveFile = require('../utils/save-file');
const updateImg = require('./img');
const updateCSS = require('./css');
const updateJS = require('./js');
const updateA = require('./a');
const updateForm = require('./form');
const updateFavicon = require('./favicon');
const updateYML = require('./yml');

const run = ({ filePath, fileContent, i }) => {
	return new Promise(async (resolve) => {

		const $ = cheerio.load(fileContent, { decodeEntities: false})

		await updateImg($);
		await updateCSS($);
		await updateJS($);
		await updateA($);
		await updateForm($);
		await updateFavicon($);
		await saveFile.run({filePath, fileContent: $.html()});
		var data = await updateYML(filePath,i);

		resolve({
			filePath,
			fileContent: data
		});
	})
};

module.exports = {
	run
};
