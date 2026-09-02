/** Include dot-directories such as `.agents` in deploy scans and archives. */
const DEPLOY_GLOB_OPTIONS = { dot: true };

/**
 * @param {import('glob').IOptions} [options]
 * @returns {import('glob').IOptions}
 */
const deployGlobOptions = (options = {}) => {
	return Object.assign({}, DEPLOY_GLOB_OPTIONS, options);
};

module.exports = {
	DEPLOY_GLOB_OPTIONS,
	deployGlobOptions
};
