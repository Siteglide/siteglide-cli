const jsdom = require('jsdom');
const { JSDOM } = jsdom;

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

		const dom = new JSDOM(fileContent);

		await updateImg(dom.window.document);
		await updateCSS(dom.window.document);
		await updateJS(dom.window.document);
		await updateA(dom.window.document);
		await updateForm(dom.window.document);
		await updateFavicon(dom.window.document);
		await saveFile.run({filePath, fileContent: dom.serialize()});
		var data = await updateYML(filePath,i);
		await dom.window.close();

		resolve({
			filePath,
			fileContent: data
		});
	})
};

module.exports = {
	run
};
