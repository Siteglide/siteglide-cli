const request = require('request-promise'),
	version = require('../package.json').version,
	logger = require('./logger'),
  errors = require('request-promise/errors'),
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

		const censored = Object.assign({}, headers, { Authorization: 'Token: <censored>' });
		logger.Debug(`Request headers: ${JSON.stringify(censored, null, 2)}`);
	}

	apiRequest({ method = 'GET', uri, formData, json = true, forever }) {
		logger.Debug(`[${method}] ${uri}`);
		return this.authorizedRequest({
			method,
			uri,
			formData,
			json,
			forever
		})
		.catch(errors.StatusCodeError, request => {
			if(request.error.code==='ENOTFOUND'){
				ServerError.connection(request);
			}
			switch(request.statusCode){
				case 500: case 503:
					ServerError.internal(request);
					break;
				case 404:
					ServerError.notFound(request);
					break;
				case 401:
					ServerError.unauthorized(request);
					break;
				default:
					ServerError.unauthorized(request);
			}
		});
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
		return this.apiRequest({ uri: `${this.api_url}/cli/logs`, json });
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

	migrate(json){
		return this.apiRequest({method: 'POST', uri: `${this.api_url}/cli/migrate`, json});
	}

	liquid(json) {
		return this.apiRequest({ method: 'POST', uri: `${this.api_url}/cli/liquid`, json, forever: true });
	}

	presign(json){
		return this.apiRequest({ method: 'POST', uri: `${this.api_url}/cli/presign`, json});
	}

	// importStart(formData) {
	// 	return this.apiRequest({ uri: `${this.api_url}/cli/import`, method: 'POST', formData });
	// }

	// importStatus(importId) {
	// 	return this.apiRequest({ uri: `${this.api_url}/cli/importStatus/${importId}` });
	// }

}

module.exports = Gateway;
