const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { run } = require('../../lib/git/readiness');
const { waitForMergeResolution } = require('../../lib/git/waitForMergeResolution');

function gitInit(cwd) {
	run('git', ['init'], { cwd });
	run('git', ['config', 'user.email', 'test@example.com'], { cwd });
	run('git', ['config', 'user.name', 'Test User'], { cwd });
	run('git', ['checkout', '-b', 'main'], { cwd });
}

function commitAll(cwd, message) {
	run('git', ['add', '-A'], { cwd });
	run('git', ['commit', '-m', message], { cwd });
}

describe('waitForMergeResolution', () => {
	let cwd;

	beforeEach(() => {
		cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-wait-merge-'));
		gitInit(cwd);
	});

	afterEach(() => {
		fs.rmSync(cwd, { recursive: true, force: true });
	});

	it('returns immediately when git is clean', async () => {
		fs.writeFileSync(path.join(cwd, 'a.txt'), 'base\n');
		commitAll(cwd, 'base');
		const result = await waitForMergeResolution({ cwd, pollIntervalMs: 10 });
		assert.deepEqual(result, { ok: true, committed: false });
	});

	it('auto-commits when merge is ready', async () => {
		fs.writeFileSync(path.join(cwd, 'a.txt'), 'base\n');
		commitAll(cwd, 'base');
		run('git', ['checkout', '-b', 'side'], { cwd });
		fs.writeFileSync(path.join(cwd, 'a.txt'), 'side\n');
		commitAll(cwd, 'side');
		run('git', ['checkout', 'main'], { cwd });
		fs.writeFileSync(path.join(cwd, 'a.txt'), 'main\n');
		commitAll(cwd, 'main');
		const merge = run('git', ['merge', '--no-ff', 'side'], { cwd });
		assert.equal(merge.ok, false);
		fs.writeFileSync(path.join(cwd, 'a.txt'), 'merged\n');
		run('git', ['add', 'a.txt'], { cwd });

		const result = await waitForMergeResolution({
			cwd,
			pollIntervalMs: 10,
			commitMessage: 'siteglide: merge test'
		});
		assert.equal(result.ok, true);
		assert.equal(result.committed, true);
		const status = run('git', ['status', '--porcelain'], { cwd });
		assert.equal(status.stdout.trim(), '');
	});

	it('prints waiting hints on first poll only until hintIntervalMs elapses', async () => {
		fs.writeFileSync(path.join(cwd, 'a.txt'), 'base\n');
		commitAll(cwd, 'base');
		run('git', ['checkout', '-b', 'side'], { cwd });
		fs.writeFileSync(path.join(cwd, 'a.txt'), 'side\n');
		commitAll(cwd, 'side');
		run('git', ['checkout', 'main'], { cwd });
		fs.writeFileSync(path.join(cwd, 'a.txt'), 'main\n');
		commitAll(cwd, 'main');
		run('git', ['merge', '--no-ff', 'side'], { cwd });

		const warnings = [];
		const originalIsTTY = process.stdin.isTTY;
		process.stdin.isTTY = true;

		let stop = false;
		setTimeout(() => {
			stop = true;
		}, 80);

		try {
			await waitForMergeResolution({
				cwd,
				pollIntervalMs: 10,
				hintIntervalMs: 50,
				shouldAbort: () => stop,
				logger: {
					Warn: (message) => {
						warnings.push(message);
					}
				}
			});
		} finally {
			process.stdin.isTTY = originalIsTTY;
		}

		assert.equal(warnings.length, 2);
		assert.match(warnings[0], /Waiting for merge resolution/);
		assert.match(warnings[1], /Waiting for merge resolution/);
	});

	it('aborts when shouldAbort returns true', async () => {
		fs.writeFileSync(path.join(cwd, 'a.txt'), 'base\n');
		commitAll(cwd, 'base');
		run('git', ['checkout', '-b', 'side'], { cwd });
		fs.writeFileSync(path.join(cwd, 'a.txt'), 'side\n');
		commitAll(cwd, 'side');
		run('git', ['checkout', 'main'], { cwd });
		fs.writeFileSync(path.join(cwd, 'a.txt'), 'main\n');
		commitAll(cwd, 'main');
		run('git', ['merge', '--no-ff', 'side'], { cwd });

		let stop = false;
		setTimeout(() => {
			stop = true;
		}, 25);

		const result = await waitForMergeResolution({
			cwd,
			pollIntervalMs: 10,
			shouldAbort: () => stop
		});
		assert.equal(result.ok, false);
		assert.equal(result.aborted, true);
	});
});
