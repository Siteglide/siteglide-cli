/**
 * Environment host/classification helpers.
 * Keep behaviour aligned with Siteglide-MCP---Experimental/src/ops/security.js
 * (hostnameFromUrl, isStagingHostname, classifyEnvironment).
 */

/**
 * @param {string} url
 * @returns {string}
 */
function hostnameFromUrl(url) {
	if (!url || typeof url !== 'string') {
		return '';
	}
	try {
		const withProto = /^https?:\/\//i.test(url) ? url : `https://${url}`;
		return new URL(withProto).hostname.toLowerCase();
	} catch {
		return String(url)
			.replace(/^https?:\/\//i, '')
			.split('/')[0]
			.split(':')[0]
			.toLowerCase();
	}
}

/**
 * @param {string} host
 * @returns {boolean}
 */
function isStagingHostname(host) {
	if (!host) {
		return false;
	}
	const h = host.toLowerCase();
	if (h.includes('staging-siteglide.com') || h.endsWith('staging-siteglide.com')) {
		return true;
	}
	if (h.includes('.staging.oregon.platform-os.com')) {
		return true;
	}
	const extra = (process.env.SITEGLIDE_MCP_NONPROD_URL_SUFFIXES || '')
		.split(',')
		.map((s) => s.trim().toLowerCase())
		.filter(Boolean);
	for (const suffix of extra) {
		if (h === suffix || h.endsWith(suffix) || h.includes(suffix)) {
			return true;
		}
	}
	return false;
}

/**
 * @param {{ url?: string } | null | undefined} auth
 * @returns {'staging' | 'production'}
 */
function classifyEnvironment(auth) {
	const host = hostnameFromUrl(auth?.url || '');
	if (isStagingHostname(host)) {
		return 'staging';
	}
	return 'production';
}

/**
 * List environments from config (and optional MPKIT_* override), matching MCP envs_list shape.
 * @param {Record<string, { url?: string }>} settings
 * @param {{ details?: boolean }} [opts]
 * @returns {Array<{ name: string, host?: string, url?: string, classification?: string }>}
 */
function listEnvironments(settings, opts = {}) {
	const details = Boolean(opts.details);
	const env = process.env;

	if (env.MPKIT_URL && env.MPKIT_TOKEN && env.MPKIT_EMAIL) {
		const auth = { url: env.MPKIT_URL, email: env.MPKIT_EMAIL, token: env.MPKIT_TOKEN };
		const host = hostnameFromUrl(auth.url);
		const item = { name: '(MPKIT)', url: auth.url };
		if (details) {
			item.host = host;
			item.classification = classifyEnvironment(auth);
		}
		return [item];
	}

	return Object.keys(settings || {}).map((name) => {
		const entry = settings[name] || {};
		const url = entry.url || '';
		const item = { name, url };
		if (details) {
			item.host = hostnameFromUrl(url);
			item.classification = classifyEnvironment({ url });
		}
		return item;
	});
}

module.exports = {
	hostnameFromUrl,
	isStagingHostname,
	classifyEnvironment,
	listEnvironments
};
