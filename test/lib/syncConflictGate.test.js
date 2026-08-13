const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { createSyncConflictGate } = require('../../lib/syncConflictGate');
const {
	writeSyncCurrentConflict,
	clearSyncCurrentConflict,
	updateSyncCurrentConflictStatus,
	readSyncCurrentConflict
} = require('../../lib/syncCurrentConflict');

describe('syncConflictGate', () => {
	let queue;
	let paused;
	let resumed;
	let gitOpen;
	let syncStopping;
	let statusUpdates;

	beforeEach(() => {
		paused = 0;
		resumed = 0;
		gitOpen = true;
		syncStopping = false;
		statusUpdates = [];
		queue = {
			pause: () => {
				paused += 1;
			},
			resume: () => {
				resumed += 1;
			}
		};
	});

	const createGate = (overrides = {}) => createSyncConflictGate({
		queue,
		logger: {
			Warn: () => {}
		},
		hasOpenGitConflicts: () => ({
			open: gitOpen,
			reason: 'conflict_markers',
			paths: gitOpen ? ['app/views/pages/a.liquid'] : []
		}),
		pollIntervalMs: 10,
		isSyncStopping: () => syncStopping,
		onUpdateConflictStatus: (payload) => {
			statusUpdates.push(payload);
		},
		...overrides
	});

	it('first enterConflictMode pauses queue and marks leader', () => {
		const gate = createGate();
		const first = gate.enterConflictMode();
		const second = gate.enterConflictMode();

		assert.equal(first.isLeader, true);
		assert.equal(second.isLeader, false);
		assert.equal(gate.isPaused(), true);
		assert.equal(gate.isActiveLeader(), true);
		assert.equal(paused, 1);
		assert.equal(resumed, 0);
	});

	it('exitConflictMode resumes queue and releases followers', async () => {
		const gate = createGate();
		gate.enterConflictMode();

		const follower = gate.waitForLeader();
		let followerDone = false;
		follower.then(() => {
			followerDone = true;
		});

		await Promise.resolve();
		assert.equal(followerDone, false);

		gate.exitConflictMode();
		await follower;

		assert.equal(followerDone, true);
		assert.equal(gate.isPaused(), false);
		assert.equal(gate.isActiveLeader(), false);
		assert.equal(resumed, 1);
	});

	it('waitForGitClean resolves when git becomes clean', async () => {
		const gate = createGate();
		setTimeout(() => {
			gitOpen = false;
		}, 25);

		const clean = await gate.waitForGitClean();
		assert.equal(clean, true);
		assert.equal(statusUpdates.length, 1);
		assert.equal(statusUpdates[0].status, 'waiting_for_git_resolution');
	});

	it('waitForGitClean returns false when sync is stopping', async () => {
		const gate = createGate();
		setTimeout(() => {
			syncStopping = true;
		}, 5);

		const clean = await gate.waitForGitClean();
		assert.equal(clean, false);
	});
});

describe('syncCurrentConflict status extensions', () => {
	let cwd;

	beforeEach(() => {
		cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-sync-conflict-status-'));
	});

	afterEach(() => {
		fs.rmSync(cwd, { recursive: true, force: true });
	});

	it('writes syncPaused on new conflict records', () => {
		writeSyncCurrentConflict({
			environment: 'staging',
			reason: 'remote_newer',
			path: 'views/pages/a.liquid',
			localPath: 'app/views/pages/a.liquid',
			syncPaused: true,
			cwd
		});
		const read = readSyncCurrentConflict(cwd);
		assert.equal(read.syncPaused, true);
		assert.equal(read.status, 'awaiting_user_decision');
	});

	it('updates status to waiting_for_git_resolution', () => {
		writeSyncCurrentConflict({
			environment: 'staging',
			reason: 'remote_newer',
			path: 'views/pages/a.liquid',
			localPath: 'app/views/pages/a.liquid',
			cwd
		});
		updateSyncCurrentConflictStatus({
			status: 'waiting_for_git_resolution',
			syncPaused: true
		}, cwd);
		const read = readSyncCurrentConflict(cwd);
		assert.equal(read.status, 'waiting_for_git_resolution');
		assert.equal(read.syncPaused, true);
		assert.equal(read.awaitingUserDecision, false);
		assert.match(read.agentGuidance, /git conflict markers/);

		clearSyncCurrentConflict(cwd);
		assert.equal(readSyncCurrentConflict(cwd), null);
	});
});
