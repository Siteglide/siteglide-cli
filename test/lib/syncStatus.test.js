const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
	claimSyncStatus,
	clearSyncStatus,
	syncStatusDir,
	syncStatusPath
} = require('../../lib/syncStatus');

describe('claimSyncStatus / clearSyncStatus', () => {
	let cwd;

	beforeEach(() => {
		cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-cli-sync-status-'));
	});

	afterEach(() => {
		fs.rmSync(cwd, { recursive: true, force: true });
	});

	it('claims successfully when no live same-env entry exists', () => {
		const result = claimSyncStatus({
			environment: 'production',
			cwd,
			pid: 1001,
			isAlive: () => false
		});
		assert.equal(result.ok, true);
		assert.equal(fs.existsSync(syncStatusPath(cwd, 1001)), true);
		const saved = JSON.parse(fs.readFileSync(syncStatusPath(cwd, 1001), 'utf8'));
		assert.equal(saved.environment, 'production');
		assert.equal(saved.pid, 1001);
	});

	it('clears dead pid leftovers then claims', () => {
		const dir = syncStatusDir(cwd);
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(
			path.join(dir, '9001.json'),
			JSON.stringify({ pid: 9001, environment: 'production', cwd, startedAt: new Date().toISOString() })
		);
		const result = claimSyncStatus({
			environment: 'production',
			cwd,
			pid: 1002,
			isAlive: (pid) => pid === 1002
		});
		assert.equal(result.ok, true);
		assert.equal(fs.existsSync(path.join(dir, '9001.json')), false);
		assert.equal(fs.existsSync(syncStatusPath(cwd, 1002)), true);
	});

	it('fails when another live process already syncs the same env', () => {
		const first = claimSyncStatus({
			environment: 'production',
			cwd,
			pid: 2001,
			isAlive: (pid) => pid === 2001 || pid === 2002
		});
		assert.equal(first.ok, true);

		const second = claimSyncStatus({
			environment: 'production',
			cwd,
			pid: 2002,
			isAlive: (pid) => pid === 2001 || pid === 2002
		});
		assert.equal(second.ok, false);
		assert.equal(second.existingPid, 2001);
		assert.equal(second.environment, 'production');
		assert.equal(fs.existsSync(syncStatusPath(cwd, 2002)), false);
	});

	it('allows different environments in the same cwd', () => {
		const staging = claimSyncStatus({
			environment: 'staging',
			cwd,
			pid: 3001,
			isAlive: (pid) => pid === 3001 || pid === 3002
		});
		const production = claimSyncStatus({
			environment: 'production',
			cwd,
			pid: 3002,
			isAlive: (pid) => pid === 3001 || pid === 3002
		});
		assert.equal(staging.ok, true);
		assert.equal(production.ok, true);
		assert.equal(fs.existsSync(syncStatusPath(cwd, 3001)), true);
		assert.equal(fs.existsSync(syncStatusPath(cwd, 3002)), true);
	});

	it('clearSyncStatus removes only this process file', () => {
		claimSyncStatus({
			environment: 'staging',
			cwd,
			pid: 4001,
			isAlive: (pid) => pid === 4001 || pid === 4002
		});
		claimSyncStatus({
			environment: 'production',
			cwd,
			pid: 4002,
			isAlive: (pid) => pid === 4001 || pid === 4002
		});
		clearSyncStatus({ cwd, pid: 4001 });
		assert.equal(fs.existsSync(syncStatusPath(cwd, 4001)), false);
		assert.equal(fs.existsSync(syncStatusPath(cwd, 4002)), true);
	});
});
