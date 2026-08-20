const fs = require('fs'),
	files = require('../assets/files'),
	dir = require('../directories');

const serializerManifestEntry = file => {
	const siteRoot = dir.defaultSiteRoot();
	const fileProperties = fs.statSync(file);
	const fileUpdatedAt = Math.floor(new Date(fileProperties['mtime']) / 1000);
	const fileSize = fileProperties['size'];
	return { physical_file_path: file.replace(new RegExp(`^${siteRoot}/`), ''), updated_at: fileUpdatedAt, file_size: fileSize };
};

const manifestGenerate = async () => {
	const assets = await files.getAssets();
	return manifestGenerateForAssets(assets);
};

const manifestGenerateForAssets = (assets) => {
	const siteRoot = dir.defaultSiteRoot();
	let manifest = {};
	for (const file of assets) {
		const path = file.replace(new RegExp(`(public|private)/assets/|(${siteRoot})/assets/`), '');
		manifest[path] = serializerManifestEntry(file);
	}

	return manifest;
};

module.exports = {
	manifestGenerate: manifestGenerate,
	manifestGenerateForAssets: manifestGenerateForAssets
};
