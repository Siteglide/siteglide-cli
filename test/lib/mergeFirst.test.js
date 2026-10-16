const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { run } = require('../../lib/git/readiness');
const { writePullBaseline, resolveLastPullCommit, resolveMergeBase, readPullBaseline } = require('../../lib/pullBaseline');
const { mergeFirstDeploy, checkoutTempBranchForRemote } = require('../../lib/git/mergeFirst');
const { listTrackedSiteglideUserFiles } = require('../../lib/git/siteglideGitignore');
const { finalizePullBaseline } = require('../../lib/git/finalizePullBaseline');
const { hasOpenGitConflicts: hasConflicts } = require('../../lib/git/workingTree');
const { readHomeBranch, homeBranchPath } = require('../../lib/git/homeBranch');

function gitInit(cwd) {
	assert.equal(run('git', ['init'], { cwd }).ok, true);
	run('git', ['config', 'user.email', 'test@example.com'], { cwd });
	run('git', ['config', 'user.name', 'Test User'], { cwd });
	// Avoid depending on default branch name across git versions.
	run('git', ['checkout', '-b', 'main'], { cwd });
}

function commitAll(cwd, message) {
	run('git', ['add', '-A'], { cwd });
	const c = run('git', ['commit', '-m', message], { cwd });
	assert.equal(c.ok, true, c.stderr || c.stdout);
	return run('git', ['rev-parse', 'HEAD'], { cwd }).stdout;
}

describe('mergeFirst last-pull base', () => {
	let cwd;

	beforeEach(() => {
		cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-merge-base-'));
		gitInit(cwd);
	});

	afterEach(() => {
		fs.rmSync(cwd, { recursive: true, force: true });
	});

	it('resolveLastPullCommit requires ancestor of HEAD', () => {
		fs.writeFileSync(path.join(cwd, 'a.txt'), 'base\n');
		const b = commitAll(cwd, 'base');
		writePullBaseline('staging', { cwd, lastPulledAt: '2026-01-01T00:00:00.000Z', lastPullCommit: b });
		assert.equal(resolveLastPullCommit('staging', cwd), b);

		fs.writeFileSync(path.join(cwd, 'a.txt'), 'local\n');
		commitAll(cwd, 'local');
		assert.equal(resolveLastPullCommit('staging', cwd), b);

		writePullBaseline('staging', {
			cwd,
			lastPulledAt: '2026-01-01T00:00:00.000Z',
			lastPullCommit: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef'
		});
		assert.equal(resolveLastPullCommit('staging', cwd), null);
	});

	it('resolveMergeBase has no base without lastPullCommit, even when there is an initial commit', () => {
		fs.writeFileSync(path.join(cwd, 'a.txt'), 'base\n');
		commitAll(cwd, 'initial');
		fs.writeFileSync(path.join(cwd, 'a.txt'), 'local\n');
		commitAll(cwd, 'local');
		assert.equal(resolveMergeBase('staging', cwd), null);
	});

	it('conflicts when both sides change the same file since lastPullCommit', async () => {
		fs.writeFileSync(path.join(cwd, 'a.txt'), 'base\n');
		const b = commitAll(cwd, 'base');
		writePullBaseline('staging', { cwd, lastPulledAt: '2026-01-01T00:00:00.000Z', lastPullCommit: b });

		fs.writeFileSync(path.join(cwd, 'a.txt'), 'local\n');
		commitAll(cwd, 'local');

		const result = await mergeFirstDeploy({
			environment: 'staging',
			cwd,
			mode: 'pull_full',
			pullFn: async () => {
				fs.writeFileSync(path.join(cwd, 'a.txt'), 'remote\n');
			}
		});
		assert.equal(result.ok, true);
		assert.equal(result.mergeStrategy, 'last_pull_base');
		assert.equal(result.merged, false);
		assert.equal(result.conflictExpected, true);
		assert.equal(hasConflicts(cwd).open, true);
	});

	it('commits a dirty tree with the given wipMessage before the temp branch exists, in every mode', async () => {
		for (const mode of ['deploy_full_pull', 'sync_full_pull']) {
			const repo = fs.mkdtempSync(path.join(os.tmpdir(), `sg-wip-${mode}-`));
			try {
				gitInit(repo);
				fs.writeFileSync(path.join(repo, 'a.txt'), 'base\n');
				const b = commitAll(repo, 'base');
				writePullBaseline('staging', { cwd: repo, lastPulledAt: '2026-01-01T00:00:00.000Z', lastPullCommit: b });
				fs.writeFileSync(path.join(repo, 'wip.txt'), 'half done\n');

				let wipSubjectDuringPull = null;
				const result = await mergeFirstDeploy({
					environment: 'staging',
					cwd: repo,
					mode,
					wipMessage: 'Snapshot before merging staging 2026-10-16',
					pullFn: async () => {
						// On the temp branch now: the WIP commit must already be on the home branch.
						wipSubjectDuringPull = run('git', ['log', '-1', '--format=%s', 'main'], { cwd: repo }).stdout;
						fs.writeFileSync(path.join(repo, 'a.txt'), 'remote\n');
					}
				});
				assert.equal(result.ok, true, `${mode}: ${result.error || ''}`);
				assert.equal(wipSubjectDuringPull, 'Snapshot before merging staging 2026-10-16', mode);
				const subjects = run('git', ['log', '--format=%s', 'main'], { cwd: repo }).stdout.split('\n');
				assert.ok(subjects.includes('Snapshot before merging staging 2026-10-16'), `${mode}: ${subjects.join(' | ')}`);
				assert.equal(fs.readFileSync(path.join(repo, 'wip.txt'), 'utf8').replace(/\r\n/g, '\n'), 'half done\n');
			} finally {
				fs.rmSync(repo, { recursive: true, force: true });
			}
		}
	});

	it('auto-takes remote-only change since lastPullCommit with no conflict', async () => {
		fs.writeFileSync(path.join(cwd, 'a.txt'), 'base\n');
		fs.writeFileSync(path.join(cwd, 'b.txt'), 'keep\n');
		const b = commitAll(cwd, 'base');
		writePullBaseline('staging', { cwd, lastPulledAt: '2026-01-01T00:00:00.000Z', lastPullCommit: b });

		// Local-only change on another file so HEAD moves past B.
		fs.writeFileSync(path.join(cwd, 'local-only.txt'), 'mine\n');
		commitAll(cwd, 'local only');

		const result = await mergeFirstDeploy({
			environment: 'staging',
			cwd,
			mode: 'pull_full',
			pullFn: async () => {
				fs.writeFileSync(path.join(cwd, 'a.txt'), 'remote\n');
				fs.writeFileSync(path.join(cwd, 'b.txt'), 'keep\n');
			}
		});
		assert.equal(result.ok, true);
		assert.equal(result.mergeStrategy, 'last_pull_base');
		assert.equal(result.merged, true);
		assert.equal(hasConflicts(cwd).open, false);
		assert.equal(fs.readFileSync(path.join(cwd, 'a.txt'), 'utf8').replace(/\r\n/g, '\n'), 'remote\n');
		assert.equal(fs.readFileSync(path.join(cwd, 'local-only.txt'), 'utf8').replace(/\r\n/g, '\n'), 'mine\n');
		finalizePullBaseline({ environment: 'staging', cwd });
		const baseline = readPullBaseline('staging', cwd);
		assert.ok(baseline.lastPullCommit);
		assert.notEqual(baseline.lastPullCommit, b);
	});

	it('checkoutTempBranchForRemote uses checkout -B when already on the temp branch', async () => {
		fs.writeFileSync(path.join(cwd, 'a.txt'), 'base\n');
		const initial = commitAll(cwd, 'initial');
		const branch = 'temp-pull-from-staging-2099-01-01-0000';
		const onTemp = run('git', ['checkout', '-b', branch, initial], { cwd });
		assert.equal(onTemp.ok, true, onTemp.stderr);
		fs.writeFileSync(path.join(cwd, 'extra.txt'), 'wip\n');
		commitAll(cwd, 'wip on temp');

		const again = await checkoutTempBranchForRemote(branch, initial, cwd, 'last_pull_base', {
			environment: 'staging'
		});
		assert.equal(again.ok, true, again.error);
		assert.equal(
			run('git', ['log', '--format=%s', `${initial}..HEAD`], { cwd }).stdout,
			'siteglide: ignore .siteglide/user/ on temp branch'
		);
		assert.equal(run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd }).stdout, branch);
	});

	it('merge-first succeeds on empty repo (git init, no commits) with untracked pull tree', async () => {
		fs.writeFileSync(path.join(cwd, 'README.md'), 'from first pull\n');
		fs.writeFileSync(path.join(cwd, 'same.txt'), 'same\n');
		const result = await mergeFirstDeploy({
			environment: 'staging',
			cwd,
			mode: 'pull_full',
			pullFn: async () => {
				fs.writeFileSync(path.join(cwd, 'README.md'), 'from second pull\n');
				fs.writeFileSync(path.join(cwd, 'same.txt'), 'same\n');
			}
		});
		assert.deepEqual(
			{
				ok: result.ok,
				mergeStrategy: result.mergeStrategy,
				head: run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd }).stdout,
				conflicted: run('git', ['diff', '--name-only', '--diff-filter=U'], { cwd }).stdout
			},
			{ ok: true, mergeStrategy: 'orphan', head: 'main', conflicted: 'README.md' }
		);
	});

	it('clears tracked .siteglide/user from merge base so checkout original branch succeeds', async () => {
		const userFile = path.join(cwd, '.siteglide', 'user', 'pull', 'foo.json');
		fs.mkdirSync(path.dirname(userFile), { recursive: true });
		fs.writeFileSync(userFile, '{"v":1}');
		fs.writeFileSync(path.join(cwd, 'keep.txt'), 'base\n');
		const oldBase = commitAll(cwd, 'track user in base');
		writePullBaseline('staging', {
			cwd,
			lastPulledAt: '2026-01-01T00:00:00.000Z',
			lastPullCommit: oldBase
		});

		fs.writeFileSync(path.join(cwd, '.gitignore'), '.siteglide/user/\n');
		assert.equal(
			run('git', ['rm', '-r', '--cached', '--ignore-unmatch', '--', '.siteglide/user'], { cwd }).ok,
			true
		);
		fs.writeFileSync(path.join(cwd, 'keep.txt'), 'local\n');
		commitAll(cwd, 'stop tracking user on main');

		const result = await mergeFirstDeploy({
			environment: 'staging',
			cwd,
			mode: 'pull_full',
			pullFn: async () => {
				fs.writeFileSync(userFile, '{"v":2}');
			}
		});
		assert.equal(result.ok, true);
		assert.equal(result.originalBranch, 'main');
		assert.equal(run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd }).stdout, 'main');
		assert.deepEqual(listTrackedSiteglideUserFiles(cwd), []);
		const tempRef = run('git', ['show-ref', '--verify', `refs/heads/${result.tempBranch}`], { cwd });
		assert.equal(tempRef.ok, false);
		assert.equal(fs.existsSync(userFile), true);
	});

	it('without lastPullCommit, a remote change to a file untouched since the initial commit is a conflict, not taken', async () => {
		fs.writeFileSync(path.join(cwd, 'a.txt'), 'base\n');
		fs.writeFileSync(path.join(cwd, 'b.txt'), 'base\n');
		fs.writeFileSync(path.join(cwd, 'same.txt'), 'same\n');
		commitAll(cwd, 'initial');
		fs.writeFileSync(path.join(cwd, 'a.txt'), 'local\n');
		fs.writeFileSync(path.join(cwd, 'local-only.txt'), 'mine\n');
		commitAll(cwd, 'local');

		const result = await mergeFirstDeploy({
			environment: 'staging',
			cwd,
			mode: 'pull_full',
			pullFn: async () => {
				fs.writeFileSync(path.join(cwd, 'a.txt'), 'remote\n');
				fs.writeFileSync(path.join(cwd, 'b.txt'), 'remote\n');
				fs.writeFileSync(path.join(cwd, 'same.txt'), 'same\n');
			}
		});
		assert.deepEqual(
			{
				ok: result.ok,
				mergeStrategy: result.mergeStrategy,
				merged: result.merged,
				conflicted: run('git', ['diff', '--name-only', '--diff-filter=U'], { cwd }).stdout.split(/\r?\n/).sort(),
				localOnlyKept: fs.existsSync(path.join(cwd, 'local-only.txt'))
			},
			{
				ok: true,
				mergeStrategy: 'orphan',
				merged: false,
				conflicted: ['a.txt', 'b.txt'],
				localOnlyKept: true
			}
		);
	});
});

describe('mergeFirst home branch record', () => {
	let cwd;

	beforeEach(() => {
		cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-home-branch-'));
		gitInit(cwd);
		fs.writeFileSync(path.join(cwd, '.gitignore'), '.siteglide/user/\n');
		fs.writeFileSync(path.join(cwd, 'a.txt'), 'base\n');
		const b = commitAll(cwd, 'base');
		writePullBaseline('staging', { cwd, lastPulledAt: '2026-01-01T00:00:00.000Z', lastPullCommit: b });
		fs.writeFileSync(path.join(cwd, 'a.txt'), 'local\n');
		commitAll(cwd, 'local');
	});

	afterEach(() => {
		fs.rmSync(cwd, { recursive: true, force: true });
	});

	it('records the home branch while pulling and clears it after the merge', async () => {
		let duringPull = null;
		let branchDuringPull = null;
		const result = await mergeFirstDeploy({
			environment: 'staging',
			cwd,
			mode: 'pull_full',
			pullFn: async () => {
				duringPull = readHomeBranch(cwd);
				branchDuringPull = run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd }).stdout;
				fs.writeFileSync(path.join(cwd, 'remote-only.txt'), 'remote\n');
			}
		});
		assert.equal(result.ok, true);
		assert.deepEqual(
			{
				homeBranch: duringPull.homeBranch,
				temporaryBranch: duringPull.temporaryBranch,
				command: duringPull.command,
				environment: duringPull.environment,
				mergeStrategy: duringPull.mergeStrategy,
				ownerPid: duringPull.ownerPid,
				phase: duringPull.phase
			},
			{
				homeBranch: 'main',
				temporaryBranch: branchDuringPull,
				command: 'pull',
				environment: 'staging',
				mergeStrategy: 'last_pull_base',
				ownerPid: process.pid,
				phase: 'pulling'
			}
		);
		assert.equal(fs.existsSync(homeBranchPath(cwd)), false);
	});

	it('clears the record when the pull fails and recovery returns home', async () => {
		const result = await mergeFirstDeploy({
			environment: 'staging',
			cwd,
			mode: 'pull_full',
			pullFn: async () => {
				throw new Error('fetch failed');
			}
		});
		assert.equal(result.ok, false);
		assert.equal(run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd }).stdout, 'main');
		assert.equal(fs.existsSync(homeBranchPath(cwd)), false);
	});

	it('keeps the record when recovery cannot return to the home branch', async () => {
		const result = await mergeFirstDeploy({
			environment: 'staging',
			cwd,
			mode: 'pull_full',
			pullFn: async () => {
				// Uncommitted change to a file that differs on main blocks `git checkout main`.
				fs.writeFileSync(path.join(cwd, 'a.txt'), 'partial download\n');
				throw new Error('fetch failed');
			}
		});
		assert.equal(result.ok, false);
		const current = run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd }).stdout;
		assert.notEqual(current, 'main');
		const record = readHomeBranch(cwd);
		assert.deepEqual(
			{ homeBranch: record.homeBranch, temporaryBranch: record.temporaryBranch, phase: record.phase },
			{ homeBranch: 'main', temporaryBranch: current, phase: 'pulling' }
		);
	});
});

describe('mergeFirst ignore policy on a merge base without it', () => {
	let cwd;

	beforeEach(() => {
		cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-ignore-base-'));
		gitInit(cwd);
		fs.writeFileSync(path.join(cwd, 'a.txt'), 'base\n');
		const b = commitAll(cwd, 'base');
		writePullBaseline('staging', { cwd, lastPulledAt: '2026-01-01T00:00:00.000Z', lastPullCommit: b });
		fs.writeFileSync(path.join(cwd, 'a.txt'), 'local\n');
		commitAll(cwd, 'local');
	});

	afterEach(() => {
		fs.rmSync(cwd, { recursive: true, force: true });
	});

	it('returns to the home branch when the pull fails', async () => {
		const result = await mergeFirstDeploy({
			environment: 'staging',
			cwd,
			mode: 'pull_full',
			pullFn: async () => {
				throw new Error('fetch failed');
			}
		});
		assert.equal(result.ok, false);
		assert.deepEqual(
			{
				head: run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd }).stdout,
				branches: run('git', ['branch', '--format=%(refname:short)'], { cwd }).stdout,
				status: run('git', ['status', '--porcelain'], { cwd }).stdout,
				recordKept: fs.existsSync(homeBranchPath(cwd))
			},
			{ head: 'main', branches: 'main', status: '', recordKept: false }
		);
	});

	it('merges cleanly and keeps the ignore rule on the home branch', async () => {
		const result = await mergeFirstDeploy({
			environment: 'staging',
			cwd,
			mode: 'pull_full',
			pullFn: async () => {
				fs.writeFileSync(path.join(cwd, 'remote-only.txt'), 'remote\n');
			}
		});
		assert.deepEqual(
			{ ok: result.ok, merged: result.merged, head: run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd }).stdout },
			{ ok: true, merged: true, head: 'main' }
		);
		assert.equal(run('git', ['check-ignore', '-q', '.siteglide/user/x.json'], { cwd }).ok, true);
	});
});

describe('mergeFirst orphan temp branch keeps the home ignore rules', () => {
	let cwd;

	beforeEach(() => {
		cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-orphan-'));
		gitInit(cwd);
		fs.writeFileSync(path.join(cwd, '.gitignore'), '.siteglide/user/\n.siteglide-config\nnode_modules/\n.env\n');
		fs.writeFileSync(path.join(cwd, 'a.txt'), 'local\n');
		commitAll(cwd, 'root one');
		// A second root commit makes resolveMergeBase fall back to an orphan temp branch.
		run('git', ['checkout', '--orphan', 'other'], { cwd });
		run('git', ['rm', '-rf', '--cached', '.'], { cwd });
		run('git', ['clean', '-fdq'], { cwd });
		fs.writeFileSync(path.join(cwd, 'b.txt'), 'other\n');
		commitAll(cwd, 'root two');
		run('git', ['checkout', 'main'], { cwd });
		assert.equal(run('git', ['merge', '--allow-unrelated-histories', '-m', 'join', 'other'], { cwd }).ok, true);
		run('git', ['branch', '-D', 'other'], { cwd });
		fs.mkdirSync(path.join(cwd, 'node_modules', 'x'), { recursive: true });
		fs.writeFileSync(path.join(cwd, 'node_modules', 'x', 'index.js'), '1\n');
		fs.writeFileSync(path.join(cwd, '.env'), 'SECRET=1\n');
	});

	afterEach(() => {
		fs.rmSync(cwd, { recursive: true, force: true });
	});

	it('snapshots only the pulled files and merges back onto the home branch', async () => {
		const result = await mergeFirstDeploy({
			environment: 'staging',
			cwd,
			mode: 'pull_full',
			pullFn: async () => {
				fs.writeFileSync(path.join(cwd, 'a.txt'), 'local\n');
				fs.writeFileSync(path.join(cwd, 'remote-only.txt'), 'remote\n');
			}
		});
		assert.deepEqual(
			{
				ok: result.ok,
				merged: result.merged,
				mergeStrategy: result.mergeStrategy,
				head: run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd }).stdout,
				branches: run('git', ['branch', '--format=%(refname:short)'], { cwd }).stdout,
				snapshotFiles: run('git', ['show', '--name-only', '--format=', 'HEAD^2'], { cwd }).stdout.split(/\r?\n/).sort(),
				trackedOnHome: run('git', ['ls-files'], { cwd }).stdout.split(/\r?\n/).sort(),
				recordKept: fs.existsSync(homeBranchPath(cwd))
			},
			{
				ok: true,
				merged: true,
				mergeStrategy: 'orphan',
				head: 'main',
				branches: 'main',
				snapshotFiles: ['a.txt', 'remote-only.txt'],
				trackedOnHome: ['.gitignore', 'a.txt', 'b.txt', 'remote-only.txt'],
				recordKept: false
			}
		);
		assert.deepEqual(
			{
				nodeModules: fs.existsSync(path.join(cwd, 'node_modules', 'x', 'index.js')),
				env: fs.existsSync(path.join(cwd, '.env'))
			},
			{ nodeModules: true, env: true }
		);
	});
});
