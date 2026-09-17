const fs = require('fs-extra');
const path = require('path');
const dir = require('../../lib/directories');

/** Remote/local path under site root (no marketplace_builder/ prefix). */
const SYNC_API_PATH = 'views/pages/_siteglide_cli_integration.liquid';

/**
 * @param {unknown} body
 * @returns {object|string|unknown}
 */
const normalizeSyncBody = (body) => {
	if (Array.isArray(body) && typeof body[0] === 'string') {
		try {
			return JSON.parse(body[0]);
		} catch {
			return body[0];
		}
	}

	return body;
};

/**
 * Sync a disposable integration page via Gateway.sync (stream body, same as watch).
 * Updates a marker comment, asserts success, leaves the page on the test site.
 *
 * @param {import('../../lib/proxy')} gateway
 * @param {string} projectPath
 */
const syncIntegrationPageRoundTrip = async (gateway, projectPath) => {
	const siteRoot = dir.getSiteRoot(projectPath) || dir.SITE_ROOT;
	const localPath = path.join(projectPath, siteRoot, SYNC_API_PATH);
	const marker = `siteglide-cli-integration-${Date.now()}`;
	const content = `---
slug: siteglide-cli-integration
---
{% comment %} ${marker} {% endcomment %}`;

	await fs.ensureDir(path.dirname(localPath));
	await fs.writeFile(localPath, content, 'utf8');

	const body = await gateway.sync({
		path: SYNC_API_PATH,
		marketplace_builder_file_body: fs.createReadStream(localPath)
	});

	const normalized = normalizeSyncBody(body);
	expect(normalized).toBeDefined();

	if (normalized && typeof normalized === 'object') {
		expect(normalized.error).toBeUndefined();
		expect(normalized.reason).toBeUndefined();
	}
};

module.exports = {
	SYNC_API_PATH,
	normalizeSyncBody,
	syncIntegrationPageRoundTrip
};
