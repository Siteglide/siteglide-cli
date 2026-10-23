const fs = require('fs');
const path = require('path');
const { userSegments, migrateLegacySiteglideLayout } = require('./siteglidePaths');

const SYNC_DIR_SEGMENTS = userSegments('sync');
const MAX_SYNC_ERRORS = 200;

/**
 * @param {number} pid
 * @returns {boolean}
 */
function isPidAlive(pid) {
	if (!Number.isInteger(pid) || pid <= 0) {
		return false;
	}
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

/**
 * @param {string} [cwd]
 * @returns {string}
 */
function syncStatusDir(cwd = process.cwd()) {
	migrateLegacySiteglideLayout(cwd);
	return path.join(cwd, ...SYNC_DIR_SEGMENTS);
}

/**
 * @param {string} [cwd]
 * @param {number} [pid]
 * @returns {string}
 */
function syncStatusPath(cwd = process.cwd(), pid = process.pid) {
	return path.join(syncStatusDir(cwd), `${pid}.json`);
}

/**
 * @param {unknown} data
 * @returns {object[] | undefined}
 */
function parseSyncErrorsFromData(data) {
	if (!data || typeof data !== 'object' || !Array.isArray(data.syncErrors)) {
		return undefined;
	}
	const valid = data.syncErrors.filter((item) => {
		return (
			item
			&& typeof item === 'object'
			&& typeof item.at === 'string'
			&& item.at
			&& typeof item.path === 'string'
			&& typeof item.message === 'string'
		);
	});
	if (valid.length === 0) {
		return undefined;
	}
	return valid;
}

/**
 * @param {string} filePath
 * @returns {{ pid: number, environment: string, cwd?: string, startedAt?: string, syncErrors?: object[] } | null}
 */
function readStatusFile(filePath) {
	try {
		const raw = fs.readFileSync(filePath, 'utf8');
		const data = JSON.parse(raw);
		if (!data || typeof data !== 'object') {
			return null;
		}
		const pid = Number(data.pid);
		if (!Number.isInteger(pid) || typeof data.environment !== 'string' || !data.environment) {
			return null;
		}
		const syncErrors = parseSyncErrorsFromData(data);
		const entry = {
			pid,
			environment: data.environment,
			cwd: data.cwd,
			startedAt: data.startedAt
		};
		if (syncErrors) {
			entry.syncErrors = syncErrors;
		}
		return entry;
	} catch {
		return null;
	}
}

/**
 * Append a sync API validation error to this process status file (same pid json).
 *
 * @param {{ cwd?: string, pid?: number, entry: object }} opts
 */
function appendSyncStatusError(opts) {
	const cwd = opts.cwd || process.cwd();
	const pid = opts.pid != null ? opts.pid : process.pid;
	const filePath = syncStatusPath(cwd, pid);
	try {
		if (!fs.existsSync(filePath)) {
			return;
		}
		const raw = fs.readFileSync(filePath, 'utf8');
		const data = JSON.parse(raw);
		if (!data || typeof data !== 'object') {
			return;
		}
		if (!Array.isArray(data.syncErrors)) {
			data.syncErrors = [];
		}
		data.syncErrors.push(opts.entry);
		if (data.syncErrors.length > MAX_SYNC_ERRORS) {
			data.syncErrors = data.syncErrors.slice(-MAX_SYNC_ERRORS);
		}
		const dir = path.dirname(filePath);
		const tmpPath = path.join(dir, `.${pid}.${process.pid}.tmp`);
		fs.writeFileSync(tmpPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
		fs.renameSync(tmpPath, filePath);
	} catch (err) {
		try {
			require('./logger').Debug(`[sync-status] appendSyncStatusError failed: ${err.message || err}`);
		} catch {
			// ignore
		}
	}
}

/**
 * Claim exclusive sync status for this process + environment in cwd.
 * Clears dead-pid files. Fails if another live process already syncs the same env.
 * Also refuses when pull or deploy holds the cross-command lock, or another sync is live.
 *
 * @param {{ environment: string, cwd?: string, pid?: number, isAlive?: (pid: number) => boolean }} opts
 * @returns {{ ok: true, path: string } | { ok: false, existingPid: number, environment: string, message?: string, blockedBy?: object }}
 */
function claimSyncStatus(opts) {
	const { assertCommandAllowed } = require('./commandLock');
	const cross = assertCommandAllowed('sync', opts);
	if (!cross.ok) {
		return {
			ok: false,
			existingPid: cross.blockedBy.pid,
			environment: cross.blockedBy.environment || opts.environment,
			message: cross.message,
			headline: cross.headline,
			helper: cross.helper,
			blockedBy: cross.blockedBy
		};
	}

	const environment = opts.environment;
	const cwd = opts.cwd || process.cwd();
	const pid = opts.pid != null ? opts.pid : process.pid;
	const isAlive = opts.isAlive || isPidAlive;
	const dir = syncStatusDir(cwd);

	fs.mkdirSync(dir, { recursive: true });

	let entries;
	try {
		entries = fs.readdirSync(dir);
	} catch {
		entries = [];
	}

	for (const name of entries) {
		if (!/^\d+\.json$/.test(name)) {
			// Keep non-pid files (e.g. current-conflict.json) untouched.
			continue;
		}
		const filePath = path.join(dir, name);
		const entry = readStatusFile(filePath);
		if (!entry) {
			try {
				fs.unlinkSync(filePath);
			} catch {
				// ignore
			}
			continue;
		}
		if (entry.pid === pid) {
			continue;
		}
		if (!isAlive(entry.pid)) {
			try {
				fs.unlinkSync(filePath);
			} catch {
				// ignore
			}
			continue;
		}
		if (entry.environment === environment) {
			return { ok: false, existingPid: entry.pid, environment };
		}
	}

	const filePath = syncStatusPath(cwd, pid);
	const payload = {
		pid,
		environment,
		cwd,
		startedAt: new Date().toISOString()
	};
	fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
	return { ok: true, path: filePath };
}

/**
 * Remove this process's status file only.
 *
 * @param {{ cwd?: string, pid?: number }} [opts]
 */
function clearSyncStatus(opts = {}) {
	const cwd = opts.cwd || process.cwd();
	const pid = opts.pid != null ? opts.pid : process.pid;
	const filePath = syncStatusPath(cwd, pid);
	try {
		fs.unlinkSync(filePath);
	} catch (err) {
		if (err && err.code !== 'ENOENT') {
			throw err;
		}
	}
}

let cleanupRegistered = false;

/**
 * Register process handlers that clear this process's sync status file.
 */
function registerSyncStatusCleanup(opts = {}) {
	if (cleanupRegistered) {
		return;
	}
	cleanupRegistered = true;

	const clear = () => {
		try {
			clearSyncStatus(opts);
		} catch {
			// ignore cleanup failures on exit
		}
	};

	process.on('exit', clear);

	for (const signal of ['SIGINT', 'SIGTERM']) {
		process.on(signal, () => {
			clear();
			process.exit(signal === 'SIGINT' ? 130 : 143);
		});
	}
}

module.exports = {
	MAX_SYNC_ERRORS,
	isPidAlive,
	syncStatusDir,
	syncStatusPath,
	claimSyncStatus,
	clearSyncStatus,
	registerSyncStatusCleanup,
	readStatusFile,
	appendSyncStatusError
};
