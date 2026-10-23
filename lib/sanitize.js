/**
 * Replace credential values before anything is printed to the terminal.
 */

const SANITIZED = '<sanitized>';
const MAX_DEPTH = 10;

const SECRET_KEYS = new Set([
	'authorization',
	'proxyauthorization',
	'cookie',
	'setcookie',
	'token',
	'password',
	'pass',
	'secret',
	'apikey',
	'xapikey'
]);

/**
 * Header and field names are compared without case, `-` or `_`, so `Authorization`, `x-api-key` and `access_token` all match.
 * @param {string} key
 * @returns {boolean}
 */
const isSecretKey = (key) => {
	const normalised = String(key).toLowerCase().replace(/[-_]/g, '');
	return SECRET_KEYS.has(normalised)
		|| normalised.endsWith('token')
		|| normalised.endsWith('secret')
		|| normalised.endsWith('password');
};

/**
 * Deep copy with every credential value replaced by `<sanitized>`. An Error becomes a plain object carrying its name and message,
 * since `JSON.stringify` of an Error drops both.
 * @param {unknown} value
 * @returns {unknown}
 */
const sanitizeSecrets = (value) => {
	const seen = new WeakSet();

	const walk = (current, depth) => {
		if (
			!current
			|| typeof current !== 'object'
		) {
			return current;
		}
		if (seen.has(current)) {
			return '[Circular]';
		}
		if (depth > MAX_DEPTH) {
			return '[Truncated]';
		}
		seen.add(current);

		if (Array.isArray(current)) {
			return current.map(item => walk(item, depth + 1));
		}

		const out = {};
		if (current instanceof Error) {
			out.name = current.name;
			out.message = current.message;
		}
		for (const [key, child] of Object.entries(current)) {
			if (
				isSecretKey(key)
				&& child !== undefined
				&& child !== null
				&& child !== ''
			) {
				out[key] = SANITIZED;
			} else {
				out[key] = walk(child, depth + 1);
			}
		}
		return out;
	};

	return walk(value, 0);
};

module.exports = {
	SANITIZED,
	isSecretKey,
	sanitizeSecrets
};
