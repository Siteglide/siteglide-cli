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
const { resolveMergeBase } = require('../pullBaseline');
const { userSegments, migrateLegacySiteglideLayout } = require('../siteglidePaths');
const {
	tempPullLog,
	tempPullGitSnapshot,
	formatGitResult,
	classifyBranchDeleteResult,
	classifyBranchCreateResult,
	matchBranchExistsHypotheses
} = require('./tempPullTrace');

const MERGE_DIR = userSegments('merge');

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
	const headBeforeDelete = await git(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd });
	tempPullLog('create_temp_branch:before_delete', {
		tempBranch: branch,
		baseSha: baseSha || 'orphan',
		strategy,
		head: headBeforeDelete.ok ? headBeforeDelete.stdout : formatGitResult(headBeforeDelete),
		environment: recoveryContext.environment || ''
	});
	tempPullGitSnapshot(cwd, 'before_temp_branch_delete', {
		environment: recoveryContext.environment,
		tempBranch: branch
	});

	if (baseSha) {
		tempPullLog('create_temp_branch:before_checkout_base', {
			tempBranch: branch,
			baseSha,
			args: `checkout -B ${branch} ${baseSha}`
		});
		const fromBase = await git(['checkout', '-B', branch, baseSha], { cwd });
		const createClass = classifyBranchCreateResult(fromBase);
		tempPullLog('create_temp_branch:after_checkout_base', {
			tempBranch: branch,
			git: formatGitResult(fromBase),
			hypothesis: createClass
		});
		if (createClass === 'H2_create_blocked_already_exists') {
			tempPullLog('hypothesis_confirm', {
				id: 'H2',
				expect: 'ref still present (packed-refs or checked out) after failed delete; see prior after_delete hypothesis'
			});
			tempPullLog('hypothesis_match', {
				tags: matchBranchExistsHypotheses(fromBase.stderr).join(',')
			});
		}
		if (!fromBase.ok) {
			tempPullGitSnapshot(cwd, 'create_temp_branch_checkout_failed', {
				environment: recoveryContext.environment,
				tempBranch: branch
			});
			return lockFailure('Failed to create temp branch from merge base', {
				cwd,
				phase: 'create_temp_branch',
				recoveryContext: Object.assign({}, recoveryContext, { tempBranch: branch, mergeStrategy: strategy })
			}, fromBase);
		}
		tempPullGitSnapshot(cwd, 'create_temp_branch_ok', {
			environment: recoveryContext.environment,
			tempBranch: branch
		});
		return { ok: true, strategy };
	}

	tempPullLog('create_temp_branch:before_orphan', { tempBranch: branch });
	const orphan = await git(['checkout', '--orphan', branch], { cwd });
	tempPullLog('create_temp_branch:after_orphan', {
		tempBranch: branch,
		git: formatGitResult(orphan)
	});
	if (!orphan.ok) {
		tempPullGitSnapshot(cwd, 'create_temp_branch_orphan_failed', {
			environment: recoveryContext.environment,
			tempBranch: branch
		});
		return lockFailure('Failed to create orphan temp branch', {
			cwd,
			phase: 'create_temp_branch',
			recoveryContext: Object.assign({}, recoveryContext, { tempBranch: branch, mergeStrategy: 'orphan' })
		}, orphan);
	}
	const rmCached = await git(['rm', '-rf', '--cached', '.'], { cwd });
	const clean = await git(['clean', '-fd'], { cwd });
	tempPullLog('create_temp_branch:orphan_cleanup', {
		rmCached: formatGitResult(rmCached),
		clean: formatGitResult(clean)
	});
	tempPullGitSnapshot(cwd, 'create_temp_branch_orphan_ok', {
		environment: recoveryContext.environment,
		tempBranch: branch
	});
	return { ok: true, strategy: 'orphan' };
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
		// UTC, minute precision, ref-safe (no : or T) — avoids same-day reuse after a failed pull
		const iso = new Date().toISOString();
		const stamp = `${iso.slice(0, 10)}-${iso.slice(11, 13)}${iso.slice(14, 16)}`;
		return `temp-pull-from-${envSafe}-${stamp}`;
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
 * Branch name for merge-first. Empty repos (git init, no commits yet) have a symbolic
 * ref but `rev-parse --abbrev-ref HEAD` fails until the first commit exists.
 *
 * @param {string} cwd
 * @returns {Promise<{ ok: boolean, branch?: string, emptyRepo?: boolean, error?: string }>}
 */
async function resolveOriginalBranchName(cwd) {
	const headVerify = await git(['rev-parse', '--verify', 'HEAD'], { cwd });
	if (headVerify.ok) {
		const current = await git(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd });
		if (
			current.ok
			&& current.stdout
			&& current.stdout !== 'HEAD'
		) {
			return { ok: true, branch: current.stdout, emptyRepo: false };
		}
	}
	const sym = await git(['symbolic-ref', '--short', 'HEAD'], { cwd });
	if (sym.ok && sym.stdout) {
		return { ok: true, branch: sym.stdout, emptyRepo: true };
	}
	return { ok: false, error: 'Could not determine current branch' };
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
	tempPullLog('merge_first:start', {
		mode,
		environment: opts.environment,
		cwd,
		pid: process.pid,
		nestedCli: process.env.SITEGLIDE_NESTED_CLI || ''
	});
	tempPullGitSnapshot(cwd, 'merge_first_start', { environment: opts.environment });

	const gate = assertCanStartMergeFirst(cwd);
	tempPullLog('merge_first:gate', { ok: gate.ok, error: gate.error || '' });
	if (!gate.ok) {
		return gate;
	}

	const branch = tempBranchNameForMode(mode, opts.environment);
	tempPullLog('merge_first:temp_branch_name', { tempBranch: branch, mode });
	const branchInfo = await resolveOriginalBranchName(cwd);
	if (!branchInfo.ok) {
		tempPullLog('merge_first:head_failed', { error: branchInfo.error || '' });
		return { ok: false, error: branchInfo.error || 'Could not determine current branch' };
	}
	const originalBranch = branchInfo.branch;
	const emptyRepo = branchInfo.emptyRepo;
	tempPullLog('merge_first:original_branch', {
		originalBranch,
		tempBranch: branch,
		emptyRepo: Boolean(emptyRepo)
	});
	if (emptyRepo) {
		tempPullLog('hypothesis_confirm', {
			id: 'H4_empty_repo',
			expect: 'git init with no commits yet; seed initial commit before temp branch (was: Could not determine current branch)'
		});
	}
	if (/^temp-pull-from-/.test(originalBranch)) {
		tempPullLog('hypothesis_confirm', {
			id: 'H1_or_H2',
			expect: 'prior merge-first did not return to original branch; user may see a second Pull and merge prompt on retry'
		});
	}
	if (originalBranch === branch) {
		tempPullLog('hypothesis_confirm', {
			id: 'H2',
			expect: 'already on intended temp branch name before create; delete/checkout sequence likely fails'
		});
	}
	const recoveryContext = {
		environment: opts.environment,
		mode,
		originalBranch,
		tempBranch: branch,
		mergeManifestPath: mergeManifestPath(opts.environment, cwd)
	};

	if (emptyRepo || hasStagedOrUnstagedChanges(cwd)) {
		const wipMsg = opts.wipMessage || defaultWipMessage(mode);
		tempPullLog('merge_first:wip_commit_start', {
			wipMessageLen: wipMsg.length,
			emptyRepo: Boolean(emptyRepo)
		});
		const wip = await commitAllSafeAsync(wipMsg, { cwd });
		tempPullLog('merge_first:wip_commit_done', { git: formatGitResult(wip) });
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
	tempPullLog('merge_first:merge_base', {
		baseSha: baseSha || '',
		strategy: mergeBase ? mergeBase.strategy : 'orphan'
	});
	const created = await checkoutTempBranchForRemote(
		branch,
		baseSha,
		cwd,
		mergeBase ? mergeBase.strategy : 'orphan',
		recoveryContext
	);
	if (!created.ok) {
		const errHypotheses = matchBranchExistsHypotheses(created.error || '');
		if (errHypotheses.length) {
			tempPullLog('hypothesis_match', { tags: errHypotheses.join(','), phase: 'create_temp_branch' });
		}
		return created;
	}

	const pulledAt = new Date().toISOString();
	const remoteCommitMsg = remoteSnapshotCommitMessage(mode);
	try {
		tempPullLog('merge_first:pullFn_start', { tempBranch: branch });
		tempPullGitSnapshot(cwd, 'before_nested_pull', {
			environment: opts.environment,
			tempBranch: branch
		});
		await opts.pullFn();
		tempPullLog('merge_first:pullFn_done', { tempBranch: branch });
		tempPullGitSnapshot(cwd, 'after_nested_pull', {
			environment: opts.environment,
			tempBranch: branch
		});
		const commitRemote = await commitAllSafeAsync(remoteCommitMsg, { cwd });
		tempPullLog('merge_first:remote_snapshot_commit', { git: formatGitResult(commitRemote) });
		if (!commitRemote.ok && !/nothing to commit/i.test(commitRemote.stdout + commitRemote.stderr)) {
			const recoverCheckout = await git(['checkout', originalBranch], { cwd });
			const recoverDelete = await git(['branch', '-D', branch], { cwd });
			tempPullLog('merge_first:recover_after_remote_commit_fail', {
				checkout: formatGitResult(recoverCheckout),
				delete: formatGitResult(recoverDelete)
			});
			return lockFailure('Remote pull snapshot commit failed', {
				cwd,
				phase: 'commit_remote',
				recoveryContext: Object.assign({}, recoveryContext, { mergeStrategy: created.strategy, baseSha: baseSha || null })
			}, commitRemote);
		}

		const manifestPath = writeMergeManifest(opts.environment, {
			mode,
			remoteSnapshotAt: pulledAt,
			pulledAt,
			tempBranch: branch,
			originalBranch,
			mergeStrategy: created.strategy,
			baseSha: baseSha || null
		}, cwd);
		tempPullLog('merge_first:merge_manifest_written', {
			path: manifestPath,
			tempBranch: branch,
			originalBranch,
			mergeStrategy: created.strategy
		});

		const checkoutOriginal = await git(['checkout', originalBranch], { cwd });
		tempPullLog('merge_first:checkout_original', {
			originalBranch,
			git: formatGitResult(checkoutOriginal)
		});
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
		tempPullLog('merge_first:merge_start', { args: mergeArgs.join(' ') });
		const merge = await git(mergeArgs, { cwd });
		tempPullLog('merge_first:merge_done', {
			git: formatGitResult(merge),
			conflictExpected: !merge.ok
		});
		tempPullGitSnapshot(cwd, 'after_merge', {
			environment: opts.environment,
			tempBranch: branch
		});
		if (!merge.ok && (merge.timedOut || isGitLockError(merge))) {
			return lockFailure('Merge failed', {
				cwd,
				phase: 'merge',
				recoveryContext: Object.assign({}, recoveryContext, { mergeStrategy: created.strategy, baseSha: baseSha || null })
			}, merge);
		}
		const deleteTemp = await git(['branch', '-D', branch], { cwd });
		tempPullLog('merge_first:delete_temp_branch', {
			tempBranch: branch,
			git: formatGitResult(deleteTemp)
		});
		tempPullGitSnapshot(cwd, 'merge_first_success', { environment: opts.environment });

		if (!merge.ok) {
			tempPullLog('hypothesis_confirm', {
				id: 'H1',
				expect: 'merge conflict or incomplete merge; retry may hit dirty_skip_outer_prompt then dirty_inner_merge_prompt (second Pull and merge wording)'
			});
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
		tempPullLog('merge_first:catch', { error: err.message || String(err) });
		const recoverCheckout = await git(['checkout', originalBranch], { cwd });
		const recoverDelete = await git(['branch', '-D', branch], { cwd });
		tempPullLog('merge_first:catch_recovery', {
			checkout: formatGitResult(recoverCheckout),
			delete: formatGitResult(recoverDelete)
		});
		tempPullGitSnapshot(cwd, 'merge_first_catch', {
			environment: opts.environment,
			tempBranch: branch
		});
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
	resolveOriginalBranchName,
	checkoutTempBranchForRemote,
	mergeFirstDeploy,
	mergeFirstPull,
	mergeFirstSyncPull,
	isSafeAfterMergeFirst,
	SNAPSHOT_MANIFEST_MODES
};
