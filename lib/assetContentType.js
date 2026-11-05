'use strict';

let mimeModulePromise;

const loadMime = () => {
	if (!mimeModulePromise) {
		mimeModulePromise = import('mime').then((mod) => mod.default || mod);
	}
	return mimeModulePromise;
};

/**
 * MIME type for a local asset path (CDN presign + S3 upload). Uses the same `mime` package as pos-cli.
 * @param {string} filePath
 * @returns {Promise<string|null>}
 */
const getAssetContentType = async (filePath) => {
	const mime = await loadMime();
	return mime.getType(filePath);
};

/**
 * Params for presign-url (deploy assets zip). contentType is null when unknown — forwarded as JSON null to /cli/presign.
 * @param {string} localPath
 * @param {string} s3FileName
 * @returns {Promise<{ fileName: string, contentLength: number, contentType: string|null }>}
 */
const buildPresignUrlParams = async (localPath, s3FileName) => {
	const fs = require('fs');
	return {
		fileName: s3FileName,
		contentLength: fs.statSync(localPath)['size'],
		contentType: await getAssetContentType(localPath)
	};
};

module.exports = {
	getAssetContentType,
	buildPresignUrlParams,
	loadMime
};
