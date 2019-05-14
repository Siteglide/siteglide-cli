const notifier = require('node-notifier'),
	logger = require('./logger');

const shouldExit = error => {
	const endsWith = str => error.options.uri.endsWith(str);

	if (endsWith('cli/sync') || endsWith('/api/graph')) {
		return false;
	}

	return true;
};

const ServerError = {
	getDetails: errorDetails => {
		const details = Object.assign({}, errorDetails);
		return details;
	},

	unauthorized: error => {
		logger.Debug(`Unauthorized error: ${JSON.stringify(error, null, 2)}`);

		logger.Error(`[${error.statusCode}] ${error.error}`, { hideTimestamp: true });
	},

	internal: error => {
		logger.Debug(`Internal error: ${JSON.stringify(error, null, 2)}`);
		const message = error.error.error;
		let details = error.error.details;


		if (typeof details !== 'string') {
			details = JSON.stringify(ServerError.getDetails(details), null, 2);
		}

		notifier.notify({ title: 'Siteglide CLI Error', message: message });
		logger.Error(`[${error.statusCode}] ${message} \n ${details}`, { hideTimestamp: true, exit: shouldExit(error) });
	}
};

module.exports = ServerError;