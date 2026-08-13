/**
 * Pull / deploy baseline state under `.siteglide/pull/<environment>.json`.
 *
 * Purpose: give sync and deploy a local timestamp (and optional deploy path
 * manifest) so we can detect when the remote site has files newer than the
 * last time this machine fully reconciled via pull — without treating a
 * partial deploy as a full reconcile.
 *
 * Also stores lastPullCommit (git SHA of the post-pull tree) so merge-first
 * can 3-way-merge against the last reconcile tip.
 *
 * Lifecycle:
 * - Successful full pull → write lastPulledAt + lastPullCommit, clear lastDeploy + lastSync.
 * - Successful deploy → replace lastDeploy { deployedAt, paths } only (preserve SHA + lastSync).
 * - Clean deploy post-check may advance lastPulledAt (clear lastDeploy; keep SHA; clear lastSync).
 * - Successful sync upload → recordSyncPath merges into lastSync.paths (per-path syncedAt).
 * - Sync uses effectiveBaseline(path): newest applicable sync / deploy / pull floor per path.
 */

const fs = require('fs');
const path = require('path');
const { run } = require('./git/readiness');
const { mapPathToResource } = require('./graphql/remoteMtimeQueries');

const PULL_DIR_SEGMENTS = ['.siteglide', 'pull'];
const SYNC_RECORD_DEBOUNCE_MS = 500;

/** @type {Map<string, { environment: string, cwd: string, paths: Map<string, string> }>} */
const pendingSyncRecords = new Map();
let syncRecordFlushTimer = null;

/**
 * Absolute directory that holds per-environment baseline JSON files.
 * @param {string} [cwd]
 * @returns {string}
 */
function pullBaselineDir(cwd = process.cwd()) {
	return path.join(cwd, ...PULL_DIR_SEGMENTS);
}

/**
 * Path to one environment's baseline file.
 * @param {string} environment
 * @param {string} [cwd]
 * @returns {string}
 */
function pullBaselinePath(environment, cwd = process.cwd()) {
	return path.join(pullBaselineDir(cwd), `${environment}.json`);
}

/**
 * Read and lightly validate baseline JSON for an environment.
 * @param {string} environment
 * @param {string} [cwd]
 * @returns {{ environment: string, lastPulledAt?: string, lastPullCommit?: string, lastDeploy?: { deployedAt: string, paths: string[] }, lastSync?: { paths: Record<string, string> } } | null}
 */
function readPullBaseline(environment, cwd = process.cwd()) {
	const filePath = pullBaselinePath(environment, cwd);
	try {
		const raw = fs.readFileSync(filePath, 'utf8');
		const data = JSON.parse(raw);
		if (!data || typeof data !== 'object' || data.environment !== environment) {
			return null;
		}
		return data;
	} catch {
		return null;
	}
}

/**
 * Write baseline after a successful pull (or timestamp advance).
 * Clears lastDeploy and lastSync because the tree was fully reconciled with remote (or
 * deploy post-check advanced the pull floor).
 *
 * @param {string} environment
 * @param {{ lastPulledAt?: string, lastPullCommit?: string | null, cwd?: string }} [opts]
 *        Pass lastPullCommit to set/replace; pass null to clear; omit to preserve existing.
 * @returns {string} path written
 */
function writePullBaseline(environment, opts = {}) {
	const cwd = opts.cwd || process.cwd();
	const existing = readPullBaseline(environment, cwd) || { environment };
	const lastPulledAt = opts.lastPulledAt || new Date().toISOString();
	const dir = pullBaselineDir(cwd);
	fs.mkdirSync(dir, { recursive: true });
	const filePath = pullBaselinePath(environment, cwd);
	const payload = {
		environment,
		lastPulledAt
	};
	if (Object.prototype.hasOwnProperty.call(opts, 'lastPullCommit')) {
		if (opts.lastPullCommit) {
			payload.lastPullCommit = String(opts.lastPullCommit);
		}
	} else if (existing.lastPullCommit) {
		payload.lastPullCommit = existing.lastPullCommit;
	}
	fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
	return filePath;
}

/**
 * Replace the entire lastDeploy object (never merge previous path lists).
 * Deploy is partial — only listed paths get the deploy-time floor for sync.
 * @param {string} environment
 * @param {{ deployedAt?: string, paths: string[], cwd?: string }} opts
 * @returns {string} path written
 */
function replaceDeployManifest(environment, opts) {
	const cwd = opts.cwd || process.cwd();
	const deployedAt = opts.deployedAt || new Date().toISOString();
	const paths = Array.isArray(opts.paths) ? [...new Set(opts.paths)].sort() : [];
	const dir = pullBaselineDir(cwd);
	fs.mkdirSync(dir, { recursive: true });
	const filePath = pullBaselinePath(environment, cwd);
	const existing = readPullBaseline(environment, cwd) || { environment };
	const payload = {
		environment,
		lastPulledAt: existing.lastPulledAt,
		lastDeploy: {
			deployedAt,
			paths
		}
	};
	if (existing.lastPullCommit) {
		payload.lastPullCommit = existing.lastPullCommit;
	}
	if (existing.lastSync && existing.lastSync.paths && typeof existing.lastSync.paths === 'object') {
		payload.lastSync = {
			paths: Object.assign({}, existing.lastSync.paths)
		};
	}
	fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
	return filePath;
}

/**
 * Advance lastPulledAt (e.g. after a clean deploy post-check) and clear lastDeploy + lastSync.
 * Preserves lastPullCommit.
 * @param {string} environment
 * @param {string} [at] ISO timestamp
 * @param {string} [cwd]
 * @returns {string} path written
 */
function advancePullBaseline(environment, at = new Date().toISOString(), cwd = process.cwd()) {
	return writePullBaseline(environment, { lastPulledAt: at, cwd });
}

/**
 * Return lastPullCommit when it exists, is a real commit, and is an ancestor of HEAD.
 * @param {string} environment
 * @param {string} [cwd]
 * @returns {string | null}
 */
function resolveLastPullCommit(environment, cwd = process.cwd()) {
	const baseline = readPullBaseline(environment, cwd);
	if (!baseline || !baseline.lastPullCommit) {
		return null;
	}
	const sha = String(baseline.lastPullCommit).trim();
	if (!sha) {
		return null;
	}
	const exists = run('git', ['cat-file', '-e', `${sha}^{commit}`], { cwd });
	if (!exists.ok) {
		return null;
	}
	const ancestor = run('git', ['merge-base', '--is-ancestor', sha, 'HEAD'], { cwd });
	if (!ancestor.ok) {
		return null;
	}
	return sha;
}

/**
 * Unique root commit of HEAD (initial commit). Null if none or multiple roots
 * (ambiguous — caller should use orphan merge).
 * @param {string} [cwd]
 * @returns {string | null}
 */
function resolveInitialCommit(cwd = process.cwd()) {
	const roots = run('git', ['rev-list', '--max-parents=0', 'HEAD'], { cwd });
	if (!roots.ok || !roots.stdout) {
		return null;
	}
	const shas = roots.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
	if (shas.length !== 1) {
		return null;
	}
	return shas[0];
}

/**
 * Prefer lastPullCommit, else the repo's unique initial commit, else null (orphan).
 * @param {string} environment
 * @param {string} [cwd]
 * @returns {{ sha: string, strategy: 'last_pull_base' | 'initial_commit' } | null}
 */
function resolveMergeBase(environment, cwd = process.cwd()) {
	const lastPull = resolveLastPullCommit(environment, cwd);
	if (lastPull) {
		return { sha: lastPull, strategy: 'last_pull_base' };
	}
	const initial = resolveInitialCommit(cwd);
	if (initial) {
		return { sha: initial, strategy: 'initial_commit' };
	}
	return null;
}

/**
 * Normalize API physical path for baseline maps.
 * @param {string} physicalPath
 * @returns {string}
 */
function normalizePhysicalPath(physicalPath) {
	return String(physicalPath || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

/**
 * @param {string | null | undefined} iso
 * @returns {number | null}
 */
function parseBaselineMs(iso) {
	if (!iso) {
		return null;
	}
	const ms = Date.parse(String(iso));
	return Number.isNaN(ms) ? null : ms;
}

/**
 * Persist pending lastSync.path entries to disk for one batch.
 * @param {{ environment: string, cwd: string, paths: Map<string, string> }} batch
 */
function writeSyncRecordBatch(batch) {
	const existing = readPullBaseline(batch.environment, batch.cwd) || { environment: batch.environment };
	const mergedPaths = Object.assign(
		{},
		existing.lastSync && existing.lastSync.paths ? existing.lastSync.paths : {}
	);
	for (const [physicalPath, syncedAt] of batch.paths.entries()) {
		mergedPaths[physicalPath] = syncedAt;
	}
	const dir = pullBaselineDir(batch.cwd);
	fs.mkdirSync(dir, { recursive: true });
	const filePath = pullBaselinePath(batch.environment, batch.cwd);
	const payload = {
		environment: batch.environment,
		lastSync: { paths: mergedPaths }
	};
	if (existing.lastPulledAt) {
		payload.lastPulledAt = existing.lastPulledAt;
	}
	if (existing.lastPullCommit) {
		payload.lastPullCommit = existing.lastPullCommit;
	}
	if (existing.lastDeploy) {
		payload.lastDeploy = existing.lastDeploy;
	}
	fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

/**
 * Flush debounced sync path records immediately.
 */
function flushPendingSyncRecords() {
	if (syncRecordFlushTimer) {
		clearTimeout(syncRecordFlushTimer);
		syncRecordFlushTimer = null;
	}
	for (const batch of pendingSyncRecords.values()) {
		writeSyncRecordBatch(batch);
	}
	pendingSyncRecords.clear();
}

/**
 * Record a successful sync upload so the next remote check ignores self-bumps.
 * Debounced to coalesce rapid saves. Skips unmapped paths (same rule as remote check).
 *
 * @param {string} environment
 * @param {string} physicalPath unixified API path
 * @param {{ cwd?: string, syncedAt?: string, immediate?: boolean }} [opts]
 * @returns {boolean} false when path is skipped (unmapped)
 */
function recordSyncPath(environment, physicalPath, opts = {}) {
	const cwd = opts.cwd || process.cwd();
	const normalized = normalizePhysicalPath(physicalPath);
	if (!normalized || !mapPathToResource(normalized)) {
		return false;
	}
	const syncedAt = opts.syncedAt || new Date().toISOString();
	const key = `${cwd}\0${environment}`;
	let batch = pendingSyncRecords.get(key);
	if (!batch) {
		batch = { environment, cwd, paths: new Map() };
		pendingSyncRecords.set(key, batch);
	}
	batch.paths.set(normalized, syncedAt);

	if (opts.immediate) {
		flushPendingSyncRecords();
		return true;
	}

	if (!syncRecordFlushTimer) {
		syncRecordFlushTimer = setTimeout(() => {
			syncRecordFlushTimer = null;
			flushPendingSyncRecords();
		}, SYNC_RECORD_DEBOUNCE_MS);
	}
	return true;
}

/**
 * ISO syncedAt from a local asset file mtime (matches generateManifest / remote asset floor).
 * @param {string} localFilePath
 * @param {string} [cwd]
 * @returns {string}
 */
function syncedAtFromAssetFileMtime(localFilePath, cwd = process.cwd()) {
	const abs = path.isAbsolute(localFilePath) ? localFilePath : path.join(cwd, localFilePath);
	const stat = fs.statSync(abs);
	return new Date(Math.floor(stat.mtimeMs / 1000) * 1000).toISOString();
}

/**
 * @param {{ at: string, source: 'pull' | 'deploy' | 'sync', ms: number } | null} a
 * @param {{ at: string, source: 'pull' | 'deploy' | 'sync', ms: number } | null} b
 */
function pickHigherBaseline(a, b) {
	if (!a) {
		return b;
	}
	if (!b) {
		return a;
	}
	return a.ms >= b.ms ? a : b;
}

/**
 * Per-path comparison floor for sync.
 * Uses the newest applicable sync, deploy, or pull timestamp for each path so
 * self-sync and self-deploy uploads do not false-positive on the next save.
 *
 * @param {string} environment
 * @param {string} physicalPath unixified API path (no app/ prefix)
 * @param {string} [cwd]
 * @returns {{ at: string | null, source: 'pull' | 'deploy' | 'sync' | 'missing' }}
 */
function effectiveBaseline(environment, physicalPath, cwd = process.cwd()) {
	const normalized = normalizePhysicalPath(physicalPath);
	const baseline = readPullBaseline(environment, cwd);
	const pullMs = baseline && baseline.lastPulledAt ? parseBaselineMs(baseline.lastPulledAt) : null;

	let best = null;

	if (baseline && baseline.lastSync && baseline.lastSync.paths) {
		const syncAt = baseline.lastSync.paths[normalized];
		const syncMs = parseBaselineMs(syncAt);
		if (syncMs != null && (pullMs == null || syncMs > pullMs)) {
			best = pickHigherBaseline(best, { at: syncAt, source: 'sync', ms: syncMs });
		}
	}

	const lastDeploy = baseline && baseline.lastDeploy;
	if (
		lastDeploy &&
		lastDeploy.deployedAt &&
		Array.isArray(lastDeploy.paths) &&
		lastDeploy.paths.includes(normalized)
	) {
		const deployMs = parseBaselineMs(lastDeploy.deployedAt);
		if (deployMs != null && (pullMs == null || deployMs > pullMs)) {
			best = pickHigherBaseline(best, {
				at: lastDeploy.deployedAt,
				source: 'deploy',
				ms: deployMs
			});
		}
	}

	if (pullMs != null && baseline.lastPulledAt) {
		best = pickHigherBaseline(best, {
			at: baseline.lastPulledAt,
			source: 'pull',
			ms: pullMs
		});
	}

	if (!best) {
		return { at: null, source: 'missing' };
	}

	return { at: best.at, source: best.source };
}

module.exports = {
	pullBaselineDir,
	pullBaselinePath,
	readPullBaseline,
	writePullBaseline,
	replaceDeployManifest,
	advancePullBaseline,
	recordSyncPath,
	flushPendingSyncRecords,
	syncedAtFromAssetFileMtime,
	resolveLastPullCommit,
	resolveInitialCommit,
	resolveMergeBase,
	effectiveBaseline,
	SYNC_RECORD_DEBOUNCE_MS
};
