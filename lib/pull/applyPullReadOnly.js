/**
 * Apply pull read-only marking after writes and at end of pull.
 */

const fs = require('fs-extra');
const path = require('path');
const dir = require('../directories');
const logger = require('../logger');
const { makeWritable, makeReadOnly } = require('./fileReadOnly');
const {
	RESERVED_FILES_RELATIVE_PATH,
	loadPullReadOnlyMatcher,
	loadReservedFilesRulesForPull,
	readReservedFilesRules,
	toPosixProjectRelative,
	pathMatchesPullReadOnlyRules
} = require('./readOnlyRules');
const {
	logPullReadOnlyTraceDiagnostics,
	logPullReadOnlyTraceVisit,
	isTracePath
} = require('./pullReadOnlyTrace');

const AGENTS_ROOT = '.agents';

const IDE_ROOTS = ['.cursor', '.claude', '.windsurf', '.github'];

/**
 * @param {string} dirPath
 * @param {(fileAbs: string) => Promise<void>} onFile
 * @returns {Promise<void>}
 */
const walkFiles = async (dirPath, onFile) => {
	const entries = await fs.readdir(dirPath);
	for (let i = 0; i < entries.length; i++) {
		const fullPath = path.join(dirPath, entries[i]);
		const stats = await fs.lstat(fullPath);
		if (stats.isDirectory()) {
			await walkFiles(fullPath, onFile);
		} else if (stats.isFile()) {
			await onFile(fullPath);
		}
	}
};

/**
 * @param {string} cwd
 * @param {string} [siteRoot]
 * @returns {Promise<string[]>}
 */
const pullReadOnlyScanRoots = async (cwd, siteRoot) => {
	const roots = [dir.MODULES, AGENTS_ROOT];
	for (let i = 0; i < IDE_ROOTS.length; i++) {
		roots.push(IDE_ROOTS[i]);
	}
	const resolvedSiteRoot = (
		typeof siteRoot === 'string'
		&& siteRoot
	) ? siteRoot : dir.getSiteRoot(cwd);
	if (resolvedSiteRoot) {
		roots.push(resolvedSiteRoot);
	}
	const existing = [];
	const seen = {};
	for (let i = 0; i < roots.length; i++) {
		const name = roots[i];
		if (seen[name]) {
			continue;
		}
		seen[name] = true;
		const abs = path.join(cwd, name);
		if (await fs.pathExists(abs)) {
			existing.push(abs);
		}
	}
	return existing;
};

/**
 * Mark one file when it matches rules (makes writable first if overwriting).
 *
 * @param {string} cwd
 * @param {string} filePath - Absolute or cwd-relative file path.
 * @param {import('ignore').Ignore} [matcher]
 * @param {{ beforeWrite?: boolean }} [opts]
 * @returns {Promise<boolean>} Whether the file was marked read-only.
 */
const markPulledFileIfReadOnly = async (cwd, filePath, matcher, opts = {}) => {
	const abs = path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
	const ig = matcher || await loadPullReadOnlyMatcher(cwd);
	const rel = toPosixProjectRelative(abs, cwd);
	if (!pathMatchesPullReadOnlyRules(ig, rel)) {
		return false;
	}
	try {
		if (opts.beforeWrite) {
			await makeWritable(abs);
			return false;
		}
		if (await fs.pathExists(abs)) {
			const stats = await fs.stat(abs);
			if (!stats.isFile()) {
				return false;
			}
		}
		await makeReadOnly(abs);
		const afterStat = await fs.stat(abs);
		const writable = (afterStat.mode & 0o200) !== 0;
		logger.Debug(
			`[pull] Read-only match: ./${rel} (hint applied; writable=${writable})`
		);
		return true;
	} catch (e) {
		logger.Debug(`[pull] Could not set read-only on ./${rel}: ${e.message}`);
		return false;
	}
};

/**
 * Walk standard pull trees and chmod files that match rules.
 *
 * @param {string} [cwd]
 * @param {{ siteRoot?: string }} [opts]
 * @returns {Promise<{ marked: number }>}
 */
const applyPullReadOnlyAfterPull = async (cwd = process.cwd(), opts = {}) => {
	const { ruleCount, found } = await loadReservedFilesRulesForPull(cwd, { phase: 'post_pull' });
	if (!found || ruleCount === 0) {
		logger.Debug('[pull] Read-only pass: skipped (list missing or empty)');
		return { marked: 0 };
	}
	logger.Debug(`[pull] Read-only pass: scanning project for pattern matches`);
	const ig = await loadPullReadOnlyMatcher(cwd);
	const scanRoots = await pullReadOnlyScanRoots(cwd, opts.siteRoot);
	await logPullReadOnlyTraceDiagnostics(cwd, {
		siteRoot: opts.siteRoot,
		ig,
		scanRoots,
		label: 'before scan'
	});
	let marked = 0;
	let traceVisited = false;
	for (let r = 0; r < scanRoots.length; r++) {
		await walkFiles(scanRoots[r], async (fileAbs) => {
			const rel = toPosixProjectRelative(fileAbs, cwd);
			const matches = pathMatchesPullReadOnlyRules(ig, rel);
			if (isTracePath(rel)) {
				traceVisited = true;
			}
			logPullReadOnlyTraceVisit(rel, matches);
			if (!matches) {
				return;
			}
			const didMark = await markPulledFileIfReadOnly(cwd, fileAbs, ig);
			if (didMark) {
				marked += 1;
			}
		});
	}
	await logPullReadOnlyTraceDiagnostics(cwd, {
		siteRoot: opts.siteRoot,
		ig,
		scanRoots,
		label: 'after scan'
	});
	if (!traceVisited) {
		logger.Debug(
			'[pull] Read-only trace: target path was not visited during walk (file missing or outside scan roots)'
		);
	}
	if (marked > 0) {
		logger.Debug(
			`[pull] Read-only pass: ${marked} file(s) matched and marked (from ./${RESERVED_FILES_RELATIVE_PATH})`
		);
	} else {
		logger.Debug('[pull] Read-only pass: no files on disk matched the patterns');
	}
	return { marked };
};

/**
 * Clear read-only hints on paths that pull may have marked, so git checkout/merge can update the working tree.
 * Git does not store the Windows read-only attribute; a leftover hint blocks merge on that platform.
 *
 * @param {string} [cwd]
 * @param {string} [siteRoot]
 * @returns {Promise<{ cleared: number }>}
 */
const clearPullReadOnlyHintsForGit = async (cwd = process.cwd(), siteRoot) => {
	const ig = await loadPullReadOnlyMatcher(cwd);
	const scanRoots = await pullReadOnlyScanRoots(cwd, siteRoot);
	let cleared = 0;
	for (let r = 0; r < scanRoots.length; r++) {
		await walkFiles(scanRoots[r], async (fileAbs) => {
			const rel = toPosixProjectRelative(fileAbs, cwd);
			if (!pathMatchesPullReadOnlyRules(ig, rel)) {
				return;
			}
			try {
				await makeWritable(fileAbs);
				cleared += 1;
			} catch (e) {
				logger.Debug(`[pull] Could not clear read-only hint for git: ./${rel}: ${e.message}`);
			}
		});
	}
	if (cleared > 0) {
		logger.Debug(`[pull] Cleared read-only hint on ${cleared} file(s) before git checkout/merge`);
	}
	return { cleared };
};

/**
 * Re-apply hints on the home branch after merge-first git steps (clears happen in mergeFirst.js).
 *
 * @param {string} [cwd]
 * @param {{ siteRoot?: string, gateway?: import('../proxy'), label?: string }} [opts]
 * @returns {Promise<{ marked: number, skipped?: boolean, reason?: string }>}
 */
const reapplyPullReadOnlyHintsAfterMerge = async (cwd = process.cwd(), opts = {}) => {
	const label = opts.label || 'merge-first';
	logger.Debug(`[pull] Read-only re-apply after merge (${label}): starting`);

	const localBefore = await readReservedFilesRules(cwd);
	if (
		localBefore.length === 0
		&& opts.gateway
	) {
		logger.Debug(
			'[pull] Read-only re-apply after merge: no local rules file yet; loading from remote for this process'
		);
		await loadReservedFilesRulesForPull(cwd, { gateway: opts.gateway, phase: 'pre_pull' });
	}

	const { ruleCount, found, source } = await loadReservedFilesRulesForPull(cwd, {
		gateway: opts.gateway,
		phase: 'post_pull'
	});
	if (!found || ruleCount === 0) {
		const reason = 'no_rules';
		logger.Debug(
			`[pull] Read-only re-apply after merge (${label}): skipped (${reason}; found=${found} ruleCount=${ruleCount})`
		);
		return { marked: 0, skipped: true, reason };
	}
	logger.Debug(
		`[pull] Read-only re-apply after merge (${label}): scanning (${ruleCount} pattern(s), source=${source || 'unknown'})`
	);
	const { marked } = await applyPullReadOnlyAfterPull(cwd, { siteRoot: opts.siteRoot });
	await logPullReadOnlyTraceDiagnostics(cwd, {
		siteRoot: opts.siteRoot,
		ig: await loadPullReadOnlyMatcher(cwd),
		label: `re-apply ${label}`
	});
	logger.Debug(`[pull] Read-only re-apply after merge (${label}): finished marked=${marked}`);
	if (marked > 0) {
		logger.Quiet(`[pull] Read-only hints re-applied on ${marked} file(s) after git merge`);
	} else {
		logger.Quiet(`[pull] Read-only re-apply after merge: no files matched on disk (${ruleCount} pattern(s) loaded)`);
	}
	return { marked };
};

module.exports = {
	markPulledFileIfReadOnly,
	applyPullReadOnlyAfterPull,
	reapplyPullReadOnlyHintsAfterMerge,
	clearPullReadOnlyHintsForGit,
	pullReadOnlyScanRoots,
	walkFiles
};
