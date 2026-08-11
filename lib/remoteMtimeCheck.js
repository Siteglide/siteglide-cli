/**
 * Compare remote file updated_at (via Gateway.graph) against local pull/deploy baselines.
 *
 * Modes:
 * - checkFile: one path before sync upload
 * - collectDeployPreConflicts: files updated since lastPulledAt, minus prior-deploy window
 * - collectDeployPostLeftovers: lastPulledAt < updated_at < deployedAt - grace
 */

const logger = require('./logger');
const {
	effectiveBaseline,
	readPullBaseline
} = require('./pullBaseline');
const {
	DEPLOY_GRACE_MS,
	DEPLOY_SCAN_FIELDS,
	mapPathToResource,
	toPhysicalApiPath,
	buildFileMtimeQuery,
	buildUpdatedSinceQuery
} = require('./graphql/remoteMtimeQueries');

/**
 * Parse a GraphQL JSONDate / ISO string to epoch ms.
 * @param {unknown} value
 * @returns {number | null}
 */
function parseRemoteDate(value) {
	if (value == null) {
		return null;
	}
	const ms = Date.parse(String(value));
	return Number.isNaN(ms) ? null : ms;
}

/**
 * Run one GraphQL query through Gateway; return data or null on soft failure.
 * @param {import('./proxy')} gateway
 * @param {string} query
 */
async function runGraph(gateway, query) {
	try {
		const res = await gateway.graph({ query });
		if (res && res.errors && res.errors.length) {
			logger.Debug(`[remote-mtime] GraphQL errors: ${JSON.stringify(res.errors)}`);
			return null;
		}
		return res && res.data ? res.data : res;
	} catch (err) {
		logger.Debug(`[remote-mtime] GraphQL request failed: ${err.message || err}`);
		return null;
	}
}

/**
 * Look up remote updated_at for one physical path.
 * @param {object} gateway
 * @param {string} physicalPath
 * @returns {Promise<{ found: boolean, updatedAt: string | null, kind: string | null }>}
 */
async function fetchRemoteFileMtime(gateway, physicalPath) {
	const mapped = mapPathToResource(physicalPath);
	if (!mapped) {
		return { found: false, updatedAt: null, kind: null, skipped: true };
	}
	const data = await runGraph(gateway, buildFileMtimeQuery(mapped.queryField, physicalPath));
	const items = data && data.result && (data.result.items || data.result.results);
	if (!items || !items.length) {
		return { found: false, updatedAt: null, kind: mapped.kind };
	}
	const body = items[0].content != null ? items[0].content : items[0].body;
	return {
		found: true,
		updatedAt: items[0].updated_at || null,
		kind: mapped.kind,
		physicalPath: items[0].physical_file_path || physicalPath,
		body: body != null ? String(body) : null
	};
}

/**
 * Check one local file path against effectiveBaseline before sync.
 *
 * @param {object} opts
 * @param {object} opts.gateway
 * @param {string} opts.environment
 * @param {string} opts.filePath local path
 * @param {string | null} opts.siteRoot
 * @param {string} [opts.cwd]
 * @returns {Promise<{ ok: true } | { ok: false, reason: string, conflict?: object, physicalPath: string }>}
 */
async function checkFile(opts) {
	const { gateway, environment, filePath, siteRoot, cwd } = opts;
	const physicalPath = toPhysicalApiPath(filePath, siteRoot);
	const mapped = mapPathToResource(physicalPath);
	if (!mapped) {
		logger.Debug(`[remote-mtime] skip unmapped path ${physicalPath}`);
		return { ok: true, skipped: true, physicalPath };
	}

	const floor = effectiveBaseline(environment, physicalPath, cwd);
	if (!floor.at) {
		return {
			ok: false,
			reason: 'missing_baseline',
			physicalPath,
			kind: mapped.kind,
			baseline: floor
		};
	}

	const remote = await fetchRemoteFileMtime(gateway, physicalPath);
	if (remote.skipped) {
		return { ok: true, skipped: true, physicalPath };
	}
	if (!remote.found || !remote.updatedAt) {
		// New remote path — safe to upload
		return { ok: true, physicalPath, remoteMissing: true };
	}

	const remoteMs = parseRemoteDate(remote.updatedAt);
	const floorMs = parseRemoteDate(floor.at);
	if (remoteMs != null && floorMs != null && remoteMs > floorMs) {
		return {
			ok: false,
			reason: 'remote_newer',
			physicalPath,
			kind: mapped.kind,
			remoteUpdatedAt: remote.updatedAt,
			effectiveBaselineAt: floor.at,
			baselineSource: floor.source
		};
	}

	return { ok: true, physicalPath };
}

/**
 * Page through updated_at > since for one resource type.
 * @param {object} gateway
 * @param {{ kind: string, queryField: string }} field
 * @param {string} sinceIso
 */
async function collectUpdatedSince(gateway, field, sinceIso) {
	const conflicts = [];
	let page = 1;
	const perPage = 50;
	for (;;) {
		const data = await runGraph(
			gateway,
			buildUpdatedSinceQuery(field.queryField, sinceIso, page, perPage)
		);
		if (!data || !data.result) {
			break;
		}
		const items = data.result.items || data.result.results || [];
		for (const item of items) {
			if (!item.physical_file_path) {
				continue;
			}
			conflicts.push({
				path: item.physical_file_path.replace(/\\/g, '/'),
				type: field.kind,
				remoteUpdatedAt: item.updated_at
			});
		}
		if (items.length < perPage) {
			break;
		}
		page += 1;
		if (page > 40) {
			break;
		}
	}
	return conflicts;
}

/**
 * Whether a hit is only from the previous deploy (path in manifest + time in grace).
 */
function isPriorDeploySelfHit(item, lastDeploy) {
	if (!lastDeploy || !lastDeploy.deployedAt || !Array.isArray(lastDeploy.paths)) {
		return false;
	}
	if (!lastDeploy.paths.includes(item.path)) {
		return false;
	}
	const deployMs = parseRemoteDate(lastDeploy.deployedAt);
	const remoteMs = parseRemoteDate(item.remoteUpdatedAt);
	if (deployMs == null || remoteMs == null) {
		return false;
	}
	return Math.abs(remoteMs - deployMs) <= DEPLOY_GRACE_MS ||
		(remoteMs >= deployMs - DEPLOY_GRACE_MS && remoteMs <= deployMs + DEPLOY_GRACE_MS);
}

/**
 * Deploy pre-check: remotes newer than lastPulledAt, ignoring prior-deploy window hits.
 * @returns {Promise<{ ok: boolean, reason?: string, conflicts: object[], baseline: object | null }>}
 */
async function collectDeployPreConflicts(gateway, environment, cwd = process.cwd()) {
	const baseline = readPullBaseline(environment, cwd);
	if (!baseline || !baseline.lastPulledAt) {
		return { ok: false, reason: 'missing_baseline', conflicts: [], baseline };
	}

	const all = [];
	for (const field of DEPLOY_SCAN_FIELDS) {
		const chunk = await collectUpdatedSince(gateway, field, baseline.lastPulledAt);
		all.push(...chunk);
	}

	const filtered = all.filter((item) => !isPriorDeploySelfHit(item, baseline.lastDeploy));
	return {
		ok: filtered.length === 0,
		reason: filtered.length ? 'deploy_pre' : undefined,
		conflicts: filtered,
		baseline
	};
}

/**
 * Deploy post-check leftovers: lastPulledAt < updated_at < deployedAt - grace.
 */
async function collectDeployPostLeftovers(gateway, environment, deployedAt, cwd = process.cwd()) {
	const baseline = readPullBaseline(environment, cwd);
	if (!baseline || !baseline.lastPulledAt) {
		return { leftovers: [], baseline };
	}

	const deployMs = parseRemoteDate(deployedAt);
	const pullMs = parseRemoteDate(baseline.lastPulledAt);
	if (deployMs == null || pullMs == null) {
		return { leftovers: [], baseline };
	}

	const upperIso = new Date(deployMs - DEPLOY_GRACE_MS).toISOString();
	const all = [];
	for (const field of DEPLOY_SCAN_FIELDS) {
		const chunk = await collectUpdatedSince(gateway, field, baseline.lastPulledAt);
		all.push(...chunk);
	}

	const leftovers = all.filter((item) => {
		const remoteMs = parseRemoteDate(item.remoteUpdatedAt);
		if (remoteMs == null) {
			return false;
		}
		return remoteMs > pullMs && remoteMs < Date.parse(upperIso);
	});

	return { leftovers, baseline };
}

module.exports = {
	parseRemoteDate,
	fetchRemoteFileMtime,
	checkFile,
	collectDeployPreConflicts,
	collectDeployPostLeftovers,
	toPhysicalApiPath,
	DEPLOY_GRACE_MS
};
