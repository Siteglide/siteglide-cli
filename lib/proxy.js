const fetch = require('node-fetch'),
	version = require('../package.json').version,
	logger = require('./logger'),
	ServerError = require('./ServerError'),
	FormData = require('form-data');

class Gateway {
	constructor({ url, token, email }) {
		this.url = url;
		this.api_url = 'http://localhost:3000/api-staging';
		this.private_api_url = `${url}/api/private`;
		this.token = token;
		this.email = email;
	}

	apiRequest({ method = 'GET', uri, formData, json = true}) {

		var headers = {
			Authorization: `${this.token}`,
			'User-Agent': `siteglide_cli/${version}`,
			'Content-type': 'application/json',
			From: this.email,
			site: this.url
		};

		const censored = Object.assign({}, headers, { Authorization: 'Token: <censored>' });
		logger.Debug(`Request headers: ${JSON.stringify(censored, null, 2)}`);
		var body = null;

		if(json&&method!=='GET'){
			body = JSON.stringify(json);
		}
		if(formData){
			var form = new FormData();
			Object.keys(formData).forEach(function(k){
				form.append(k,formData[k])
			});
			body = form;
		}

		logger.Debug(`[${method}] ${uri}`);
		return fetch(uri,{
			headers,
			method,
			body
		})
		.then(async function(res){
			if(json){
				return await res.json();
			}else{
				return res;
			}
		})
		.catch({ statusCode: 500 }, ServerError.internal)
		.catch({ statusCode: 401 }, ServerError.unauthorized)
		.catch({ statusCode: 422 }, ServerError.unauthorized);
	}

	export(exportInternalIds) {
		const json = { 'export_internal': exportInternalIds };
		return this.apiRequest({ method: 'POST', uri: `${this.api_url}/cli/export`, json });
	}

	exportStatus(exportId) {
		return this.apiRequest({ uri: `${this.api_url}/cli/exportStatus/${exportId}` });
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
		return this.apiRequest({ method: 'POST', uri: `${this.api_url}/cli/graph`, json });
	}

	sendManifest(manifest) {
		return this.apiRequest({ method: 'POST', uri: `${this.api_url}/cli/assets_manifest`, json: { manifest } });
	}

	sync(formData) {
		return this.apiRequest({ method: 'PUT', uri: `${this.api_url}/cli/sync`, formData });
	}

	pull() {
		return this.apiRequest({ uri: `${this.api_url}/cli/pull` });
	}

	pullZip(formData = {}) {
		return this.apiRequest({ method: 'POST', uri: `${this.api_url}/cli/backup`, formData})
	}

	pullZipStatus(backupId) {
		return this.apiRequest({ uri: `${this.api_url}/cli/backupStatus/${backupId}` })
	}

	push(formData) {
		return this.apiRequest({ method: 'POST', uri: `${this.api_url}/cli/deploy`, formData });
	}

	delete(formData) {
		return this.apiRequest({ method: 'DELETE', uri: `${this.api_url}/cli/sync`, formData });
	}

	// importStart(formData) {
	// 	return this.apiRequest({ uri: `${this.api_url}/cli/import`, method: 'POST', formData });
	// }

	// importStatus(importId) {
	// 	return this.apiRequest({ uri: `${this.api_url}/cli/importStatus/${importId}` });
	// }

}

module.exports = Gateway;
