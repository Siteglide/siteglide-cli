const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { defaultSnapshotMessage } = require('../../lib/git/commitPrompt');

describe('defaultSnapshotMessage', () => {
	const now = new Date('2026-10-16T17:00:00.000Z');

	it('names the action and environment with a short date', () => {
		assert.equal(defaultSnapshotMessage('staging', 'merging', { now }), 'Snapshot before merging staging 2026-10-16');
		assert.equal(defaultSnapshotMessage('staging', 'pulling from', { now }), 'Snapshot before pulling from staging 2026-10-16');
		assert.equal(defaultSnapshotMessage('production', 'deploying to', { now }), 'Snapshot before deploying to production 2026-10-16');
	});

	it('adds the scope path only when one is given (sync -fast mode), with forward slashes', () => {
		assert.equal(
			defaultSnapshotMessage('staging', 'merging', { now, scopePath: 'views\\pages\\home.liquid' }),
			'Snapshot before merging staging (views/pages/home.liquid) 2026-10-16'
		);
		assert.equal(defaultSnapshotMessage('staging', 'merging', { now, scopePath: null }), 'Snapshot before merging staging 2026-10-16');
	});
});
