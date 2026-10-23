const logger = require('./logger');
const { isCliDebug } = require('./cliDebug');

const isDeployUri = uri => typeof uri === 'string' && /\/cli\/(deploy|status|assets_manifest|presign)/.test(uri);

const deployDebug = (label, data) => {
	if (!isCliDebug()) {
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
