const logger = require('./logger');

const getNetworkErrorCode = (err, depth = 0) => {
	if (!err || depth > 5) {
		return null;
	}

	if (err.code) {
		return err.code;
	}

	if (err.error?.code) {
		return err.error.code;
	}

	return getNetworkErrorCode(err.cause, depth);
};

const normalizeDeployError = (payload) => {
	if (!payload) {
		return { message: 'Deployment failed' };
	}

	if (typeof payload === 'string') {
		try {
			return normalizeDeployError(JSON.parse(payload));
		} catch {
			return { message: payload };
		}
	}

	// Full status poll response: { status: 'error', error: { ... } }
	if (payload.status === 'error') {
		if (payload.error && typeof payload.error === 'object') {
			return normalizeDeployError(payload.error);
		}

		return {
			message: typeof payload.error === 'string' ? payload.error : 'Deployment failed',
			file_path: payload.details?.file_path || payload.details?.path,
			details: payload.details
		};
	}

	// Nested body from platformOS: { error: '...', details: { file_path: '...' } }
	if (typeof payload.error === 'string' || payload.details) {
		const details = payload.details;
		let file_path;

		if (details && typeof details === 'object') {
			file_path = details.file_path || details.path;
		}

		return {
			message: typeof payload.error === 'string' ? payload.error : JSON.stringify(payload.error || payload),
			file_path,
			details
		};
	}

	return {
		message: payload.message || JSON.stringify(payload),
		file_path: payload.file_path || payload.path,
		details: payload.details
	};
};

const shouldExit = error => {
	const endsWith = str => error.options.uri.endsWith(str);

	if (endsWith('cli/sync') || endsWith('/api/graph')) {
		if (getNetworkErrorCode(error) !== 'ENOTFOUND') {
			return false;
		} else {
			return true;
		}
	}

	return true;
};

const ServerError = {
	getNetworkErrorCode,

	getDetails: errorDetails => {
		const details = Object.assign({}, errorDetails);
		return details;
	},

	connection: error => {
		logger.Debug(`Connection error: ${JSON.stringify(error, null, 2)}`);
		const code = getNetworkErrorCode(error) || 'UNKNOWN';
		const systemError = error.cause?.cause || error.cause || error.error;
		const detail = systemError?.errno && systemError?.syscall
			? `${systemError.errno} - ${systemError.syscall}`
			: code;
		logger.Error(`[Error] Connection error: ${detail}\nIt looks like you are not connected to the internet `, { hideTimestamp: true, exit: shouldExit(error) });
	},

	notFound: error => {
		logger.Debug(`NotFound error: ${JSON.stringify(error, null, 2)}`);

		var errType = error.options.uri.split('/')[5];
		errType = errType.charAt(0).toUpperCase() + errType.slice(1);
		const site = error.options.headers?.site || '';

		logger.Error(`[${error.statusCode}] ${errType==='Ping' ? 'Command' : errType} failed. Cannot find a site with the URL: ${site}, please check your .siteglide-config file. ${site.includes('.staging.oregon.platform-os.com') || site.includes('.staging-siteglide.com') ? 'If your site is now live you will need to re-add the configuration with the production URL' : ''}`, { hideTimestamp: true });
	},

	unauthorized: error => {
		logger.Debug(`Unauthorized error: ${JSON.stringify(error, null, 2)}`);

		var errType = error.options.uri.split('/')[5];
		errType = errType.charAt(0).toUpperCase() + errType.slice(1);

		logger.Error(`[${error.statusCode}] ${errType==='Ping' ? 'Command' : errType} failed. Please check that you have the correct permissions and your site is not locked or creating.`, { hideTimestamp: true });
	},

	internal: error => {
		logger.Debug(`Internal error: ${JSON.stringify(error, null, 2)}`);

		var errType = error.options.uri.split('/')[5];
		errType = errType.charAt(0).toUpperCase() + errType.slice(1);
		logger.Error(`[${error.statusCode}] ${errType==='Ping' ? 'Command' : errType} failed. An internal server error has occured. If this continues, please check our status page https://uptime.siteglide.com`, { hideTimestamp: true, exit: true });
	},

	deploy: payload => {
		logger.Debug(`Deploy error: ${JSON.stringify(payload, null, 2)}`);

		const { message, file_path, details } = normalizeDeployError(payload);
		let output = `[Error Details] ${message}`;

		if (file_path) {
			output += `\nFile: ${file_path}`;
		}

		if (details) {
			if (typeof details === 'string') {
				if (details !== message) {
					output += `\n${details}`;
				}
			} else {
				output += `\n${JSON.stringify(ServerError.getDetails(details), null, 2)}`;
			}
		}

		logger.Error(output, { hideTimestamp: true, exit: false });
	}
};

module.exports = ServerError;
