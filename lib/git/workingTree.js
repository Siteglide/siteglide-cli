/**
 * Working-tree helpers: dirty detection, stash, stash pop with conflict logging.
 */

const fs = require('fs');
const path = require('path');
const { run } = require('./readiness');
const { ideSegments, migrateLegacySiteglideLayout } = require('../siteglidePaths');

const GIT_LOG_DIR = ideSegments('git');

/**
 * @param {string} [cwd]
 * @returns {boolean}
 */
function isWorkingTreeDirty(cwd = process.cwd()) {
	const res = run('git', ['status', '--porcelain'], { cwd });
	return res.ok && res.stdout.length > 0;
}

/**
 * @param {string} message
 * @param {string} [cwd]
 */
function stashPush(message, cwd = process.cwd()) {
	return run('git', ['stash', 'push', '-u', '-m', message], { cwd });
}

/**
 * Attempt stash pop. On conflict, write AI log and leave stash intact (git default).
 * @param {{ cwd?: string, environment?: string }} [opts]
 * @returns {{ ok: boolean, conflict?: boolean, logPath?: string, stdout: string, stderr: string }}
 */
function stashPop(opts = {}) {
	const cwd = opts.cwd || process.cwd();
	const res = run('git', ['stash', 'pop'], { cwd });
	if (res.ok) {
		clearStashConflictLog(cwd);
		return { ok: true, stdout: res.stdout, stderr: res.stderr };
	}

	const conflictedPaths = detectConflictMarkerPaths(cwd);
	const logPath = writeStashConflictLog({
		cwd,
		environment: opts.environment,
		stdout: res.stdout,
		stderr: res.stderr,
		conflictedPaths
	});
	return {
		ok: false,
		conflict: true,
		logPath,
		stdout: res.stdout,
		stderr: res.stderr,
		conflictedPaths
	};
}

/**
 * @param {string} [cwd]
 * @returns {string[]}
 */
function detectConflictMarkerPaths(cwd = process.cwd()) {
	const unmerged = run('git', ['diff', '--name-only', '--diff-filter=U'], { cwd });
	if (unmerged.ok && unmerged.stdout) {
		return unmerged.stdout.split(/\r?\n/).filter(Boolean);
	}
	return [];
}

/**
 * @param {string} [cwd]
 */
function writeStashConflictLog(payload) {
	const cwd = payload.cwd || process.cwd();
	migrateLegacySiteglideLayout(cwd);
	const dir = path.join(cwd, ...GIT_LOG_DIR);
	fs.mkdirSync(dir, { recursive: true });
	const filePath = path.join(dir, 'last-stash-conflict.json');
	const body = {
		schemaVersion: 1,
		status: 'stash_pop_conflict',
		detectedAt: new Date().toISOString(),
		environment: payload.environment || null,
		conflictedPaths: payload.conflictedPaths || [],
		recommendedActions: [
			{ id: 'resolve_conflicts', priority: 1, summary: 'Ask AI agent + MCP to help resolve conflict markers' },
			{ id: 'retry_stash_pop', priority: 2, summary: 'Retry git stash pop after resolving' },
			{ id: 'stash_drop_when_done', priority: 3, summary: 'Drop the stash once changes are applied' }
		],
		stdout: payload.stdout || '',
		stderr: payload.stderr || ''
	};
	fs.writeFileSync(filePath, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
	return filePath;
}

/**
 * @param {string} [cwd]
 */
function clearStashConflictLog(cwd = process.cwd()) {
	const filePath = path.join(cwd, ...GIT_LOG_DIR, 'last-stash-conflict.json');
	try {
		fs.unlinkSync(filePath);
	} catch (err) {
		if (err && err.code !== 'ENOENT') {
			throw err;
		}
	}
}

/**
 * True if merge in progress or conflict marker files present.
 * @param {string} [cwd]
 */
function hasOpenGitConflicts(cwd = process.cwd()) {
	const mergeHead = path.join(cwd, '.git', 'MERGE_HEAD');
	if (fs.existsSync(mergeHead)) {
		return { open: true, reason: 'merge_in_progress' };
	}
	const unmerged = detectConflictMarkerPaths(cwd);
	if (unmerged.length) {
		return { open: true, reason: 'conflict_markers', paths: unmerged };
	}
	// Scan tracked dirty files for marker lines (post soft states)
	const porcelain = run('git', ['status', '--porcelain'], { cwd });
	if (porcelain.ok && porcelain.stdout) {
		const files = porcelain.stdout
			.split(/\r?\n/)
			.map((line) => line.slice(3).trim())
			.filter(Boolean);
		for (const rel of files) {
			try {
				const abs = path.join(cwd, rel);
				const text = fs.readFileSync(abs, 'utf8');
				if (text.includes('<<<<<<<') && text.includes('>>>>>>>')) {
					return { open: true, reason: 'conflict_markers', paths: [rel.replace(/\\/g, '/')] };
				}
			} catch {
				// skip binary / missing
			}
		}
	}
	return { open: false };
}

module.exports = {
	isWorkingTreeDirty,
	stashPush,
	stashPop,
	detectConflictMarkerPaths,
	hasOpenGitConflicts,
	writeStashConflictLog,
	clearStashConflictLog
};
