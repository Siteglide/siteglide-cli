const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { run } = require('../../lib/git/readiness');
const {
	isGitLockError,
	runWithRetry,
	sleep,
	DEFAULT_POLL_INTERVAL_MS
} = require('../../lib/git/runWithRetry');

describe('runWithRetry', () => {
	it('isGitLockError detects index.lock messages', () => {
		assert.equal(isGitLockError({
			stderr: "fatal: Unable to create 'D:/repo/.git/index.lock': File exists."
		}), true);
		assert.equal(isGitLockError({
			stderr: 'Another git process seems to be running in this repository'
		}), true);
		assert.equal(isGitLockError({ stderr: 'fatal: not a git repository' }), false);
	});

	it('retries until index.lock is removed', async () => {
		const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-git-lock-'));
		assert.equal(run('git', ['init'], { cwd }).ok, true);
		run('git', ['config', 'user.email', 'test@example.com'], { cwd });
		run('git', ['config', 'user.name', 'Test User'], { cwd });
		run('git', ['checkout', '-b', 'main'], { cwd });
		fs.writeFileSync(path.join(cwd, 'a.txt'), 'x\n');

		const lockPath = path.join(cwd, '.git', 'index.lock');
		fs.writeFileSync(lockPath, 'held\n');

		setTimeout(() => {
			try {
				fs.unlinkSync(lockPath);
			} catch {
				// ignore
			}
		}, DEFAULT_POLL_INTERVAL_MS + 100);

		const result = await runWithRetry('git', ['add', 'a.txt'], {
			cwd,
			maxWaitMs: 5000,
			pollIntervalMs: DEFAULT_POLL_INTERVAL_MS
		});
		assert.equal(result.ok, true);

		fs.rmSync(cwd, { recursive: true, force: true });
	});

	it('returns lockBusy after timeout', async () => {
		const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-git-lock-timeout-'));
		assert.equal(run('git', ['init'], { cwd }).ok, true);
		run('git', ['config', 'user.email', 'test@example.com'], { cwd });
		run('git', ['config', 'user.name', 'Test User'], { cwd });
		run('git', ['checkout', '-b', 'main'], { cwd });
		fs.writeFileSync(path.join(cwd, 'a.txt'), 'x\n');

		const lockPath = path.join(cwd, '.git', 'index.lock');
		fs.writeFileSync(lockPath, 'held\n');

		const result = await runWithRetry('git', ['add', 'a.txt'], {
			cwd,
			maxWaitMs: 300,
			pollIntervalMs: 100
		});
		assert.equal(result.ok, false);
		assert.equal(result.lockBusy, true);
		assert.equal(result.timedOut, true);
		assert.equal(isGitLockError(result), true);

		fs.unlinkSync(lockPath);
		fs.rmSync(cwd, { recursive: true, force: true });
	});

	it('sleep resolves after delay', async () => {
		const started = Date.now();
		await sleep(50);
		assert.ok(Date.now() - started >= 40);
	});
});
