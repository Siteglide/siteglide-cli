/**
 * Merge-first: create WIP commit, temp branch with remote content, merge into
 * current branch so users/AI get real conflict markers.
 *
 * Prefer branching the remote snapshot from lastPullCommit (classic 3-way),
 * else the repo's unique initial commit. Fall back to orphan +
 * --allow-unrelated-histories when no usable base exists.
 *
 * Sync mode: lightweight pull on the temp branch (caller supplies pullFn).
 * Deploy/pull mode: full pull on the temp branch (caller supplies pullFn).
 */

const fs = require('fs');
const path = require('path');
const { run, getGitReadiness } = require('./readiness');
const { runWithRetry, isGitLockError } = require('./runWithRetry');
const { commitAllSafeAsync, hasStagedOrUnstagedChanges } = require('./commit');
const { hasOpenGitConflicts } = require('./workingTree');
const { resolveMergeBase, writePullBaseline } = require('../pullBaseline');
const { ideSegments, migrateLegacySiteglideLayout } = require('../siteglidePaths');

const MERGE_DIR = ideSegments('merge');

const SNAPSHOT_MANIFEST_MODES = ['sync_full_pull', 'pull_full', 'deploy_full_pull'];

/**
 * @param {string} bin
 * @param {string[]} args
 * @param {{ cwd?: string }} opts
 */
async function git(args, opts = {}) {
	return runWithRetry('git', args, opts);
}

/**
 * @param {string} message
 * @param {{ cwd?: string, phase?: string, recoveryContext?: object }} ctx
 * @param {{ stdout?: string, stderr?: string, timedOut?: boolean, lockBusy?: boolean }} result
 */
function lockFailure(message, ctx, result) {
	const errorText = (result.stderr || result.stdout || message || 'Git command failed').trim();
	const payload = {
		ok: false,
		error: result.timedOut
			? `${message}: git repository busy after waiting — ${errorText}`
			: `${message}: ${errorText}`,
		recoveryContext: Object.assign({}, ctx.recoveryContext, {
			phase: ctx.phase,
			cwd: ctx.cwd
		})
	};
	if (result.timedOut || result.lockBusy || isGitLockError(result)) {
		payload.gitLockBusy = true;
	}
	return payload;
}

/**
 * @param {string} environment
 * @param {string} [cwd]
 */
function mergeManifestPath(environment, cwd = process.cwd()) {
	migrateLegacySiteglideLayout(cwd);
	return path.join(cwd, ...MERGE_DIR, `${environment}.json`);
}

/**
 * @param {string} environment
 * @param {string} [cwd]
 */
function readMergeManifest(environment, cwd = process.cwd()) {
	try {
		return JSON.parse(fs.readFileSync(mergeManifestPath(environment, cwd), 'utf8'));
	} catch {
		return null;
	}
}

/**
 * @param {string} environment
 * @param {object} payload
 * @param {string} [cwd]
 */
function writeMergeManifest(environment, payload, cwd = process.cwd()) {
	const dir = path.join(cwd, ...MERGE_DIR);
	fs.mkdirSync(dir, { recursive: true });
	const filePath = mergeManifestPath(environment, cwd);
	fs.writeFileSync(filePath, `${JSON.stringify({ environment, ...payload }, null, 2)}\n`, 'utf8');
	return filePath;
}

/**
 * Clear merge manifest for env.
 */
function clearMergeManifest(environment, cwd = process.cwd()) {
	try {
		fs.unlinkSync(mergeManifestPath(environment, cwd));
	} catch (err) {
		if (err && err.code !== 'ENOENT') {
			throw err;
		}
	}
}

/**
 * Ensure gate for merge-first start.
 */
function assertCanStartMergeFirst(cwd = process.cwd()) {
	const readiness = getGitReadiness({ cwd });
	if (!readiness.repoInitialized) {
		return { ok: false, error: 'Git repository not initialized' };
	}
	const open = hasOpenGitConflicts(cwd);
	if (open.open) {
		return { ok: false, error: `Cannot Merge first while ${open.reason} — ask AI to help resolve first` };
	}
	return { ok: true };
}

/**
 * Create temp branch from a merge base SHA, or orphan when base is unavailable.
 * @param {string} branch
 * @param {string | null} baseSha
 * @param {string} cwd
 * @param {'last_pull_base' | 'initial_commit' | 'orphan'} [strategy]
 * @param {object} [recoveryContext]
 * @returns {Promise<{ ok: boolean, strategy: 'last_pull_base' | 'initial_commit' | 'orphan', error?: string, gitLockBusy?: boolean, recoveryContext?: object }>}
 */
async function checkoutTempBranchForRemote(branch, baseSha, cwd, strategy = 'last_pull_base', recoveryContext = {}) {
	await git(['branch', '-D', branch], { cwd });

	if (baseSha) {
		const fromBase = await git(['checkout', '-b', branch, baseSha], { cwd });
		if (!fromBase.ok) {
			return lockFailure('Failed to create temp branch from merge base', {
				cwd,
				phase: 'create_temp_branch',
				recoveryContext: Object.assign({}, recoveryContext, { tempBranch: branch, mergeStrategy: strategy })
			}, fromBase);
		}
		return { ok: true, strategy };
	}

	const orphan = await git(['checkout', '--orphan', branch], { cwd });
	if (!orphan.ok) {
		return lockFailure('Failed to create orphan temp branch', {
			cwd,
			phase: 'create_temp_branch',
			recoveryContext: Object.assign({}, recoveryContext, { tempBranch: branch, mergeStrategy: 'orphan' })
		}, orphan);
	}
	await git(['rm', '-rf', '--cached', '.'], { cwd });
	await git(['clean', '-fd'], { cwd });
	return { ok: true, strategy: 'orphan' };
}

/**
 * @param {string} cwd
 * @returns {Promise<string | null>}
 */
async function currentHeadSha(cwd) {
	const head = await git(['rev-parse', 'HEAD'], { cwd });
	return head.ok ? head.stdout : null;
}

/**
 * @param {'deploy_full_pull'|'pull_full'|'sync_full_pull'} mode
 * @param {string} environment
 * @returns {string}
 */
function tempBranchNameForMode(mode, environment) {
	if (mode === 'sync_full_pull') {
		return `siteglide-merge-sync/${process.pid}-${Date.now()}`;
	}
	if (mode === 'pull_full') {
		const envSafe = String(environment || 'env').replace(/[^a-zA-Z0-9._-]+/g, '-');
		const date = new Date().toISOString().slice(0, 10);
		return `temp-pull-from-${envSafe}-${date}`;
	}
	return `siteglide-merge-deploy/${process.pid}-${Date.now()}`;
}

/**
 * @param {'deploy_full_pull'|'pull_full'|'sync_full_pull'} mode
 * @returns {string}
 */
function remoteSnapshotCommitMessage(mode) {
	if (mode === 'sync_full_pull') {
		return 'siteglide: remote pull for merge-first sync';
	}
	if (mode === 'pull_full') {
		return 'siteglide: remote full pull for merge-first pull';
	}
	return 'siteglide: remote full pull for merge-first deploy';
}

/**
 * @param {'deploy_full_pull'|'pull_full'|'sync_full_pull'} mode
 * @returns {string}
 */
function defaultWipMessage(mode) {
	if (mode === 'sync_full_pull') {
		return 'siteglide: WIP before merge-first sync';
	}
	if (mode === 'pull_full') {
		return 'siteglide: WIP before merge-first pull';
	}
	return 'siteglide: WIP before merge-first deploy';
}

/**
 * Deploy/pull/sync Merge first: pull on temp branch then merge back.
 * @param {object} opts
 * @param {string} opts.environment
 * @param {() => Promise<void>} opts.pullFn async pull into cwd (already on temp branch)
 * @param {string} [opts.cwd]
 * @param {string} [opts.wipMessage] commit message for dirty working tree
 * @param {'deploy_full_pull'|'pull_full'|'sync_full_pull'} [opts.mode]
 */
async function mergeFirstDeploy(opts) {
	const cwd = opts.cwd || process.cwd();
	const mode = opts.mode || 'deploy_full_pull';
	const gate = assertCanStartMergeFirst(cwd);
	if (!gate.ok) {
		return gate;
	}

	const branch = tempBranchNameForMode(mode, opts.environment);
	const current = await git(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd });
	if (!current.ok) {
		return { ok: false, error: 'Could not determine current branch' };
	}
	const originalBranch = current.stdout;
	const recoveryContext = {
		environment: opts.environment,
		mode,
		originalBranch,
		tempBranch: branch,
		mergeManifestPath: mergeManifestPath(opts.environment, cwd)
	};

	if (hasStagedOrUnstagedChanges(cwd)) {
		const wipMsg = opts.wipMessage || defaultWipMessage(mode);
		const wip = await commitAllSafeAsync(wipMsg, { cwd });
		if (!wip.ok && !/nothing to commit/i.test(wip.stdout + wip.stderr)) {
			return lockFailure('WIP commit failed', {
				cwd,
				phase: 'wip_commit',
				recoveryContext
			}, wip);
		}
	}

	const mergeBase = resolveMergeBase(opts.environment, cwd);
	const baseSha = mergeBase ? mergeBase.sha : null;
	const created = await checkoutTempBranchForRemote(
		branch,
		baseSha,
		cwd,
		mergeBase ? mergeBase.strategy : 'orphan',
		recoveryContext
	);
	if (!created.ok) {
		return created;
	}

	const pulledAt = new Date().toISOString();
	const remoteCommitMsg = remoteSnapshotCommitMessage(mode);
	try {
		await opts.pullFn();
		const commitRemote = await commitAllSafeAsync(remoteCommitMsg, { cwd });
		if (!commitRemote.ok && !/nothing to commit/i.test(commitRemote.stdout + commitRemote.stderr)) {
			await git(['checkout', originalBranch], { cwd });
			await git(['branch', '-D', branch], { cwd });
			return lockFailure('Remote pull snapshot commit failed', {
				cwd,
				phase: 'commit_remote',
				recoveryContext: Object.assign({}, recoveryContext, { mergeStrategy: created.strategy, baseSha: baseSha || null })
			}, commitRemote);
		}

		writeMergeManifest(opts.environment, {
			mode,
			remoteSnapshotAt: pulledAt,
			pulledAt,
			tempBranch: branch,
			originalBranch,
			mergeStrategy: created.strategy,
			baseSha: baseSha || null
		}, cwd);

		const checkoutOriginal = await git(['checkout', originalBranch], { cwd });
		if (!checkoutOriginal.ok) {
			return lockFailure('Could not switch back to your working branch', {
				cwd,
				phase: 'checkout_original',
				recoveryContext: Object.assign({}, recoveryContext, { mergeStrategy: created.strategy, baseSha: baseSha || null })
			}, checkoutOriginal);
		}

		const mergeArgs = created.strategy === 'orphan'
			? ['merge', '--no-ff', '--allow-unrelated-histories', branch]
			: ['merge', '--no-ff', branch];
		const merge = await git(mergeArgs, { cwd });
		if (!merge.ok && (merge.timedOut || isGitLockError(merge))) {
			return lockFailure('Merge failed', {
				cwd,
				phase: 'merge',
				recoveryContext: Object.assign({}, recoveryContext, { mergeStrategy: created.strategy, baseSha: baseSha || null })
			}, merge);
		}
		await git(['branch', '-D', branch], { cwd });

		if (merge.ok) {
			const head = await currentHeadSha(cwd);
			if (head) {
				writePullBaseline(opts.environment, {
					lastPulledAt: pulledAt,
					lastPullCommit: head,
					cwd
				});
			}
		}

		return {
			ok: true,
			merged: merge.ok,
			conflictExpected: !merge.ok,
			mergeStrategy: created.strategy,
			tempBranch: branch,
			originalBranch,
			remoteSnapshotAt: pulledAt,
			stdout: merge.stdout,
			stderr: merge.stderr
		};
	} catch (err) {
		await git(['checkout', originalBranch], { cwd });
		await git(['branch', '-D', branch], { cwd });
		return { ok: false, error: err.message || String(err), recoveryContext };
	}
}

/**
 * Pull Merge first — same flow as deploy merge-first (full pull on temp branch).
 * @param {object} opts
 * @param {string} opts.environment
 * @param {() => Promise<void>} opts.pullFn
 * @param {string} [opts.cwd]
 * @param {string} [opts.wipMessage]
 */
async function mergeFirstPull(opts) {
	return mergeFirstDeploy(Object.assign({}, opts, { mode: 'pull_full' }));
}

/**
 * Sync merge-first — lightweight pull on temp branch.
 * @param {object} opts
 * @param {string} opts.environment
 * @param {() => Promise<void>} opts.pullFn
 * @param {string} [opts.cwd]
 * @param {string} [opts.wipMessage]
 */
async function mergeFirstSyncPull(opts) {
	return mergeFirstDeploy(Object.assign({}, opts, { mode: 'sync_full_pull' }));
}

/**
 * Whether a sync path is safe after merge-first (remote not edited since fetch).
 * @param {string} environment
 * @param {string} physicalPath
 * @param {string | null} remoteUpdatedAt
 * @param {string} [cwd]
 */
function isSafeAfterMergeFirst(environment, physicalPath, remoteUpdatedAt, cwd = process.cwd()) {
	const man = readMergeManifest(environment, cwd);
	if (!man || !remoteUpdatedAt) {
		return false;
	}

	if (man.mode === 'sync_file') {
		if (man.path !== physicalPath || !man.remoteUpdatedAtAtFetch) {
			return false;
		}
		const remoteMs = Date.parse(remoteUpdatedAt);
		const fetchedMs = Date.parse(man.remoteUpdatedAtAtFetch);
		if (Number.isNaN(remoteMs) || Number.isNaN(fetchedMs)) {
			return false;
		}
		return remoteMs <= fetchedMs;
	}

	if (!SNAPSHOT_MANIFEST_MODES.includes(man.mode)) {
		return false;
	}

	const snapshotAt = man.remoteSnapshotAt || man.pulledAt;
	if (!snapshotAt) {
		return false;
	}
	const remoteMs = Date.parse(remoteUpdatedAt);
	const snapshotMs = Date.parse(snapshotAt);
	if (Number.isNaN(remoteMs) || Number.isNaN(snapshotMs)) {
		return false;
	}
	return remoteMs <= snapshotMs;
}

module.exports = {
	mergeManifestPath,
	readMergeManifest,
	writeMergeManifest,
	clearMergeManifest,
	assertCanStartMergeFirst,
	checkoutTempBranchForRemote,
	mergeFirstDeploy,
	mergeFirstPull,
	mergeFirstSyncPull,
	isSafeAfterMergeFirst,
	SNAPSHOT_MANIFEST_MODES
};
