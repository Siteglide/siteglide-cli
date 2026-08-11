/**
 * Pull / deploy baseline state under `.siteglide/pull/<environment>.json`.
 *
 * Purpose: give sync and deploy a local timestamp (and optional deploy path
 * manifest) so we can detect when the remote site has files newer than the
 * last time this machine fully reconciled via pull — without treating a
 * partial deploy as a full reconcile.
 *
 * Lifecycle:
 * - Successful pull → write lastPulledAt, clear lastDeploy (full reconcile).
 * - Successful deploy → replace lastDeploy { deployedAt, paths } only.
 * - Clean deploy post-check may advance lastPulledAt (clear lastDeploy).
 * - Sync uses effectiveBaseline(path): deploy time only for paths in lastDeploy.
 */

const fs = require('fs');
const path = require('path');

const PULL_DIR_SEGMENTS = ['.siteglide', 'pull'];

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
 * @returns {{ environment: string, lastPulledAt?: string, lastDeploy?: { deployedAt: string, paths: string[] } } | null}
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
 * Write baseline after a successful pull.
 * Clears lastDeploy because the tree was fully reconciled with remote.
 * @param {string} environment
 * @param {{ lastPulledAt?: string, cwd?: string }} [opts]
 * @returns {string} path written
 */
function writePullBaseline(environment, opts = {}) {
	const cwd = opts.cwd || process.cwd();
	const lastPulledAt = opts.lastPulledAt || new Date().toISOString();
	const dir = pullBaselineDir(cwd);
	fs.mkdirSync(dir, { recursive: true });
	const filePath = pullBaselinePath(environment, cwd);
	const payload = {
		environment,
		lastPulledAt
	};
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
	fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
	return filePath;
}

/**
 * Advance lastPulledAt (e.g. after a clean deploy post-check) and clear lastDeploy.
 * @param {string} environment
 * @param {string} [at] ISO timestamp
 * @param {string} [cwd]
 * @returns {string} path written
 */
function advancePullBaseline(environment, at = new Date().toISOString(), cwd = process.cwd()) {
	return writePullBaseline(environment, { lastPulledAt: at, cwd });
}

/**
 * Per-path comparison floor for sync.
 * Paths included in the last deploy use deployedAt so self-deployed files do not
 * false-positive; everything else uses lastPulledAt (preserves remote-only safety).
 *
 * @param {string} environment
 * @param {string} physicalPath unixified API path (no app/ prefix)
 * @param {string} [cwd]
 * @returns {{ at: string | null, source: 'pull' | 'deploy' | 'missing' }}
 */
function effectiveBaseline(environment, physicalPath, cwd = process.cwd()) {
	const baseline = readPullBaseline(environment, cwd);
	if (!baseline || !baseline.lastPulledAt) {
		const lastDeploy = baseline && baseline.lastDeploy;
		if (
			lastDeploy &&
			Array.isArray(lastDeploy.paths) &&
			lastDeploy.paths.includes(physicalPath) &&
			lastDeploy.deployedAt
		) {
			return { at: lastDeploy.deployedAt, source: 'deploy' };
		}
		return { at: null, source: 'missing' };
	}

	const lastDeploy = baseline.lastDeploy;
	if (
		lastDeploy &&
		lastDeploy.deployedAt &&
		Array.isArray(lastDeploy.paths) &&
		lastDeploy.paths.includes(physicalPath)
	) {
		const deployMs = Date.parse(lastDeploy.deployedAt);
		const pullMs = Date.parse(baseline.lastPulledAt);
		if (!Number.isNaN(deployMs) && (Number.isNaN(pullMs) || deployMs > pullMs)) {
			return { at: lastDeploy.deployedAt, source: 'deploy' };
		}
	}

	return { at: baseline.lastPulledAt, source: 'pull' };
}

module.exports = {
	pullBaselineDir,
	pullBaselinePath,
	readPullBaseline,
	writePullBaseline,
	replaceDeployManifest,
	advancePullBaseline,
	effectiveBaseline
};
