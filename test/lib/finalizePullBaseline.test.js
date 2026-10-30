const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { run } = require('../../lib/git/readiness');
const { finalizePullBaseline } = require('../../lib/git/finalizePullBaseline');
const { readPullBaseline } = require('../../lib/pullBaseline');
const { writeConflictLog, readConflictLog } = require('../../lib/remoteCheckConflictLog');
const { writeMergeManifest, readMergeManifest } = require('../../lib/git/mergeFirst');

function gitInit(cwd) {
	run('git', ['init'], { cwd });
	run('git', ['config', 'user.email', 'test@example.com'], { cwd });
	run('git', ['config', 'user.name', 'Test User'], { cwd });
	run('git', ['checkout', '-b', 'main'], { cwd });
}

describe('finalizePullBaseline', () => {
	let cwd;

	beforeEach(() => {
		cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-finalize-baseline-'));
		gitInit(cwd);
	});

	afterEach(() => {
		fs.rmSync(cwd, { recursive: true, force: true });
	});

	it('writes lastPullCommit and lastPulledAt from HEAD and clears logs', () => {
		fs.writeFileSync(path.join(cwd, 'a.txt'), 'base\n');
		run('git', ['add', '-A'], { cwd });
		run('git', ['commit', '-m', 'base'], { cwd });
		const head = run('git', ['rev-parse', 'HEAD'], { cwd }).stdout;

		writeConflictLog('staging', {
			command: 'sync',
			reason: 'remote_newer',
			conflicts: [{ path: 'views/pages/a.liquid' }]
		}, cwd);
		writeMergeManifest('staging', {
			mode: 'pull_full',
			remoteSnapshotAt: new Date().toISOString()
		}, cwd);

		const result = finalizePullBaseline({ environment: 'staging', cwd });
		assert.equal(result.lastPullCommit, head);
		assert.ok(result.lastPulledAt);
		assert.equal(readConflictLog('staging', cwd), null);
		assert.equal(readMergeManifest('staging', cwd), null);

		const baseline = readPullBaseline('staging', cwd);
		assert.equal(baseline.lastPullCommit, head);
		assert.equal(baseline.lastPulledAt, result.lastPulledAt);
	});
});
