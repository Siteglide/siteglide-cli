const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
	writeSyncCurrentConflict,
	clearSyncCurrentConflict,
	resolveSyncCurrentConflict,
	readSyncCurrentConflict,
	conflictMatchesPath,
	syncCurrentConflictPath
} = require('../../lib/syncCurrentConflict');

describe('syncCurrentConflict', () => {
	let cwd;

	beforeEach(() => {
		cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-sync-conflict-'));
		fs.mkdirSync(path.join(cwd, 'app', 'views', 'pages'), { recursive: true });
		fs.writeFileSync(path.join(cwd, 'app', 'views', 'pages', 'a.liquid'), 'local\n');
	});

	afterEach(() => {
		fs.rmSync(cwd, { recursive: true, force: true });
	});

	it('writes awaiting-user record with local mtime under .siteglide/sync/', () => {
		const written = writeSyncCurrentConflict({
			environment: 'staging',
			reason: 'remote_newer',
			path: 'views/pages/a.liquid',
			localPath: 'app/views/pages/a.liquid',
			remoteUpdatedAt: '2026-08-12T12:00:00.000Z',
			effectiveBaselineAt: '2026-08-01T12:00:00.000Z',
			cwd
		});
		assert.equal(written, syncCurrentConflictPath(cwd));
		const read = readSyncCurrentConflict(cwd);
		assert.equal(read.status, 'awaiting_user_decision');
		assert.equal(read.awaitingUserDecision, true);
		assert.equal(read.path, 'views/pages/a.liquid');
		assert.equal(read.localPath, 'app/views/pages/a.liquid');
		assert.ok(read.localMtimeAtDetect);
		assert.ok(read.detectedAt);
		assert.match(read.agentGuidance, /CLI sync prompt/);
	});

	it('clears on skip/continue and marks merge_first in progress', () => {
		writeSyncCurrentConflict({
			environment: 'staging',
			reason: 'remote_newer',
			path: 'views/pages/a.liquid',
			localPath: 'app/views/pages/a.liquid',
			cwd
		});
		resolveSyncCurrentConflict('skip', cwd);
		assert.equal(readSyncCurrentConflict(cwd), null);

		writeSyncCurrentConflict({
			environment: 'staging',
			reason: 'remote_newer',
			path: 'views/pages/a.liquid',
			localPath: 'app/views/pages/a.liquid',
			cwd
		});
		resolveSyncCurrentConflict('merge_first', cwd);
		const mid = readSyncCurrentConflict(cwd);
		assert.equal(mid.status, 'merge_in_progress');
		assert.equal(mid.userDecision, 'merge_first');
		assert.equal(mid.awaitingUserDecision, false);

		clearSyncCurrentConflict(cwd);
		assert.equal(readSyncCurrentConflict(cwd), null);
	});

	it('matches physical or local path forms', () => {
		const conflict = {
			path: 'views/pages/a.liquid',
			localPath: 'app/views/pages/a.liquid'
		};
		assert.equal(conflictMatchesPath(conflict, 'views/pages/a.liquid'), true);
		assert.equal(conflictMatchesPath(conflict, 'app/views/pages/a.liquid'), true);
		assert.equal(conflictMatchesPath(conflict, 'app\\views\\pages\\a.liquid'), true);
		assert.equal(conflictMatchesPath(conflict, 'views/pages/other.liquid'), false);
	});
});
