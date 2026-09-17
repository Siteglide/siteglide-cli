const { apiRequest: httpRequest } = require('./apiRequest'),
	version = require('../package.json').version,
	logger = require('./logger'),
	ServerError = require('./ServerError'),
	{ deployDebug, isDeployUri } = require('./deployDebug');

class Gateway {
	constructor({ url, token, email }) {
		this.url = url;
		this.api_url = 'https://api.siteglide.co.uk/api';
		this.private_api_url = `${url}/api/private`;

		this.headers = {
			Authorization: `${token}`,
			'User-Agent': `siteglide_cli/${version}`,
			From: email,
			site: url
		};

		const censored = Object.assign({}, this.headers, { Authorization: 'Token: <censored>' });
		logger.Debug(`Request headers: ${JSON.stringify(censored, null, 2)}`);
	}

	async apiRequest({ method = 'GET', uri, formData, json = true, forever }) {
		try {
			return await httpRequest({
				method,
				uri,
				formData,
				json,
				forever,
				headers: this.headers
			});
		} catch (error) {
			if (isDeployUri(uri)) {
				deployDebug('request failed', `${error.name} ${error.statusCode || ''} ${error.message}`.trim());
			}

			if (error.name === 'RequestError') {
				if (ServerError.getNetworkErrorCode(error) === 'ENOTFOUND') {
					ServerError.connection(error);
				}
				throw error;
			}

			if (error.name === 'StatusCodeError') {
				switch (error.statusCode) {
					case 500: case 503:
						ServerError.internal(error);
						break;
					case 404:
						ServerError.notFound(error);
						break;
					case 401:
						ServerError.unauthorized(error);
						break;
					default:
						ServerError.unauthorized(error);
				}
			}

			throw error;
		}
	}

	export(exportInternalIds, csv) {
		const formData = { 'export_internal': exportInternalIds, 'csv': csv.toString() };
		return this.apiRequest({ uri: `${this.api_url}/cli/export`, method: 'POST', formData });
	}

	exportStatus(exportId, csv) {
		const formData = { 'csv': csv.toString() };
		return this.apiRequest({ uri: `${this.api_url}/cli/exportStatus/${exportId}`, formData});
	}

	ping() {
		return this.apiRequest({ uri: `${this.api_url}/cli/ping` });
	}

	logs(json) {
		return this.apiRequest({ uri: `${this.api_url}/cli/logs?last_id=${json.lastId}`, json, forever: true });
	}

	getInstance() {
		return this.apiRequest({ uri: `${this.api_url}/cli/instance` });
	}

	getStatus(id) {
		return this.apiRequest({ uri: `${this.api_url}/cli/status/${id}` });
	}

	graph(json) {
		return this.apiRequest({ method: 'POST', uri: `${this.api_url}/cli/graph`, json, forever: true });
	}

	sendManifest(manifest) {
		return this.apiRequest({ method: 'POST', uri: `${this.api_url}/cli/assets_manifest`, json: { manifest } });
	}

	sync(formData) {
		return this.apiRequest({ method: 'PUT', uri: `${this.api_url}/cli/sync`, formData, forever: true });
	}

	pull() {
		return this.apiRequest({ uri: `${this.api_url}/cli/pull` });
	}

	pullZip(formData = {}) {
		return this.apiRequest({ method: 'POST', uri: `${this.api_url}/cli/backup`, formData });
	}

	pullZipStatus(backupId) {
		return this.apiRequest({ uri: `${this.api_url}/cli/backupStatus/${backupId}` });
	}

	push(formData) {
		return this.apiRequest({ method: 'POST', uri: `${this.api_url}/cli/deploy`, formData });
	}

	delete(formData) {
		return this.apiRequest({ method: 'DELETE', uri: `${this.api_url}/cli/sync`, formData, forever: true });
	}

	liquid(json) {
		return this.apiRequest({ method: 'POST', uri: `${this.api_url}/cli/liquid`, json, forever: true });
	}

	presign(json){
		return this.apiRequest({ method: 'POST', uri: `${this.api_url}/cli/presign`, json});
	}

	listModules() {
		return this.apiRequest({ uri: `${this.api_url}/cli/list_modules` });
	}

	// importStart(formData) {
	// 	return this.apiRequest({ uri: `${this.api_url}/cli/import`, method: 'POST', formData });
	// }

	// importStatus(importId) {
	// 	return this.apiRequest({ uri: `${this.api_url}/cli/importStatus/${importId}` });
	// }

}

module.exports = Gateway;
