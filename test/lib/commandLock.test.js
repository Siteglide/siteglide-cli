const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
	claimCommandLock,
	clearCommandLock,
	assertCommandAllowed,
	commandLockPath,
	NESTED_ENV
} = require('../../lib/commandLock');
const { claimSyncStatus, syncStatusDir, syncStatusPath } = require('../../lib/syncStatus');

describe('commandLock exclusivity', () => {
	let cwd;
	let prevNested;

	beforeEach(() => {
		cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-cmd-lock-'));
		prevNested = process.env[NESTED_ENV];
		delete process.env[NESTED_ENV];
	});

	afterEach(() => {
		if (prevNested === undefined) {
			delete process.env[NESTED_ENV];
		} else {
			process.env[NESTED_ENV] = prevNested;
		}
		fs.rmSync(cwd, { recursive: true, force: true });
	});

	const alive = (...pids) => (pid) => pids.includes(pid);

	it('blocks pull while sync is live', () => {
		const sync = claimSyncStatus({
			environment: 'staging',
			cwd,
			pid: 501,
			isAlive: alive(501, 502)
		});
		assert.equal(sync.ok, true);

		const pull = claimCommandLock('pull', {
			environment: 'staging',
			cwd,
			pid: 502,
			isAlive: alive(501, 502)
		});
		assert.equal(pull.ok, false);
		assert.match(pull.headline, /Cannot start pull while sync is running \(pid 501\(env: staging\)\)\./);
		assert.match(pull.helper, /Timed subprocesses are allowed/);
		assert.match(pull.message, /infinite update loops/);
		assert.equal(pull.blockedBy.command, 'sync');
	});

	it('blocks sync while pull is live', () => {
		const pull = claimCommandLock('pull', {
			environment: 'staging',
			cwd,
			pid: 601,
			isAlive: alive(601, 602)
		});
		assert.equal(pull.ok, true);

		const sync = claimSyncStatus({
			environment: 'staging',
			cwd,
			pid: 602,
			isAlive: alive(601, 602)
		});
		assert.equal(sync.ok, false);
		assert.match(sync.message, /Cannot start sync while pull/);
	});

	it('blocks deploy while pull is live, and second deploy while deploy is live', () => {
		claimCommandLock('pull', {
			environment: 'staging',
			cwd,
			pid: 701,
			isAlive: alive(701, 702, 703)
		});
		const blockedDeploy = claimCommandLock('deploy', {
			environment: 'staging',
			cwd,
			pid: 702,
			isAlive: alive(701, 702, 703)
		});
		assert.equal(blockedDeploy.ok, false);

		clearCommandLock({ cwd, pid: 701 });
		const deploy = claimCommandLock('deploy', {
			environment: 'staging',
			cwd,
			pid: 702,
			isAlive: alive(702, 703)
		});
		assert.equal(deploy.ok, true);
		assert.equal(fs.existsSync(commandLockPath(cwd, 702)), true);

		const second = claimCommandLock('deploy', {
			environment: 'production',
			cwd,
			pid: 703,
			isAlive: alive(702, 703)
		});
		assert.equal(second.ok, false);
		assert.equal(second.blockedBy.command, 'deploy');
	});

	it('allows nested CLI bypass', () => {
		claimSyncStatus({
			environment: 'staging',
			cwd,
			pid: 801,
			isAlive: alive(801, 802)
		});
		process.env[NESTED_ENV] = '1';
		const pull = claimCommandLock('pull', {
			environment: 'staging',
			cwd,
			pid: 802,
			isAlive: alive(801, 802)
		});
		assert.equal(pull.ok, true);
		assert.equal(pull.nested, true);
		assert.equal(fs.existsSync(commandLockPath(cwd, 802)), false);
	});

	it('does not delete current-conflict.json when claiming sync', () => {
		const dir = syncStatusDir(cwd);
		fs.mkdirSync(dir, { recursive: true });
		const conflictPath = path.join(dir, 'current-conflict.json');
		fs.writeFileSync(conflictPath, JSON.stringify({ awaitingUserDecision: true, environment: 'staging' }));
		const claim = claimSyncStatus({
			environment: 'staging',
			cwd,
			pid: 901,
			isAlive: alive(901)
		});
		assert.equal(claim.ok, true);
		assert.equal(fs.existsSync(conflictPath), true);
		assert.equal(fs.existsSync(syncStatusPath(cwd, 901)), true);
	});

	it('assertCommandAllowed allows deploy while sync is running', () => {
		claimSyncStatus({
			environment: 'staging',
			cwd,
			pid: 1001,
			isAlive: alive(1001, 1002)
		});
		const allowed = assertCommandAllowed('deploy', {
			cwd,
			pid: 1002,
			isAlive: alive(1001, 1002)
		});
		assert.equal(allowed.ok, true);
	});
});
