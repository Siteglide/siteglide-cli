/**
 * Pull / merge-first tracing for debugging merge-first and temp-branch issues.
 * Emits only when process.env.DEBUG is set (same gate as logger.Debug).
 * Messages use the [temp][pull] prefix for grep when DEBUG=1.
 */

const fs = require('fs');
const path = require('path');
const logger = require('../logger');
const { run } = require('./readiness');
const { pullBaselinePath, readPullBaseline } = require('../pullBaseline');
const { userSegments, migrateLegacySiteglideLayout } = require('../siteglidePaths');

const MERGE_DIR = userSegments('merge');

/**
 * @param {string} environment
 * @param {string} cwd
 * @returns {string}
 */
function mergeManifestPathForTrace(environment, cwd) {
	migrateLegacySiteglideLayout(cwd);
	return path.join(cwd, ...MERGE_DIR, `${environment}.json`);
}

/**
 * @param {string} environment
 * @param {string} cwd
 * @returns {object | null}
 */
function readMergeManifestForTrace(environment, cwd) {
	try {
		return JSON.parse(fs.readFileSync(mergeManifestPathForTrace(environment, cwd), 'utf8'));
	} catch {
		return null;
	}
}

const MAX_PORCELAIN_CHARS = 800;
const MAX_PACKED_REFS_CHARS = 2000;

/** Set on outer pull; inherited by nested pull via process.env. */
const TRACE_SESSION_ENV = 'SITEGLIDE_TEMP_PULL_TRACE_ID';

/**
 * @returns {boolean}
 */
function isPullTraceEnabled() {
	return Boolean(process.env.DEBUG);
}

/**
 * @returns {string}
 */
function ensureTempPullTraceSession() {
	if (!isPullTraceEnabled()) {
		return process.env[TRACE_SESSION_ENV] || '';
	}
	if (process.env[TRACE_SESSION_ENV]) {
		return process.env[TRACE_SESSION_ENV];
	}
	const id = `${process.pid}-${Date.now().toString(36)}`;
	process.env[TRACE_SESSION_ENV] = id;
	return id;
}

/**
 * @param {{ ok?: boolean, stdout?: string, stderr?: string }} result
 * @returns {string}
 */
function classifyBranchDeleteResult(result) {
	if (!result) {
		return 'unknown';
	}
	if (result.ok) {
		return 'deleted_or_gone';
	}
	const text = `${result.stderr || ''}\n${result.stdout || ''}`.toLowerCase();
	if (/checked out/.test(text)) {
		return 'H2_delete_blocked_checked_out';
	}
	if (/not found/.test(text) || /couldn't find/.test(text)) {
		return 'absent_expected';
	}
	if (/worktree/.test(text) || /is already used/.test(text)) {
		return 'H2_delete_blocked_worktree';
	}
	if (/not fully merged/.test(text)) {
		return 'delete_blocked_unmerged';
	}
	return 'delete_failed_other';
}

/**
 * @param {{ ok?: boolean, stdout?: string, stderr?: string }} result
 * @returns {string}
 */
function classifyBranchCreateResult(result) {
	if (!result) {
		return 'unknown';
	}
	if (result.ok) {
		return 'created';
	}
	const text = `${result.stderr || ''}\n${result.stdout || ''}`.toLowerCase();
	if (/already exists/.test(text)) {
		return 'H2_create_blocked_already_exists';
	}
	if (/cannot lock ref/.test(text)) {
		return 'H2_create_ref_lock';
	}
	return 'create_failed_other';
}

/**
 * @param {string} message
 * @returns {string[]}
 */
function matchBranchExistsHypotheses(message) {
	const text = String(message || '').toLowerCase();
	const hits = [];
	if (/already exists/.test(text)) {
		hits.push('H2_ref_still_present_after_delete');
	}
	if (/checked out/.test(text)) {
		hits.push('H2_still_on_temp_branch');
	}
	return hits;
}

/**
 * @param {string} step
 * @param {Record<string, unknown>} [data]
 */
function tempPullLog(step, data) {
	if (!isPullTraceEnabled()) {
		return;
	}
	const traceSession = process.env[TRACE_SESSION_ENV] || '';
	let suffix = '';
	if (data && typeof data === 'object') {
		const parts = [];
		for (const key of Object.keys(data)) {
			const val = data[key];
			if (val === undefined) {
				continue;
			}
			if (val === null) {
				parts.push(`${key}=null`);
			} else if (typeof val === 'object') {
				try {
					parts.push(`${key}=${JSON.stringify(val)}`);
				} catch {
					parts.push(`${key}=[unserialisable]`);
				}
			} else {
				parts.push(`${key}=${String(val)}`);
			}
		}
		if (traceSession && !Object.prototype.hasOwnProperty.call(data, 'traceSession')) {
			parts.unshift(`traceSession=${traceSession}`);
		}
		if (parts.length) {
			suffix = ` ${parts.join(' ')}`;
		}
	} else if (traceSession) {
		suffix = ` traceSession=${traceSession}`;
	}
	logger.Debug(`[temp][pull] ${step}${suffix}`);
}

/**
 * @param {string} gitDir
 * @param {string} branchName
 * @returns {{ refFileExists: boolean, packedRefsLine: string | null }}
 */
function probeBranchRef(gitDir, branchName) {
	const refFile = path.join(gitDir, 'refs', 'heads', branchName);
	const refFileExists = fs.existsSync(refFile);
	let packedRefsLine = null;
	const packedPath = path.join(gitDir, 'packed-refs');
	try {
		if (fs.existsSync(packedPath)) {
			const raw = fs.readFileSync(packedPath, 'utf8');
			const slice = raw.length > MAX_PACKED_REFS_CHARS ? raw.slice(0, MAX_PACKED_REFS_CHARS) : raw;
			const lines = slice.split(/\r?\n/);
			const prefix = `refs/heads/${branchName}`;
			for (let i = 0; i < lines.length; i++) {
				const line = lines[i].trim();
				if (line.endsWith(prefix)) {
					packedRefsLine = line;
					break;
				}
			}
		}
	} catch {
		packedRefsLine = null;
	}
	return { refFileExists, packedRefsLine };
}

/**
 * @param {string} gitDir
 * @returns {{ mergeHead: boolean, cherryPickHead: boolean, rebaseMerge: boolean }}
 */
function probeGitStateFiles(gitDir) {
	return {
		mergeHead: fs.existsSync(path.join(gitDir, 'MERGE_HEAD')),
		cherryPickHead: fs.existsSync(path.join(gitDir, 'CHERRY_PICK_HEAD')),
		rebaseMerge: fs.existsSync(path.join(gitDir, 'rebase-merge'))
	};
}

/**
 * @param {string} cwd
 * @param {string} label
 * @param {{ environment?: string, tempBranch?: string }} [extras]
 */
function tempPullGitSnapshot(cwd, label, extras = {}) {
	if (!isPullTraceEnabled()) {
		return;
	}
	try {
		const { hasOpenGitConflicts } = require('./workingTree');
		const top = run('git', ['rev-parse', '--show-toplevel'], { cwd });
		const gitDirRel = run('git', ['rev-parse', '--git-dir'], { cwd });
		const headSym = run('git', ['symbolic-ref', '-q', 'HEAD'], { cwd });
		const headSha = run('git', ['rev-parse', 'HEAD'], { cwd });
		const porcelain = run('git', ['status', '--porcelain'], { cwd });
		const branchList = run('git', ['branch', '--list'], { cwd });
		const tempPullBranches = run('git', ['branch', '-a', '--list', 'temp-pull-from-*'], { cwd });
		const siteglideMergeBranches = run('git', ['branch', '-a', '--list', 'siteglide-merge-*'], { cwd });
		const remotes = run('git', ['remote', '-v'], { cwd });
		const worktrees = run('git', ['worktree', 'list', '--porcelain'], { cwd });
		const conflicts = hasOpenGitConflicts(cwd);
		const porcelainLineCount = porcelain.ok && porcelain.stdout
			? porcelain.stdout.split(/\r?\n/).filter(Boolean).length
			: 0;

		let gitDirAbs = gitDirRel.stdout || '';
		if (gitDirAbs && !path.isAbsolute(gitDirAbs)) {
			gitDirAbs = path.resolve(top.ok ? top.stdout : cwd, gitDirAbs);
		}

		const stateFiles = gitDirAbs ? probeGitStateFiles(gitDirAbs) : {
			mergeHead: false,
			cherryPickHead: false,
			rebaseMerge: false
		};

		let showRefTemp = null;
		let refProbe = { refFileExists: false, packedRefsLine: null };
		let showRefTag = null;
		if (extras.tempBranch && gitDirAbs) {
			showRefTemp = run('git', ['show-ref', '--heads', '--verify', `refs/heads/${extras.tempBranch}`], { cwd });
			showRefTag = run('git', ['show-ref', '--tags', '--verify', `refs/tags/${extras.tempBranch}`], { cwd });
			refProbe = probeBranchRef(gitDirAbs, extras.tempBranch);
		}

		const headName = headSym.ok ? headSym.stdout.replace(/^refs\/heads\//, '') : '';
		const headVerify = run('git', ['rev-parse', '--verify', 'HEAD'], { cwd });
		const unbornRepo = headSym.ok && !headVerify.ok;
		const headEqualsTempBranch = Boolean(
			extras.tempBranch
			&& headName
			&& headName === extras.tempBranch
		);
		const headIsTempPullPattern = /^refs\/heads\/temp-pull-from-/.test(headSym.stdout || '')
			|| /^temp-pull-from-/.test(headName);

		let porcelainOut = porcelain.stdout || '';
		if (porcelainOut.length > MAX_PORCELAIN_CHARS) {
			porcelainOut = `${porcelainOut.slice(0, MAX_PORCELAIN_CHARS)}…(${porcelain.stdout.length} chars)`;
		}

		let mergeManifest = null;
		let mergeManifestPathStr = null;
		let pullBaselineSummary = null;
		if (extras.environment) {
			mergeManifestPathStr = mergeManifestPathForTrace(extras.environment, cwd);
			mergeManifest = readMergeManifestForTrace(extras.environment, cwd);
			const baseline = readPullBaseline(extras.environment, cwd);
			pullBaselineSummary = baseline
				? {
					lastPullCommit: baseline.lastPullCommit || null,
					lastPulledAt: baseline.lastPulledAt || null
				}
				: null;
		}

		const staleManifestHint = mergeManifest && !stateFiles.mergeHead
			? 'H1_stale_merge_manifest_no_merge_head'
			: '';
		let cwdMismatchHint = '';
		if (top.ok && top.stdout) {
			const normCwd = path.resolve(cwd);
			const normTop = path.resolve(top.stdout);
			if (normCwd !== normTop) {
				cwdMismatchHint = 'H3_git_top_level_differs_from_process_cwd';
			}
		}

		tempPullLog(`git_snapshot:${label}`, {
			cwd,
			pid: process.pid,
			nestedCli: process.env.SITEGLIDE_NESTED_CLI || '',
			assumeYes: process.env.SITEGLIDE_PULL_ASSUME_YES || '',
			topLevel: top.ok ? top.stdout : `err:${top.stderr}`,
			gitDir: gitDirAbs || gitDirRel.stderr,
			head: headSym.ok ? headSym.stdout : `(detached?) ${headSha.ok ? headSha.stdout : ''}`,
			headSha: headSha.ok ? headSha.stdout : '',
			headEqualsTempBranch,
			headIsTempPullPattern,
			unbornRepo,
			conflictsOpen: conflicts.open,
			conflictsReason: conflicts.reason || '',
			porcelainLineCount,
			porcelain: porcelainOut || '(clean)',
			worktrees: (worktrees.stdout || '').replace(/\r?\n/g, ' | ').slice(0, 400) || '(none)',
			branches: (branchList.stdout || '').replace(/\r?\n/g, ' | '),
			tempPullBranches: (tempPullBranches.stdout || '').replace(/\r?\n/g, ' | ') || '(none)',
			siteglideMergeBranches: (siteglideMergeBranches.stdout || '').replace(/\r?\n/g, ' | ') || '(none)',
			remotes: (remotes.stdout || '').replace(/\r?\n/g, ' | ') || '(none)',
			mergeHead: stateFiles.mergeHead,
			cherryPickHead: stateFiles.cherryPickHead,
			rebaseMerge: stateFiles.rebaseMerge,
			tempBranch: extras.tempBranch || '',
			showRefTempOk: showRefTemp ? showRefTemp.ok : '',
			showRefTempOut: showRefTemp ? (showRefTemp.stdout || showRefTemp.stderr) : '',
			showRefTagOk: showRefTag ? showRefTag.ok : '',
			showRefTagOut: showRefTag ? (showRefTag.stdout || showRefTag.stderr) : '',
			refFileExists: refProbe.refFileExists,
			packedRefsLine: refProbe.packedRefsLine || '',
			hypothesisHint: cwdMismatchHint
				|| (unbornRepo ? 'H4_unborn_branch_no_commits_yet' : '')
				|| staleManifestHint
				|| (headIsTempPullPattern ? 'H1_or_H2_stuck_on_temp_pull_branch' : '')
				|| (headEqualsTempBranch ? 'H2_checked_out_on_intended_temp_branch' : ''),
			mergeManifestPath: mergeManifestPathStr || '',
			mergeManifestPresent: Boolean(mergeManifest),
			mergeManifestTempBranch: mergeManifest && mergeManifest.tempBranch ? mergeManifest.tempBranch : '',
			mergeManifestOriginalBranch: mergeManifest && mergeManifest.originalBranch ? mergeManifest.originalBranch : '',
			pullBaselinePath: extras.environment ? pullBaselinePath(extras.environment, cwd) : '',
			pullBaselineSummary: pullBaselineSummary ? JSON.stringify(pullBaselineSummary) : ''
		});
	} catch (err) {
		tempPullLog(`git_snapshot_failed:${label}`, {
			cwd,
			error: err.message || String(err)
		});
	}
}

/**
 * @param {{ ok?: boolean, stdout?: string, stderr?: string, status?: number }} result
 * @returns {string}
 */
function formatGitResult(result) {
	if (!result) {
		return 'no result';
	}
	const out = (result.stdout || '').trim();
	const err = (result.stderr || '').trim();
	const bits = [`ok=${Boolean(result.ok)}`, `status=${result.status}`];
	if (out) {
		bits.push(`stdout=${out}`);
	}
	if (err) {
		bits.push(`stderr=${err}`);
	}
	return bits.join(' ');
}

module.exports = {
	TRACE_SESSION_ENV,
	isPullTraceEnabled,
	ensureTempPullTraceSession,
	tempPullLog,
	tempPullGitSnapshot,
	formatGitResult,
	classifyBranchDeleteResult,
	classifyBranchCreateResult,
	matchBranchExistsHypotheses
};
