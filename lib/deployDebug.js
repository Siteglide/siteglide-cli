const logger = require('./logger');

const isDeployUri = uri => typeof uri === 'string' && /\/cli\/(deploy|status|assets_manifest|presign)/.test(uri);

const deployDebug = (label, data) => {
	if (!process.env.DEBUG) {
		return;
	}

	if (data === undefined) {
		logger.Debug(`[deploy] ${label}`);
		return;
	}

	const body = typeof data === 'string' ? data : JSON.stringify(data);
	logger.Debug(`[deploy] ${label}: ${body}`);
};

module.exports = {
	deployDebug,
	isDeployUri
};
