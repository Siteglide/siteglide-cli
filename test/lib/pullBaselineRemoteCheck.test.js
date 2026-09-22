const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
	writePullBaseline,
	readPullBaseline,
	replaceDeployManifest,
	advancePullBaseline,
	effectiveBaseline,
	recordSyncPath,
	flushPendingSyncRecords
} = require('../../lib/pullBaseline');
const {
	writeConflictLog,
	clearConflictLog,
	readConflictLog,
	defaultRecommendedActions
} = require('../../lib/remoteCheckConflictLog');
const { mapPathToResource, toPhysicalApiPath } = require('../../lib/graphql/remoteMtimeQueries');
const { isSafeAfterMergeFirst, writeMergeManifest, clearMergeManifest } = require('../../lib/git/mergeFirst');

describe('pullBaseline', () => {
	let cwd;

	beforeEach(() => {
		cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-pull-baseline-'));
	});

	afterEach(() => {
		fs.rmSync(cwd, { recursive: true, force: true });
	});

	it('writes lastPulledAt and clears lastDeploy on pull write', () => {
		replaceDeployManifest('staging', {
			cwd,
			deployedAt: '2026-01-01T00:00:00.000Z',
			paths: ['views/pages/a.liquid']
		});
		writePullBaseline('staging', { cwd, lastPulledAt: '2026-02-01T00:00:00.000Z' });
		const b = readPullBaseline('staging', cwd);
		assert.equal(b.lastPulledAt, '2026-02-01T00:00:00.000Z');
		assert.equal(b.lastDeploy, undefined);
	});

	it('stores and preserves lastPullCommit', () => {
		writePullBaseline('staging', {
			cwd,
			lastPulledAt: '2026-02-01T00:00:00.000Z',
			lastPullCommit: 'abc123'
		});
		assert.equal(readPullBaseline('staging', cwd).lastPullCommit, 'abc123');
		writePullBaseline('staging', { cwd, lastPulledAt: '2026-03-01T00:00:00.000Z' });
		assert.equal(readPullBaseline('staging', cwd).lastPullCommit, 'abc123');
		replaceDeployManifest('staging', {
			cwd,
			deployedAt: '2026-04-01T00:00:00.000Z',
			paths: ['a.liquid']
		});
		assert.equal(readPullBaseline('staging', cwd).lastPullCommit, 'abc123');
		advancePullBaseline('staging', '2026-05-01T00:00:00.000Z', cwd);
		assert.equal(readPullBaseline('staging', cwd).lastPullCommit, 'abc123');
		writePullBaseline('staging', {
			cwd,
			lastPulledAt: '2026-06-01T00:00:00.000Z',
			lastPullCommit: null
		});
		assert.equal(readPullBaseline('staging', cwd).lastPullCommit, undefined);
	});

	it('effectiveBaseline uses deploy floor only for listed paths', () => {
		writePullBaseline('staging', { cwd, lastPulledAt: '2026-01-01T00:00:00.000Z' });
		replaceDeployManifest('staging', {
			cwd,
			deployedAt: '2026-03-01T00:00:00.000Z',
			paths: ['views/pages/home.liquid']
		});
		const home = effectiveBaseline('staging', 'views/pages/home.liquid', cwd);
		assert.equal(home.source, 'deploy');
		assert.equal(home.at, '2026-03-01T00:00:00.000Z');
		const other = effectiveBaseline('staging', 'views/pages/other.liquid', cwd);
		assert.equal(other.source, 'pull');
		assert.equal(other.at, '2026-01-01T00:00:00.000Z');
	});

	it('advancePullBaseline clears lastDeploy', () => {
		writePullBaseline('staging', { cwd, lastPulledAt: '2026-01-01T00:00:00.000Z' });
		replaceDeployManifest('staging', {
			cwd,
			deployedAt: '2026-03-01T00:00:00.000Z',
			paths: ['a.liquid']
		});
		advancePullBaseline('staging', '2026-04-01T00:00:00.000Z', cwd);
		const b = readPullBaseline('staging', cwd);
		assert.equal(b.lastPulledAt, '2026-04-01T00:00:00.000Z');
		assert.equal(b.lastDeploy, undefined);
	});

	it('recordSyncPath stores per-path syncedAt in lastSync', () => {
		writePullBaseline('staging', { cwd, lastPulledAt: '2026-01-01T00:00:00.000Z' });
		recordSyncPath('staging', 'views/pages/home.liquid', {
			cwd,
			syncedAt: '2026-06-01T12:00:00.000Z',
			immediate: true
		});
		const b = readPullBaseline('staging', cwd);
		assert.deepEqual(b.lastSync, {
			paths: {
				'views/pages/home.liquid': '2026-06-01T12:00:00.000Z'
			}
		});
	});

	it('effectiveBaseline prefers sync floor when newer than pull', () => {
		writePullBaseline('staging', { cwd, lastPulledAt: '2026-01-01T00:00:00.000Z' });
		recordSyncPath('staging', 'views/pages/home.liquid', {
			cwd,
			syncedAt: '2026-06-01T12:00:00.000Z',
			immediate: true
		});
		const baseline = effectiveBaseline('staging', 'views/pages/home.liquid', cwd);
		assert.deepEqual(baseline, {
			at: '2026-06-01T12:00:00.000Z',
			source: 'sync'
		});
	});

	it('writePullBaseline and advancePullBaseline clear lastSync', () => {
		recordSyncPath('staging', 'views/pages/home.liquid', {
			cwd,
			syncedAt: '2026-06-01T12:00:00.000Z',
			immediate: true
		});
		writePullBaseline('staging', { cwd, lastPulledAt: '2026-07-01T00:00:00.000Z' });
		assert.equal(readPullBaseline('staging', cwd).lastSync, undefined);
		recordSyncPath('staging', 'views/pages/other.liquid', {
			cwd,
			syncedAt: '2026-06-02T12:00:00.000Z',
			immediate: true
		});
		advancePullBaseline('staging', '2026-08-01T00:00:00.000Z', cwd);
		assert.equal(readPullBaseline('staging', cwd).lastSync, undefined);
	});

	it('effectiveBaseline picks newest of deploy and sync floors', () => {
		writePullBaseline('staging', { cwd, lastPulledAt: '2026-01-01T00:00:00.000Z' });
		replaceDeployManifest('staging', {
			cwd,
			deployedAt: '2026-03-01T00:00:00.000Z',
			paths: ['views/pages/home.liquid']
		});
		recordSyncPath('staging', 'views/pages/home.liquid', {
			cwd,
			syncedAt: '2026-06-01T12:00:00.000Z',
			immediate: true
		});
		const baseline = effectiveBaseline('staging', 'views/pages/home.liquid', cwd);
		assert.deepEqual(baseline, {
			at: '2026-06-01T12:00:00.000Z',
			source: 'sync'
		});
	});

	it('replaceDeployManifest preserves lastSync paths', () => {
		recordSyncPath('staging', 'views/pages/home.liquid', {
			cwd,
			syncedAt: '2026-06-01T12:00:00.000Z',
			immediate: true
		});
		replaceDeployManifest('staging', {
			cwd,
			deployedAt: '2026-07-01T00:00:00.000Z',
			paths: ['views/pages/other.liquid']
		});
		assert.deepEqual(readPullBaseline('staging', cwd).lastSync, {
			paths: {
				'views/pages/home.liquid': '2026-06-01T12:00:00.000Z'
			}
		});
	});

	it('flushPendingSyncRecords writes debounced batch', () => {
		recordSyncPath('staging', 'views/pages/a.liquid', {
			cwd,
			syncedAt: '2026-06-01T12:00:00.000Z'
		});
		assert.equal(readPullBaseline('staging', cwd), null);
		flushPendingSyncRecords();
		assert.deepEqual(readPullBaseline('staging', cwd).lastSync, {
			paths: {
				'views/pages/a.liquid': '2026-06-01T12:00:00.000Z'
			}
		});
	});
});

describe('remoteCheckConflictLog', () => {
	let cwd;

	beforeEach(() => {
		cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-conflict-log-'));
	});

	afterEach(() => {
		fs.rmSync(cwd, { recursive: true, force: true });
	});

	it('writes and clears per-env log with merge_first priority when git ready', () => {
		const actions = defaultRecommendedActions({ gitInitialized: true });
		assert.equal(actions[0].id, 'merge_first');
		writeConflictLog('staging', {
			command: 'sync',
			reason: 'remote_newer',
			conflicts: [{ path: 'views/pages/a.liquid' }],
			gitInitialized: true
		}, cwd);
		const read = readConflictLog('staging', cwd);
		assert.equal(read.reason, 'remote_newer');
		assert.equal(read.recommendedActions[0].id, 'merge_first');
		clearConflictLog('staging', cwd);
		assert.equal(readConflictLog('staging', cwd), null);
	});
});

describe('path mapping', () => {
	it('maps pages layouts partials assets modules', () => {
		assert.equal(mapPathToResource('views/pages/home.liquid').kind, 'page');
		assert.equal(mapPathToResource('views/layouts/app.liquid').kind, 'layout');
		assert.equal(mapPathToResource('views/partials/x.liquid').kind, 'partial');
		assert.equal(mapPathToResource('assets/css/a.css').kind, 'asset');
		assert.equal(
			mapPathToResource('modules/core/public/views/pages/m.liquid').kind,
			'page'
		);
		assert.equal(mapPathToResource('random.txt'), null);
	});

	it('strips site root', () => {
		assert.equal(toPhysicalApiPath('app/views/pages/a.liquid', 'app'), 'views/pages/a.liquid');
		assert.equal(
			toPhysicalApiPath('marketplace_builder/views/pages/a.liquid', 'marketplace_builder'),
			'views/pages/a.liquid'
		);
	});
});

describe('merge-first safe sync gate', () => {
	let cwd;

	beforeEach(() => {
		cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-merge-first-'));
	});

	afterEach(() => {
		fs.rmSync(cwd, { recursive: true, force: true });
	});

	it('allows sync when remote updated_at has not advanced past fetch', () => {
		writeMergeManifest(
			'staging',
			{
				mode: 'sync_file',
				path: 'views/pages/a.liquid',
				remoteUpdatedAtAtFetch: '2026-05-01T12:00:00.000Z'
			},
			cwd
		);
		assert.equal(
			isSafeAfterMergeFirst(
				'staging',
				'views/pages/a.liquid',
				'2026-05-01T12:00:00.000Z',
				cwd
			),
			true
		);
		assert.equal(
			isSafeAfterMergeFirst(
				'staging',
				'views/pages/a.liquid',
				'2026-05-02T12:00:00.000Z',
				cwd
			),
			false
		);
		clearMergeManifest('staging', cwd);
	});

	it('allows any path after sync_full_pull snapshot when remote unchanged', () => {
		writeMergeManifest(
			'staging',
			{
				mode: 'sync_full_pull',
				remoteSnapshotAt: '2026-05-01T12:00:00.000Z',
				pulledAt: '2026-05-01T12:00:00.000Z'
			},
			cwd
		);
		assert.equal(
			isSafeAfterMergeFirst(
				'staging',
				'views/pages/other.liquid',
				'2026-05-01T12:00:00.000Z',
				cwd
			),
			true
		);
		assert.equal(
			isSafeAfterMergeFirst(
				'staging',
				'views/pages/other.liquid',
				'2026-05-02T12:00:00.000Z',
				cwd
			),
			false
		);
		clearMergeManifest('staging', cwd);
	});
});

describe('projectPreferences', () => {
	const {
		ensureProjectPreferences,
		readProjectPreferences,
		projectPreferencesPath
	} = require('../../lib/projectPreferences');
	let cwd;

	beforeEach(() => {
		cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-prefs-'));
	});

	afterEach(() => {
		fs.rmSync(cwd, { recursive: true, force: true });
	});

	it('creates null defaults and does not clobber filled values', () => {
		ensureProjectPreferences(cwd);
		const first = readProjectPreferences(cwd);
		assert.deepEqual(first.target_audience, {
			role: null,
			git: null,
			siteglideCli: null
		});
		fs.writeFileSync(
			projectPreferencesPath(cwd),
			JSON.stringify({
				target_audience: { role: 'designer', git: 'beginner', siteglideCli: null }
			}, null, 2),
			'utf8'
		);
		ensureProjectPreferences(cwd);
		const second = readProjectPreferences(cwd);
		assert.equal(second.target_audience.role, 'designer');
		assert.equal(second.target_audience.git, 'beginner');
		assert.equal(second.target_audience.siteglideCli, null);
	});
});
