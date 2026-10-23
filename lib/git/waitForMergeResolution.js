/**
 * Poll until merge conflicts are resolved, then auto-commit when MERGE_HEAD is ready.
 */

const fs = require('fs');
const path = require('path');
const { detectConflictMarkerPaths, hasOpenGitConflicts } = require('./workingTree');
const { runWithRetry } = require('./runWithRetry');

const DEFAULT_HINT_INTERVAL_MS = 10 * 60 * 1000;

/**
 * @param {string} cwd
 * @returns {boolean}
 */
function mergeHeadExists(cwd) {
	return fs.existsSync(path.join(cwd, '.git', 'MERGE_HEAD'));
}

/**
 * True when merge is in progress, all unmerged paths are staged, and markers are gone.
 * @param {string} cwd
 * @returns {boolean}
 */
function isReadyToMergeCommit(cwd) {
	if (!mergeHeadExists(cwd)) {
		return false;
	}
	if (detectConflictMarkerPaths(cwd).length > 0) {
		return false;
	}
	const open = hasOpenGitConflicts(cwd);
	if (!open.open) {
		return false;
	}
	return open.reason === 'merge_in_progress';
}

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

/**
 * @param {object} [opts]
 * @param {string} [opts.cwd]
 * @param {string} [opts.commitMessage]
 * @param {string} [opts.logPrefix]
 * @param {object} [opts.logger]
 * @param {number} [opts.pollIntervalMs]
 * @param {number} [opts.hintIntervalMs] Console hint interval (default 10 minutes); polling uses pollIntervalMs.
 * @param {() => boolean} [opts.shouldAbort]
 * @returns {Promise<{ ok: boolean, committed: boolean, aborted?: boolean, error?: string }>}
 */
async function waitForMergeResolution(opts = {}) {
	const cwd = opts.cwd || process.cwd();
	const pollIntervalMs = opts.pollIntervalMs || 3000;
	const hintIntervalMs = opts.hintIntervalMs ?? DEFAULT_HINT_INTERVAL_MS;
	const commitMessage = opts.commitMessage || 'siteglide: merge remote pull';
	const logPrefix = opts.logPrefix || '[pull]';
	const logger = opts.logger || require('../logger');

	if (!hasOpenGitConflicts(cwd).open) {
		return { ok: true, committed: false };
	}

	let committed = false;
	let lastHintAt = 0;
	let printedHint = false;

	while (true) {
		if (opts.shouldAbort && opts.shouldAbort()) {
			return { ok: false, committed, aborted: true };
		}
		if (!hasOpenGitConflicts(cwd).open) {
			return { ok: true, committed };
		}

		const now = Date.now();
		const shouldPrintHint = process.stdin.isTTY
			&& (!printedHint || now - lastHintAt >= hintIntervalMs);
		if (shouldPrintHint) {
			lastHintAt = now;
			printedHint = true;
			logger.Warn(`${logPrefix} Waiting for merge resolution…`, { exit: false });
		}

		if (isReadyToMergeCommit(cwd)) {
			let commit = await runWithRetry('git', ['commit', '--no-edit'], { cwd });
			if (!commit.ok) {
				commit = await runWithRetry('git', ['commit', '-m', commitMessage], { cwd });
			}
			if (!commit.ok) {
				return {
					ok: false,
					committed,
					error: (commit.stderr || commit.stdout || 'Merge commit failed').trim()
				};
			}
			committed = true;
			continue;
		}

		await sleep(pollIntervalMs);
	}
}

module.exports = {
	DEFAULT_HINT_INTERVAL_MS,
	mergeHeadExists,
	isReadyToMergeCommit,
	waitForMergeResolution
};
