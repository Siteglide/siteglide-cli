const logger = require('./logger');

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
		logger.Error(`[Error] Connection error: ${error.error.errno} - ${error.error.syscall}\nIt looks like you are not connected to the internet `, { hideTimestamp: true, exit: shouldExit(error) });
	},

	notFound: error => {
		logger.Debug(`NotFound error: ${JSON.stringify(error, null, 2)}`);

		var errType = error.options.uri.split('/')[5];
		errType = errType.charAt(0).toUpperCase() + errType.slice(1);

		logger.Error(`[${error.statusCode}] ${errType==='Ping' ? 'Command' : errType} failed. Cannot find a site with the URL: ${error.options.headers.site}, please check your .siteglide-config file. ${error.options.headers.site.includes('.staging.oregon.platform-os.com') ? 'If your site is now live you will need to re-add the coniguration with the platform production URL' : ''}`, { hideTimestamp: true });
	},

	unauthorized: error => {
		logger.Debug(`Unauthorized error: ${JSON.stringify(error, null, 2)}`);

		var errType = error.options.uri.split('/')[5];
		errType = errType.charAt(0).toUpperCase() + errType.slice(1);

		logger.Error(`[${error.statusCode}] ${errType==='Ping' ? 'Command' : errType} failed. Please check that you have the correct permissions and your site is not locked or creating.`, { hideTimestamp: true });
	},

	internal: error => {
		logger.Debug(`Internal error: ${JSON.stringify(error, null, 2)}`);
		const message = error.error.error;

		var errType = error.options.uri.split('/')[5];
		errType = errType.charAt(0).toUpperCase() + errType.slice(1);
		logger.Error(`[${error.statusCode}] ${errType==='Ping' ? 'Command' : errType} failed. An internal server error has occured. If this continues, please check our status page https://uptime.siteglide.com`, { hideTimestamp: true, exit: true });
	},

	deploy: error => {
		logger.Debug(`Deploy error: ${JSON.stringify(error, null, 2)}`);

		const message = error.error;
		let details = error.details;
		let file_path = details.file_path;

		if (typeof error.details !== 'string') {
			details = JSON.stringify(ServerError.getDetails(error.details), null, 2);
		}
		logger.Error(`[Error Details] ${message} within file: ${file_path}`, { hideTimestamp: true, exit: false });
	}
};

module.exports = ServerError;