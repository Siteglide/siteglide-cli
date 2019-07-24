const request = require('request-promise'),
	version = require('../package.json').version,
	logger = require('./logger'),
	ServerError = require('./ServerError');

class Gateway {
	constructor({ url, token, email }) {
		this.url = url;
		this.api_url = 'https://api.siteglide.co.uk/api';
		this.private_api_url = `${url}/api/private`;

		const headers = {
			Authorization: `${token}`,
			'User-Agent': `siteglide_cli/${version}`,
			From: email,
			site: url
		};

		this.authorizedRequest = request.defaults({ headers });

		logger.Debug(`Request headers: ${JSON.stringify(headers, null, 2)}`);
	}

	apiRequest({ method = 'GET', uri, formData, json = true }) {
		logger.Debug(`[${method}] ${uri}`);
		return this.authorizedRequest({
			method,
			uri,
			formData,
			json: json
		})
			.catch({ statusCode: 500 }, ServerError.internal)
			.catch({ statusCode: 401 }, ServerError.unauthorized);
	}

	ping() {
		return this.apiRequest({ uri: `${this.api_url}/cli/ping` });
	}

	logs(json) {
		return this.apiRequest({ uri: `${this.api_url}/cli/logs`, json });
	}

	graph(json) {
		return this.apiRequest({ method: 'POST', uri: `${this.api_url}/cli/graph`, json });
	}

	sync(formData) {
		logger.Debug(formData);
		return this.apiRequest({ method: 'PUT', uri: `${this.api_url}/cli/sync`, formData });
	}

	pull() {
		return this.apiRequest({ uri: `${this.api_url}/cli/pull` });
	}

}

module.exports = Gateway;
