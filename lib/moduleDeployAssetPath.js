/**
 * Paths under modules/<name>/{public|private}/assets/ — deployed via S3 assets.zip (-w), never release.zip.
 * @param {string} relativePath path within the module directory (public/... or private/...)
 * @returns {boolean}
 */
const isModuleDeployAssetPath = (relativePath) => {
	const unix = relativePath.replace(/\\/g, '/');
	return unix.startsWith('public/assets/') || unix.startsWith('private/assets/');
};

module.exports = {
	isModuleDeployAssetPath
};
