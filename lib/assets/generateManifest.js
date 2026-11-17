const fs = require('fs'),
	path = require('path'),
	files = require('../assets/files'),
	dir = require('../directories');

/**
 * API physical_file_path for a local asset file (site or module).
 * @param {string} file local path relative to cwd or absolute
 * @returns {string}
 */
function toManifestPhysicalFilePath(file) {
	let p = String(file).replace(/\\/g, '/');
	const cwd = process.cwd().replace(/\\/g, '/');
	if (p.startsWith(`${cwd}/`)) {
		p = p.slice(cwd.length + 1);
	}
	const siteRoot = dir.defaultSiteRoot();
	if (siteRoot && p.startsWith(`${siteRoot}/`)) {
		return p.slice(siteRoot.length + 1);
	}
	if (/^modules\/[^/]+\/(public|private)\/assets\//.test(p)) {
		return p;
	}
	if (siteRoot) {
		return p.replace(new RegExp(`^${siteRoot}/`), '');
	}
	return p;
}

const serializerManifestEntry = file => {
	const fileProperties = fs.statSync(file);
	const fileUpdatedAt = Math.floor(new Date(fileProperties['mtime']) / 1000);
	const fileSize = fileProperties['size'];
	return {
		physical_file_path: toManifestPhysicalFilePath(file),
		updated_at: fileUpdatedAt,
		file_size: fileSize
	};
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
	toManifestPhysicalFilePath,
	manifestGenerate: manifestGenerate,
	manifestGenerateForAssets: manifestGenerateForAssets
};
