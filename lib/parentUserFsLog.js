/**
 * Logging for shared `.siteglide/user/` files above the project root.
 */

const fs = require('fs');
const path = require('path');

/** @type {Set<string>} */
const loggedPathResolutionRoots = new Set();

function logger() {
	return require('./logger');
}

/**
 * @param {unknown} error
 * @returns {string}
 */
function formatFsError(error) {
	if (!error || typeof error !== 'object') {
		return String(error);
	}
	const parts = [];
	if (error.code) {
		parts.push(String(error.code));
	}
	if (error.message) {
		parts.push(String(error.message));
	}
	return parts.length ? parts.join(': ') : 'unknown error';
}

/**
 * @param {string} dirPath
 * @param {string} contextLabel
 * @returns {{ ok: boolean, created: boolean, error?: Error }}
 */
function ensureDirWithLog(dirPath, contextLabel, opts = {}) {
	const cwd = opts.cwd != null ? path.resolve(String(opts.cwd)) : process.cwd();
	const existedBefore = fs.existsSync(dirPath);
	try {
		fs.mkdirSync(dirPath, { recursive: true });
	} catch (error) {
		logger().Warn(
			`[siteglide] ${contextLabel}: mkdir failed for ${dirPath} ` +
			`(cwd=${cwd}, ${formatFsError(error)})`,
			{ exit: false }
		);
		return { ok: false, created: false, error };
	}

	if (!fs.existsSync(dirPath)) {
		logger().Warn(
			`[siteglide] ${contextLabel}: mkdir did not create ${dirPath} (cwd=${cwd})`,
			{ exit: false }
		);
		return { ok: false, created: false };
	}

	const created = !existedBefore;
	if (created) {
		logger().Info(
			`[siteglide] ${contextLabel}: created shared folder ${dirPath}`,
			{ exit: false }
		);
	} else {
		logger().Debug(`[siteglide] ${contextLabel}: using existing folder ${dirPath}`);
	}

	return { ok: true, created };
}

/**
 * @param {string} contextLabel
 * @param {string} resolvedProjectRoot
 * @param {string} legacyPath
 * @param {string} parentPath
 * @param {unknown} error
 */
function logParentUserMigrationFailure(contextLabel, resolvedProjectRoot, legacyPath, parentPath, error) {
	logger().Warn(
		`[siteglide] ${contextLabel}: could not move preferences to the parent folder. ` +
		`projectRoot=${resolvedProjectRoot} legacy=${legacyPath} parent=${parentPath} — ${formatFsError(error)}`,
		{ exit: false }
	);
}

/**
 * @param {string} contextLabel
 * @param {string} resolvedProjectRoot
 * @param {string} legacyPath
 * @param {string} parentPath
 */
function logParentUserMigrationPlan(contextLabel, resolvedProjectRoot, legacyPath, parentPath) {
	logSharedUserPathResolutionOnce(resolvedProjectRoot);
	logger().Info(
		`[siteglide] ${contextLabel}: migrating ${legacyPath} → ${parentPath}`,
		{ exit: false }
	);
}

/**
 * Log how project root maps to the shared parent folder (once per project root per process).
 * @param {string} resolvedProjectRoot
 * @param {string} [cwd]
 */
function logSharedUserPathResolutionOnce(resolvedProjectRoot, cwd = process.cwd()) {
	const root = path.resolve(resolvedProjectRoot);
	if (loggedPathResolutionRoots.has(root)) {
		return;
	}
	loggedPathResolutionRoots.add(root);
	const parentUserDir = path.join(path.dirname(root), '.siteglide', 'user');
	logger().Info(
		`[siteglide] Shared .siteglide/user paths: projectRoot=${root} parentUserDir=${parentUserDir} cwd=${path.resolve(cwd)}`,
		{ exit: false }
	);
}

/**
 * @param {string} contextLabel
 * @param {string} parentPath
 * @param {string} detail
 */
function logParentUserMigrationSuccess(contextLabel, parentPath, detail) {
	logger().Info(`[siteglide] ${contextLabel}: ${detail} (${parentPath})`, { exit: false });
}

/**
 * @param {string} contextLabel
 * @param {string} resolvedProjectRoot
 * @param {string} legacyPath
 * @param {string} parentPath
 */
function warnInconsistentParentUserState(contextLabel, resolvedProjectRoot, legacyPath, parentPath) {
	const legacyLeft = fs.existsSync(legacyPath);
	const parentLeft = fs.existsSync(parentPath);

	if (
		legacyLeft &&
		!parentLeft
	) {
		logger().Warn(
			`[siteglide] ${contextLabel}: project file still exists at ${legacyPath} but parent copy is missing at ${parentPath}. ` +
			`projectRoot=${resolvedProjectRoot}. Set DEBUG=1 and retry, or move the file manually to the parent .siteglide/user/ folder.`,
			{ exit: false }
		);
		return;
	}

	if (
		!legacyLeft &&
		!parentLeft
	) {
		logger().Warn(
			`[siteglide] ${contextLabel}: no preferences file at ${legacyPath} or ${parentPath} (projectRoot=${resolvedProjectRoot}). ` +
			'A new file will be created on the next save under the parent .siteglide/user/ folder.',
			{ exit: false }
		);
	}
}

module.exports = {
	formatFsError,
	ensureDirWithLog,
	logParentUserMigrationFailure,
	logParentUserMigrationPlan,
	logParentUserMigrationSuccess,
	logSharedUserPathResolutionOnce,
	warnInconsistentParentUserState
};
