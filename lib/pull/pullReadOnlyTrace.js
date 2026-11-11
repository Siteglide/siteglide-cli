/**
 * Targeted read-only matcher diagnostics (`-debug`).
 * Set SITEGLIDE_PULL_READONLY_TRACE for extra paths (comma-separated, POSIX or Windows slashes).
 */

const path = require('path');
const fs = require('fs-extra');
const ignore = require('ignore');
const { isCliDebug } = require('../cliDebug');
const logger = require('../logger');
const {
	toPosixProjectRelative,
	pathMatchesPullReadOnlyRules,
	resolveEffectivePullReadOnlyRules,
	readReservedFilesRules,
	getPullReadOnlySessionSnapshot
} = require('./readOnlyRules');

const BUILTIN_TRACE_PATHS = [
	'marketplace_builder/views/partials/layouts/modules/module_1050/search/default.liquid'
];

/**
 * @param {string} p
 * @returns {string}
 */
const normalizeTracePath = (p) => {
	return String(p).trim().replace(/\\/g, '/').replace(/^\.\//, '');
};

/**
 * @returns {string[]}
 */
const collectTracePaths = () => {
	const paths = BUILTIN_TRACE_PATHS.map(normalizeTracePath);
	const env = process.env.SITEGLIDE_PULL_READONLY_TRACE;
	if (
		env
		&& env.trim()
	) {
		const extra = env.split(/[,;]/);
		for (let i = 0; i < extra.length; i++) {
			const normalized = normalizeTracePath(extra[i]);
			if (
				normalized
				&& paths.indexOf(normalized) === -1
			) {
				paths.push(normalized);
			}
		}
	}
	return paths;
};

/**
 * @param {string} relPosix
 * @returns {boolean}
 */
const isTracePath = (relPosix) => {
	if (!isCliDebug()) {
		return false;
	}
	const rel = normalizeTracePath(relPosix);
	const targets = collectTracePaths();
	for (let i = 0; i < targets.length; i++) {
		if (targets[i] === rel) {
			return true;
		}
	}
	return false;
};

/**
 * @param {string} relPosix
 * @param {boolean} matched
 */
const logPullReadOnlyTraceVisit = (relPosix, matched) => {
	if (!isTracePath(relPosix)) {
		return;
	}
	logger.Debug(
		`[pull] Read-only trace: walk hit ./${normalizeTracePath(relPosix)} matcher=${matched}`
	);
};

/**
 * @param {string} cwd
 * @param {{ siteRoot?: string, ig?: import('ignore').Ignore, scanRoots?: string[], label?: string }} [opts]
 * @returns {Promise<void>}
 */
const logPullReadOnlyTraceDiagnostics = async (cwd = process.cwd(), opts = {}) => {
	if (!isCliDebug()) {
		return;
	}
	const tracePaths = collectTracePaths();
	if (tracePaths.length === 0) {
		return;
	}

	const label = opts.label || 'read-only pass';
	const localRules = await readReservedFilesRules(cwd);
	const effectiveRules = await resolveEffectivePullReadOnlyRules(cwd);
	const session = getPullReadOnlySessionSnapshot();
	const ig = opts.ig || (() => {
		const built = ignore();
		if (effectiveRules.length > 0) {
			built.add(effectiveRules);
		}
		return built;
	})();

	let scanRoots = opts.scanRoots;
	if (!scanRoots) {
		const { pullReadOnlyScanRoots } = require('./applyPullReadOnly');
		scanRoots = await pullReadOnlyScanRoots(cwd, opts.siteRoot);
	}

	logger.Debug(
		`[pull] Read-only trace (${label}): ${tracePaths.length} path(s); ` +
		`rules local=${localRules.length} remoteCached=${session.remoteRuleCount} effective=${effectiveRules.length}`
	);

	for (let ti = 0; ti < tracePaths.length; ti++) {
		const tracePath = tracePaths[ti];
		const abs = path.join(cwd, ...tracePath.split('/'));
		const exists = await fs.pathExists(abs);
		const relFromCwd = exists ? toPosixProjectRelative(abs, cwd) : '';
		const testRel = relFromCwd || tracePath;
		const matched = pathMatchesPullReadOnlyRules(ig, testRel);

		let underScan = false;
		let containingRoot = '';
		for (let r = 0; r < scanRoots.length; r++) {
			const relToRoot = path.relative(scanRoots[r], abs);
			if (
				relToRoot
				&& !relToRoot.startsWith('..')
				&& !path.isAbsolute(relToRoot)
			) {
				underScan = true;
				containingRoot = scanRoots[r];
				break;
			}
		}

		const scanRootsForLog = scanRoots.map((root) => {
			const rel = path.relative(cwd, root);
			return rel ? rel.split(path.sep).join('/') : '.';
		});

		logger.Debug(`[pull] Read-only trace: --- ./${tracePath} ---`);
		logger.Debug(`[pull] Read-only trace: absolute=${abs}`);
		logger.Debug(`[pull] Read-only trace: exists=${exists}`);
		if (exists) {
			logger.Debug(`[pull] Read-only trace: relFromCwd=./${relFromCwd}`);
			if (relFromCwd !== tracePath) {
				logger.Debug(
					`[pull] Read-only trace: rel differs from target (expected ./${tracePath})`
				);
			}
		}
		logger.Debug(`[pull] Read-only trace: testRel=./${testRel} matcher=${matched}`);
		logger.Debug(
			`[pull] Read-only trace: underScanRoots=${underScan}` +
			(containingRoot ? ` root=${containingRoot}` : '')
		);
		logger.Debug(`[pull] Read-only trace: scanRoots=[${scanRootsForLog.join(', ')}]`);

		for (let ri = 0; ri < effectiveRules.length; ri++) {
			const rule = effectiveRules[ri];
			const ruleIg = ignore().add(rule);
			const ruleMatch = ruleIg.ignores(testRel);
			logger.Debug(
				`[pull] Read-only trace: rule[${ri + 1}] ${ruleMatch ? 'MATCH' : 'no'}: ${rule}`
			);
		}
	}
};

module.exports = {
	normalizeTracePath,
	collectTracePaths,
	isTracePath,
	logPullReadOnlyTraceVisit,
	logPullReadOnlyTraceDiagnostics
};
