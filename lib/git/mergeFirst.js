/**
 * Merge-first: create WIP commit, temp branch with remote content, merge into
 * current branch so users/AI get real conflict markers.
 *
 * Sync mode: one file body from GraphQL.
 * Deploy mode: full pull on the temp branch (caller supplies pullFn).
 */

const fs = require('fs');
const path = require('path');
const { run, getGitReadiness } = require('./readiness');
const { commitAllSafe, hasStagedOrUnstagedChanges } = require('./commit');
const { hasOpenGitConflicts } = require('./workingTree');
const { fetchRemoteFileMtime } = require('../remoteMtimeCheck');

const MERGE_DIR = ['.siteglide', 'merge'];

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
 * Sync Merge first for a single physical path.
 * Expects gateway.graph available for content — we use admin queries that return body when possible.
 * For assets, body may be missing; caller should treat failure.
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
	const current = run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd });
	if (!current.ok) {
		return { ok: false, error: 'Could not determine current branch' };
	}
	const originalBranch = current.stdout;

	if (hasStagedOrUnstagedChanges(cwd)) {
		const wip = commitAllSafe(`siteglide: WIP before merge-first (${opts.physicalPath})`, { cwd });
		if (!wip.ok && !/nothing to commit/i.test(wip.stdout + wip.stderr)) {
			return { ok: false, error: `WIP commit failed: ${wip.stderr || wip.stdout}` };
		}
	}

	const remoteMeta = await fetchRemoteFileMtime(opts.gateway, opts.physicalPath);
	const remoteContent = await opts.fetchRemoteContent(opts.physicalPath);
	if (!remoteContent || remoteContent.body == null) {
		return { ok: false, error: 'Could not fetch remote file content for Merge first' };
	}

	const checkoutNew = run('git', ['checkout', '-b', branch], { cwd });
	if (!checkoutNew.ok) {
		return { ok: false, error: checkoutNew.stderr || checkoutNew.stdout };
	}

	try {
		const abs = path.isAbsolute(opts.localFilePath)
			? opts.localFilePath
			: path.join(cwd, opts.localFilePath);
		fs.mkdirSync(path.dirname(abs), { recursive: true });
		fs.writeFileSync(abs, remoteContent.body, 'utf8');
		const commitRemote = commitAllSafe(`siteglide: remote copy for merge-first (${opts.physicalPath})`, { cwd });
		if (!commitRemote.ok && !/nothing to commit/i.test(commitRemote.stdout + commitRemote.stderr)) {
			run('git', ['checkout', originalBranch], { cwd });
			run('git', ['branch', '-D', branch], { cwd });
			return { ok: false, error: commitRemote.stderr || commitRemote.stdout };
		}

		writeMergeManifest(opts.environment, {
			mode: 'sync_file',
			path: opts.physicalPath,
			remoteUpdatedAtAtFetch: remoteMeta.updatedAt || remoteContent.updatedAt || null,
			fetchedAt: new Date().toISOString(),
			tempBranch: branch,
			originalBranch
		}, cwd);

		run('git', ['checkout', originalBranch], { cwd });
		const merge = run('git', ['merge', '--no-ff', branch], { cwd });
		// Expect conflicts — merge.ok may be false
		return {
			ok: true,
			merged: merge.ok,
			conflictExpected: !merge.ok,
			tempBranch: branch,
			originalBranch,
			stdout: merge.stdout,
			stderr: merge.stderr
		};
	} catch (err) {
		run('git', ['checkout', originalBranch], { cwd });
		return { ok: false, error: err.message || String(err) };
	}
}

/**
 * Deploy Merge first: full pull on temp branch then merge back.
 * @param {object} opts
 * @param {string} opts.environment
 * @param {() => Promise<void>} opts.pullFn async pull into cwd (already on temp branch)
 * @param {string} [opts.cwd]
 */
async function mergeFirstDeploy(opts) {
	const cwd = opts.cwd || process.cwd();
	const gate = assertCanStartMergeFirst(cwd);
	if (!gate.ok) {
		return gate;
	}

	const branch = `siteglide-merge-deploy/${process.pid}-${Date.now()}`;
	const current = run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd });
	if (!current.ok) {
		return { ok: false, error: 'Could not determine current branch' };
	}
	const originalBranch = current.stdout;

	if (hasStagedOrUnstagedChanges(cwd)) {
		const wip = commitAllSafe('siteglide: WIP before merge-first deploy', { cwd });
		if (!wip.ok && !/nothing to commit/i.test(wip.stdout + wip.stderr)) {
			return { ok: false, error: `WIP commit failed: ${wip.stderr || wip.stdout}` };
		}
	}

	const checkoutNew = run('git', ['checkout', '-b', branch], { cwd });
	if (!checkoutNew.ok) {
		return { ok: false, error: checkoutNew.stderr || checkoutNew.stdout };
	}

	const pulledAt = new Date().toISOString();
	try {
		await opts.pullFn();
		const commitRemote = commitAllSafe('siteglide: remote full pull for merge-first deploy', { cwd });
		if (!commitRemote.ok && !/nothing to commit/i.test(commitRemote.stdout + commitRemote.stderr)) {
			run('git', ['checkout', originalBranch], { cwd });
			run('git', ['branch', '-D', branch], { cwd });
			return { ok: false, error: commitRemote.stderr || commitRemote.stdout };
		}

		writeMergeManifest(opts.environment, {
			mode: 'deploy_full_pull',
			remoteSnapshotAt: pulledAt,
			pulledAt,
			tempBranch: branch,
			originalBranch
		}, cwd);

		run('git', ['checkout', originalBranch], { cwd });
		const merge = run('git', ['merge', '--no-ff', branch], { cwd });
		return {
			ok: true,
			merged: merge.ok,
			conflictExpected: !merge.ok,
			tempBranch: branch,
			originalBranch,
			remoteSnapshotAt: pulledAt,
			stdout: merge.stdout,
			stderr: merge.stderr
		};
	} catch (err) {
		run('git', ['checkout', originalBranch], { cwd });
		return { ok: false, error: err.message || String(err) };
	}
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
	mergeFirstSyncFile,
	mergeFirstDeploy,
	isSafeAfterMergeFirst
};
