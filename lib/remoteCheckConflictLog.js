/**
 * AI-readable conflict log for remote-mtime / merge / marker blocks.
 *
 * Written under `.siteglide/remote-check/<environment>.json` so agents can call
 * MCP remote_check_status (or read this file) instead of scraping the terminal.
 * Never contains secrets from .siteglide-config.
 */

const fs = require('fs');
const path = require('path');

const SCHEMA_VERSION = 1;
const DIR_SEGMENTS = ['.siteglide', 'remote-check'];

/**
 * @param {string} [cwd]
 * @returns {string}
 */
function conflictLogDir(cwd = process.cwd()) {
	return path.join(cwd, ...DIR_SEGMENTS);
}

/**
 * @param {string} environment
 * @param {string} [cwd]
 * @returns {string}
 */
function conflictLogPath(environment, cwd = process.cwd()) {
	return path.join(conflictLogDir(cwd), `${environment}.json`);
}

/**
 * Default recommended actions for a remote-newer sync/deploy conflict.
 * merge_first is priority 1 when git is available.
 * @param {{ gitInitialized?: boolean }} [opts]
 */
function defaultRecommendedActions(opts = {}) {
	const actions = [];
	if (opts.gitInitialized !== false) {
		actions.push({
			id: 'merge_first',
			priority: 1,
			summary: 'Merge remote into local with conflict markers (git required), then ask AI to help resolve'
		});
	}
	actions.push(
		{
			id: 'commit_then_pull',
			priority: opts.gitInitialized === false ? 1 : 2,
			summary: 'Commit local work, then siteglide-cli pull <env>'
		},
		{
			id: 'cancel_sync_watch',
			priority: opts.gitInitialized === false ? 2 : 3,
			summary: 'Cancel the sync watch command until remote changes are reviewed'
		},
		{
			id: 'continue_overwrite',
			priority: opts.gitInitialized === false ? 3 : 4,
			summary: 'Continue only if overwriting remote is intentional'
		}
	);
	return actions;
}

/**
 * Overwrite the per-env conflict log (latest warning for that environment).
 * @param {string} environment
 * @param {object} payload fields merged into schema
 * @param {string} [cwd]
 * @returns {string} path written
 */
function writeConflictLog(environment, payload, cwd = process.cwd()) {
	const dir = conflictLogDir(cwd);
	fs.mkdirSync(dir, { recursive: true });
	const filePath = conflictLogPath(environment, cwd);
	const body = {
		schemaVersion: SCHEMA_VERSION,
		environment,
		status: 'conflict',
		detectedAt: new Date().toISOString(),
		userDecision: null,
		recommendedActions: defaultRecommendedActions({ gitInitialized: payload.gitInitialized }),
		...payload,
		environment
	};
	delete body.gitInitialized;
	fs.writeFileSync(filePath, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
	return filePath;
}

/**
 * Remove the env conflict file (resolved / continue / successful pull).
 * @param {string} environment
 * @param {string} [cwd]
 */
function clearConflictLog(environment, cwd = process.cwd()) {
	const filePath = conflictLogPath(environment, cwd);
	try {
		fs.unlinkSync(filePath);
	} catch (err) {
		if (err && err.code !== 'ENOENT') {
			throw err;
		}
	}
}

/**
 * @param {string} environment
 * @param {string} [cwd]
 * @returns {object | null}
 */
function readConflictLog(environment, cwd = process.cwd()) {
	try {
		return JSON.parse(fs.readFileSync(conflictLogPath(environment, cwd), 'utf8'));
	} catch {
		return null;
	}
}

/**
 * List all conflict log files in the project.
 * @param {string} [cwd]
 * @returns {object[]}
 */
function listConflictLogs(cwd = process.cwd()) {
	const dir = conflictLogDir(cwd);
	let names;
	try {
		names = fs.readdirSync(dir);
	} catch {
		return [];
	}
	const out = [];
	for (const name of names) {
		if (!name.endsWith('.json')) {
			continue;
		}
		try {
			out.push(JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')));
		} catch {
			// skip invalid
		}
	}
	return out;
}

module.exports = {
	SCHEMA_VERSION,
	conflictLogDir,
	conflictLogPath,
	defaultRecommendedActions,
	writeConflictLog,
	clearConflictLog,
	readConflictLog,
	listConflictLogs
};
