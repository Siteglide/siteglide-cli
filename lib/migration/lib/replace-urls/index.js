const jsdom = require("jsdom");
const { JSDOM } = jsdom;


const saveFile = require("../utils/save-file");
const updateImg = require('./img');
const updateCSS = require('./css');
const updateJS = require('./js');
const updateA = require('./a');
const updateForm = require('./form');
const updateFavicon = require('./favicon');
const updateYML = require('./yml');

module.exports = ({ filePath, fileContent }) => {
	const dom = new JSDOM(fileContent);

	updateImg(dom.window.document);
	updateCSS(dom.window.document);
	updateJS(dom.window.document);
	updateA(dom.window.document);
	updateForm(dom.window.document);
	updateFavicon(dom.window.document);
	saveFile({filePath, fileContent: dom.serialize()});
	var data = updateYML(filePath)

	return {
		filePath,
		fileContent: data
	};
};
