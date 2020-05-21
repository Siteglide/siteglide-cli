const notifier = require('node-notifier'),
	path = require('path'),
	logger = require('./logger');

const shouldExit = error => {
	const endsWith = str => error.options.uri.endsWith(str);

	if (endsWith('cli/sync') || endsWith('/api/graph')) {
		if(error.error.code!=='ENOTFOUND'){
			return false;
		}else{
			return true;
		}
	}

	return true;
};

const ServerError = {
	getDetails: errorDetails => {
		const details = Object.assign({}, errorDetails);
		return details;
	},

	connection: error => {
		logger.Debug(`Connection error: ${JSON.stringify(error, null, 2)}`);
		notifier.notify({
			title: 'Siteglide CLI Error',
			message: 'Connection error',
			icon: path.resolve(__dirname, './lib/siteglide-logo.png'),
			a: 'siteglide-cli'
		});
		logger.Error(`[Error] Connection error: ${error.error.errno} - ${error.error.syscall}\nIt looks like you are not connected to the internet `, { hideTimestamp: true, exit: shouldExit(error) });
	},

	unauthorized: error => {
		logger.Debug(`Unauthorized error: ${JSON.stringify(error, null, 2)}`);

		var errType = error.options.uri.split('/')[5];
		errType = errType.charAt(0).toUpperCase() + errType.slice(1);

		logger.Error(`[${error.statusCode}] ${errType} failed. Please check that you have the correct permissions or that your site is not locked.`, { hideTimestamp: true });
	},

	internal: error => {
		logger.Debug(`Internal error: ${JSON.stringify(error, null, 2)}`);
		const message = error.error.error;
		let details = error.error.details;


		if (typeof details !== 'string') {
			details = JSON.stringify(ServerError.getDetails(details), null, 2);
		}

		notifier.notify({ 
			title: 'Siteglide CLI Error',
			message: message,
			icon: path.resolve(__dirname, './lib/siteglide-logo.png'),
			a: 'siteglide-cli'
		});
		logger.Error(`[${error.statusCode}] ${message} \n ${details}`, { hideTimestamp: true, exit: shouldExit(error) });
	},

	deploy: error => {
		logger.Debug(`Deploy error: ${JSON.stringify(error, null, 2)}`);

		const message = error.error;
		let details = error.details;
		let file_path = details.file_path;

		if (typeof error.details !== 'string') {
			details = JSON.stringify(ServerError.getDetails(error.details), null, 2);
		}

		notifier.notify({
			title: 'Siteglide CLI Deploy Error',
			message: message,
			icon: path.resolve(__dirname, './lib/siteglide-logo.png'),
			a: 'siteglide-cli'
		 });
		logger.Error(`[Error Details] ${message} within file: ${file_path}`, { hideTimestamp: true, exit: false });
	}
};

module.exports = ServerError;