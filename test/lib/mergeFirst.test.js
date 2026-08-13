const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { run } = require('../../lib/git/readiness');
const { writePullBaseline, resolveLastPullCommit, resolveMergeBase, readPullBaseline } = require('../../lib/pullBaseline');
const { mergeFirstDeploy } = require('../../lib/git/mergeFirst');
const { hasOpenGitConflicts: hasConflicts } = require('../../lib/git/workingTree');

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

	it('resolveMergeBase falls back to initial commit when no lastPullCommit', () => {
		fs.writeFileSync(path.join(cwd, 'a.txt'), 'base\n');
		const initial = commitAll(cwd, 'initial');
		fs.writeFileSync(path.join(cwd, 'a.txt'), 'local\n');
		commitAll(cwd, 'local');
		const base = resolveMergeBase('staging', cwd);
		assert.deepEqual(base, { sha: initial, strategy: 'initial_commit' });
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
		const baseline = readPullBaseline('staging', cwd);
		assert.ok(baseline.lastPullCommit);
		assert.notEqual(baseline.lastPullCommit, b);
	});

	it('uses initial commit as base when no lastPullCommit and both sides diverge', async () => {
		fs.writeFileSync(path.join(cwd, 'a.txt'), 'base\n');
		commitAll(cwd, 'initial');
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
		assert.equal(result.mergeStrategy, 'initial_commit');
		assert.equal(result.merged, false);
		assert.equal(hasConflicts(cwd).open, true);
	});
});
