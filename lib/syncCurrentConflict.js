/**
 * Current sync remote-conflict record for AI agents.
 *
 * Written to `.siteglide/sync/current-conflict.json` while sync is waiting for
 * the human to choose on the CLI prompt (merge / force / skip / cancel).
 * Cleared when that prompt resolves. MCP remote_check_status reads this file
 * so agents do not scrape the terminal.
 */

const fs = require('fs');
const path = require('path');

const SCHEMA_VERSION = 1;
const RELATIVE_PATH = path.join('.siteglide', 'sync', 'current-conflict.json');

/**
 * @param {string} [cwd]
 * @returns {string}
 */
function syncCurrentConflictPath(cwd = process.cwd()) {
	return path.join(cwd, RELATIVE_PATH);
}

/**
 * Normalize path for comparison (forward slashes, no leading ./).
 * @param {string | null | undefined} p
 * @returns {string}
 */
function normalizeConflictPath(p) {
	if (!p || typeof p !== 'string') {
		return '';
	}
	return p.replace(/\\/g, '/').replace(/^\.\//, '');
}

/**
 * Local file mtime as ISO, or null.
 * @param {string} localPath
 * @param {string} [cwd]
 * @returns {string | null}
 */
function localMtimeIso(localPath, cwd = process.cwd()) {
	if (!localPath) {
		return null;
	}
	try {
		const abs = path.isAbsolute(localPath) ? localPath : path.join(cwd, localPath);
		const st = fs.statSync(abs);
		return new Date(st.mtimeMs).toISOString();
	} catch {
		return null;
	}
}

/**
 * Write / overwrite the current sync conflict (awaiting human decision).
 * @param {object} opts
 * @param {string} opts.environment
 * @param {string} opts.reason
 * @param {string} [opts.path] physical / API path (forward slashes preferred)
 * @param {string} [opts.localPath] project-relative path sync watched
 * @param {string | null} [opts.remoteUpdatedAt]
 * @param {string | null} [opts.effectiveBaselineAt]
 * @param {string} [opts.baselineSource]
 * @param {string} [opts.kind]
 * @param {string} [opts.cwd]
 * @returns {string} path written
 */
function writeSyncCurrentConflict(opts) {
	const cwd = opts.cwd || process.cwd();
	const filePath = syncCurrentConflictPath(cwd);
	fs.mkdirSync(path.dirname(filePath), { recursive: true });

	const physical = normalizeConflictPath(opts.path);
	const localPath = normalizeConflictPath(opts.localPath) || physical;
	const localMtimeAtDetect = localMtimeIso(localPath, cwd);
	const detectedAt = new Date().toISOString();

	const body = {
		schemaVersion: SCHEMA_VERSION,
		command: 'sync',
		status: 'awaiting_user_decision',
		awaitingUserDecision: true,
		userDecision: null,
		environment: opts.environment,
		reason: opts.reason,
		detectedAt,
		path: physical,
		localPath,
		kind: opts.kind || null,
		remoteUpdatedAt: opts.remoteUpdatedAt || null,
		effectiveBaselineAt: opts.effectiveBaselineAt || null,
		baselineSource: opts.baselineSource || null,
		localMtimeAtDetect,
		agentGuidance:
			'Live sync detected a possible newer remote file for this path. ' +
			'The human must choose on the Siteglide CLI sync prompt (merge / force / skip / cancel). ' +
			'Advise the user; do not assume their choice or scrape the terminal.'
	};

	fs.writeFileSync(filePath, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
	return filePath;
}

/**
 * Clear the current sync conflict file (prompt resolved or no longer relevant).
 * @param {string} [cwd]
 */
function clearSyncCurrentConflict(cwd = process.cwd()) {
	const filePath = syncCurrentConflictPath(cwd);
	try {
		fs.unlinkSync(filePath);
	} catch (err) {
		if (err && err.code !== 'ENOENT') {
			throw err;
		}
	}
}

/**
 * Record the human's CLI decision, then clear the awaiting file.
 * For merge_first, rewrite briefly as merge_in_progress then leave cleared after
 * merge flow updates remote-check logs — callers typically clear after merge starts.
 * @param {string} decision
 * @param {string} [cwd]
 */
function resolveSyncCurrentConflict(decision, cwd = process.cwd()) {
	const existing = readSyncCurrentConflict(cwd);
	if (!existing) {
		clearSyncCurrentConflict(cwd);
		return;
	}
	if (decision === 'merge_first') {
		const filePath = syncCurrentConflictPath(cwd);
		const body = {
			...existing,
			status: 'merge_in_progress',
			awaitingUserDecision: false,
			userDecision: 'merge_first',
			resolvedAt: new Date().toISOString()
		};
		fs.writeFileSync(filePath, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
		return;
	}
	clearSyncCurrentConflict(cwd);
}

/**
 * @param {string} [cwd]
 * @returns {object | null}
 */
function readSyncCurrentConflict(cwd = process.cwd()) {
	try {
		return JSON.parse(fs.readFileSync(syncCurrentConflictPath(cwd), 'utf8'));
	} catch {
		return null;
	}
}

/**
 * Whether a conflict record refers to the given path (physical or local).
 * @param {object} conflict
 * @param {string} pathQuery
 * @returns {boolean}
 */
function conflictMatchesPath(conflict, pathQuery) {
	const q = normalizeConflictPath(pathQuery);
	if (!q || !conflict) {
		return false;
	}
	const candidates = [
		conflict.path,
		conflict.localPath,
		...(Array.isArray(conflict.conflicts)
			? conflict.conflicts.flatMap((c) => [c && c.path, c && c.localPath])
			: [])
	]
		.filter(Boolean)
		.map(normalizeConflictPath);

	return candidates.some((c) => c === q || c.endsWith(`/${q}`) || q.endsWith(`/${c}`));
}

module.exports = {
	SCHEMA_VERSION,
	RELATIVE_PATH,
	syncCurrentConflictPath,
	normalizeConflictPath,
	localMtimeIso,
	writeSyncCurrentConflict,
	clearSyncCurrentConflict,
	resolveSyncCurrentConflict,
	readSyncCurrentConflict,
	conflictMatchesPath
};
