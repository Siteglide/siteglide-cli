/**
 * Merge-first: create WIP commit, temp branch with remote content, merge into
 * current branch so users/AI get real conflict markers.
 *
 * Prefer branching the remote snapshot from lastPullCommit (classic 3-way),
 * else the repo's unique initial commit. Fall back to orphan +
 * --allow-unrelated-histories when no usable base exists.
 *
 * Sync mode: one file body from GraphQL.
 * Deploy/pull mode: full pull on the temp branch (caller supplies pullFn).
 */

const fs = require('fs');
const path = require('path');
const { run, getGitReadiness } = require('./readiness');
const { runWithRetry, isGitLockError } = require('./runWithRetry');
const { commitAllSafeAsync, hasStagedOrUnstagedChanges } = require('./commit');
const { hasOpenGitConflicts } = require('./workingTree');
const { fetchRemoteFileMtime } = require('../remoteMtimeCheck');
const { resolveMergeBase, writePullBaseline } = require('../pullBaseline');

const MERGE_DIR = ['.siteglide', 'merge'];

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
 * Sync Merge first for a single physical path.
 *
 * @param {object} opts
 * @param {object} opts.gateway
 * @param {string} opts.environment
 * @param {string} opts.physicalPath
 * @param {string} opts.localFilePath absolute or cwd-relative path to write/merge
 * @param {string} [opts.cwd]
 * @param {(physicalPath: string) => Promise<{ body: string, updatedAt: string } | null>} opts.fetchRemoteContent
 */
async function mergeFirstSyncFile(opts) {
	const cwd = opts.cwd || process.cwd();
	const gate = assertCanStartMergeFirst(cwd);
	if (!gate.ok) {
		return gate;
	}

	const branch = `siteglide-merge/${process.pid}-${Date.now()}`;
	const current = await git(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd });
	if (!current.ok) {
		return { ok: false, error: 'Could not determine current branch' };
	}
	const originalBranch = current.stdout;
	const recoveryContext = {
		environment: opts.environment,
		mode: 'sync_file',
		originalBranch,
		tempBranch: branch,
		physicalPath: opts.physicalPath,
		mergeManifestPath: mergeManifestPath(opts.environment, cwd)
	};

	if (hasStagedOrUnstagedChanges(cwd)) {
		const wip = await commitAllSafeAsync(`siteglide: WIP before merge-first (${opts.physicalPath})`, { cwd });
		if (!wip.ok && !/nothing to commit/i.test(wip.stdout + wip.stderr)) {
			return lockFailure('WIP commit failed', {
				cwd,
				phase: 'wip_commit',
				recoveryContext
			}, wip);
		}
	}

	const remoteMeta = await fetchRemoteFileMtime(opts.gateway, opts.physicalPath);
	const remoteContent = await opts.fetchRemoteContent(opts.physicalPath);
	if (!remoteContent || remoteContent.body == null) {
		return { ok: false, error: 'Could not fetch remote file content for Merge first' };
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

	try {
		const abs = path.isAbsolute(opts.localFilePath)
			? opts.localFilePath
			: path.join(cwd, opts.localFilePath);
		fs.mkdirSync(path.dirname(abs), { recursive: true });
		fs.writeFileSync(abs, remoteContent.body, 'utf8');
		const commitRemote = await commitAllSafeAsync(
			`siteglide: remote copy for merge-first (${opts.physicalPath})`,
			{ cwd }
		);
		if (!commitRemote.ok && !/nothing to commit/i.test(commitRemote.stdout + commitRemote.stderr)) {
			await git(['checkout', originalBranch], { cwd });
			await git(['branch', '-D', branch], { cwd });
			return lockFailure('Remote snapshot commit failed', {
				cwd,
				phase: 'commit_remote',
				recoveryContext: Object.assign({}, recoveryContext, { mergeStrategy: created.strategy, baseSha: baseSha || null })
			}, commitRemote);
		}

		writeMergeManifest(opts.environment, {
			mode: 'sync_file',
			path: opts.physicalPath,
			remoteUpdatedAtAtFetch: remoteMeta.updatedAt || remoteContent.updatedAt || null,
			fetchedAt: new Date().toISOString(),
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
		return {
			ok: true,
			merged: merge.ok,
			conflictExpected: !merge.ok,
			mergeStrategy: created.strategy,
			tempBranch: branch,
			originalBranch,
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
 * Deploy/pull Merge first: full pull on temp branch then merge back.
 * @param {object} opts
 * @param {string} opts.environment
 * @param {() => Promise<void>} opts.pullFn async pull into cwd (already on temp branch)
 * @param {string} [opts.cwd]
 * @param {string} [opts.wipMessage] commit message for dirty working tree
 * @param {'deploy_full_pull'|'pull_full'} [opts.mode]
 */
async function mergeFirstDeploy(opts) {
	const cwd = opts.cwd || process.cwd();
	const mode = opts.mode || 'deploy_full_pull';
	const gate = assertCanStartMergeFirst(cwd);
	if (!gate.ok) {
		return gate;
	}

	const envSafe = String(opts.environment || 'env').replace(/[^a-zA-Z0-9._-]+/g, '-');
	const date = new Date().toISOString().slice(0, 10);
	const branch = mode === 'pull_full'
		? `temp-pull-from-${envSafe}-${date}`
		: `siteglide-merge-deploy/${process.pid}-${Date.now()}`;
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
		const wipMsg = opts.wipMessage || (
			mode === 'pull_full'
				? 'siteglide: WIP before merge-first pull'
				: 'siteglide: WIP before merge-first deploy'
		);
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
	const remoteCommitMsg = mode === 'pull_full'
		? 'siteglide: remote full pull for merge-first pull'
		: 'siteglide: remote full pull for merge-first deploy';
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
 * Whether a sync path is safe after merge-first (remote not edited since fetch).
 * @param {string} environment
 * @param {string} physicalPath
 * @param {string | null} remoteUpdatedAt
 * @param {string} [cwd]
 */
function isSafeAfterMergeFirst(environment, physicalPath, remoteUpdatedAt, cwd = process.cwd()) {
	const man = readMergeManifest(environment, cwd);
	if (!man || man.mode !== 'sync_file' || man.path !== physicalPath) {
		return false;
	}
	if (!remoteUpdatedAt || !man.remoteUpdatedAtAtFetch) {
		return false;
	}
	const remoteMs = Date.parse(remoteUpdatedAt);
	const fetchedMs = Date.parse(man.remoteUpdatedAtAtFetch);
	if (Number.isNaN(remoteMs) || Number.isNaN(fetchedMs)) {
		return false;
	}
	return remoteMs <= fetchedMs;
}

module.exports = {
	mergeManifestPath,
	readMergeManifest,
	writeMergeManifest,
	clearMergeManifest,
	assertCanStartMergeFirst,
	checkoutTempBranchForRemote,
	mergeFirstSyncFile,
	mergeFirstDeploy,
	mergeFirstPull,
	isSafeAfterMergeFirst
};
