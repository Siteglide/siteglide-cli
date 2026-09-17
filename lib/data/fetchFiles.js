const fs = require('fs'),
	url = require('url'),
	path = require('path'),
	{ Readable } = require('stream'),
	{ pipeline } = require('stream/promises'),
	shell = require('shelljs'),
	logger = require('./../logger');

const download = async (uri, filename) => {
	const response = await fetch(uri);

	if (!response.ok) {
		const error = new Error(`Download failed with HTTP ${response.status}`);
		error.statusCode = response.status;
		throw error;
	}

	await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(filename));
	return filename;
};

const filenameForUrl = uri => {
	return path.basename(url.parse(uri).pathname);
};

const updateItem = (item, newUrl) => {
	return { url: newUrl, name: item.name };
};

async function fetchFiles(model) {
	const fields = ['attachments', 'images'];
	for (let itemsField of fields) {
		const items = await Promise.all(
			(model[itemsField] || []).filter(item => !!item.url).map(item => {
				const filename = filenameForUrl(item.url);
				const dir = `.tmp/${itemsField}/${item.id}`;
				const tmpFilename = `${dir}/${filename}`;
				shell.mkdir('-p', dir);

				return download(item.url, tmpFilename)
					.then(newUrl => updateItem(item, newUrl))
					.catch(e => {
						logger.Warn(e.message);
						return updateItem(item, null);
					});
			})
		).catch(e => logger.Error(e.message));
		model[itemsField] = items;
	}
	return model;
}

module.exports = fetchFiles;
