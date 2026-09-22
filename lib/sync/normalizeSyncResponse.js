/**
 * Normalize PUT /cli/sync response bodies when Siteglide returns an array of JSON strings.
 */

/**
 * @param {unknown} body
 * @returns {object|string|unknown}
 */
function normalizeSyncBody(body) {
	if (Array.isArray(body) && typeof body[0] === 'string') {
		try {
			return JSON.parse(body[0]);
		} catch {
			return body[0];
		}
	}

	return body;
}

module.exports = {
	normalizeSyncBody
};
