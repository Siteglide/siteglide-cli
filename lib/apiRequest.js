const fs = require('fs');
const path = require('path');
const mime = require('mime-types');
const logger = require('./logger');
const { deployDebug, isDeployUri } = require('./deployDebug');

const appendQuery = (uri, params) => {
	const url = new URL(uri);
	Object.entries(params).forEach(([key, value]) => {
		if (value !== undefined && value !== null) {
			url.searchParams.append(key, String(value));
		}
	});
	return url.toString();
};

const buildFormData = (formData, requestUri) => {
	const form = new FormData();

	Object.entries(formData).forEach(([key, value]) => {
		if (value === undefined || value === null) {
			return;
		}

		if (value && typeof value === 'object' && typeof value.path === 'string') {
			const stats = fs.statSync(value.path);
			const filename = path.basename(value.path);
			const contentType = mime.lookup(filename) || 'application/octet-stream';

			if (isDeployUri(requestUri)) {
				deployDebug(`upload ${key}`, `${filename}, ${stats.size} bytes, ${contentType}`);
			}

			const fileBuffer = fs.readFileSync(value.path);
			form.append(key, new Blob([fileBuffer], { type: contentType }), filename);
		} else if (Buffer.isBuffer(value)) {
			form.append(key, new Blob([value]));
		} else {
			form.append(key, String(value));
		}
	});

	return form;
};

const parseJsonResponse = async (response, requestUri) => {
	const text = await response.text();

	if (!text) {
		return {};
	}

	try {
		return JSON.parse(text);
	} catch (parseError) {
		if (isDeployUri(requestUri)) {
			deployDebug('JSON parse failed', parseError.message);
		}
		return text;
	}
};

const apiRequest = async ({ method = 'GET', uri, body, headers = {}, formData, json = true, qs, forever, signal }) => {
	let requestUri = uri;

	if (qs) {
		requestUri = appendQuery(requestUri, qs);
	}

	if (formData && ['GET', 'HEAD'].includes(method.toUpperCase())) {
		requestUri = appendQuery(requestUri, formData);
	}

	logger.Debug(`[${method}] ${requestUri}`);

	const fetchOptions = {
		method,
		headers: { ...headers }
	};

	if (signal) {
		fetchOptions.signal = signal;
	}

	if (formData && !['GET', 'HEAD'].includes(method.toUpperCase())) {
		fetchOptions.body = buildFormData(formData, requestUri);
	} else if (body !== undefined) {
		fetchOptions.headers['Content-Type'] = 'application/json';
		fetchOptions.body = JSON.stringify(body);
	} else if (json && typeof json === 'object' && !['GET', 'HEAD'].includes(method.toUpperCase())) {
		fetchOptions.headers['Content-Type'] = 'application/json';
		fetchOptions.body = JSON.stringify(json);
	}

	if (forever) {
		fetchOptions.keepalive = true;
	}

	let response;

	try {
		response = await fetch(requestUri, fetchOptions);
	} catch (e) {
		const error = new Error(e.message);
		error.name = 'RequestError';
		error.cause = e;
		error.options = { uri: requestUri, headers };
		throw error;
	}

	if (!response.ok) {
		const errorBody = await response.text();

		if (isDeployUri(requestUri)) {
			deployDebug(`HTTP ${response.status}`, errorBody.slice(0, 500));
		}

		const error = new Error(`Request failed with status ${response.status}`);
		error.name = 'StatusCodeError';
		error.statusCode = response.status;
		error.options = { uri: requestUri, headers };
		error.response = {
			statusCode: response.status,
			body: errorBody,
			headers: Object.fromEntries(response.headers.entries())
		};

		try {
			error.error = JSON.parse(errorBody);
			error.response.body = error.error;
		} catch {
			error.error = errorBody;
		}

		throw error;
	}

	if (json) {
		return parseJsonResponse(response, requestUri);
	}

	return response.text();
};

module.exports = { apiRequest };
