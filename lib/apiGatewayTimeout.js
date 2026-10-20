/**
 * Siteglide API (Heroku) returns 503 `{ error: 'timeout' }` when a handler exceeds ~25s.
 */

/**
 * @param {Error & { statusCode?: number, error?: { error?: string } }} error
 * @returns {boolean}
 */
function isSiteglideApiTimeout(error) {
	return (
		error
		&& error.name === 'StatusCodeError'
		&& error.statusCode === 503
		&& error.error
		&& typeof error.error === 'object'
		&& error.error.error === 'timeout'
	);
}

/**
 * @param {Error & { response?: { headers?: Record<string, string> } }} error
 * @returns {string|undefined}
 */
function requestIdFromError(error) {
	const headers = error.response && error.response.headers;
	if (!headers) {
		return undefined;
	}
	return headers['x-request-id'] || headers['X-Request-ID'];
}

module.exports = {
	isSiteglideApiTimeout,
	requestIdFromError
};
