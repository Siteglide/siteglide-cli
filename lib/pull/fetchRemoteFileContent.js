/**
 * Fetch one file record from admin GraphQL for selective pull.
 */

const logger = require('../logger');
const { mapPathToResource } = require('../graphql/remoteMtimeQueries');
const { buildFileContentQuery } = require('../graphql/remoteFileContentQueries');

/**
 * @param {import('../proxy')} gateway
 * @param {string} query
 */
async function runGraph(gateway, query) {
	const res = await gateway.graph({ query });
	if (res && res.errors && res.errors.length) {
		logger.Debug(`[selective-pull] GraphQL errors: ${JSON.stringify(res.errors)}`);
		return null;
	}
	return res && res.data ? res.data : res;
}

/**
 * @param {import('../proxy')} gateway
 * @param {string} physicalPath
 * @returns {Promise<{ ok: false, reason: string } | { ok: true, kind: string, record: object, physicalPath: string, updatedAt: string | null }>}
 */
async function fetchRemoteFileContent(gateway, physicalPath) {
	const mapped = mapPathToResource(physicalPath);
	if (!mapped) {
		return { ok: false, reason: 'unmapped_path' };
	}
	const query = buildFileContentQuery(physicalPath);
	if (!query) {
		return { ok: false, reason: 'no_query' };
	}
	const data = await runGraph(gateway, query);
	const items = data && data.result && (data.result.items || data.result.results);
	if (!items || !items.length) {
		return { ok: false, reason: 'not_found' };
	}
	const record = items[0];
	return {
		ok: true,
		kind: mapped.kind,
		record,
		physicalPath: record.physical_file_path || physicalPath,
		updatedAt: record.updated_at || null
	};
}

module.exports = {
	fetchRemoteFileContent,
	runGraph
};
