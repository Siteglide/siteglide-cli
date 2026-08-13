const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const syncFileWatcher = require('../../lib/sync/syncFileWatcher');

describe('syncFileWatcher', () => {
	const events = [];

	beforeEach(() => {
		events.length = 0;
	});

	afterEach(() => {
		syncFileWatcher.close();
	});

	it('pause stops forwarding events and resume re-attaches', () => {
		syncFileWatcher.attach({
			directories: [__dirname],
			options: { ignoreInitial: true },
			onChange: (fp) => {
				events.push(['change', fp]);
			},
			onAdd: (fp) => {
				events.push(['add', fp]);
			},
			onUnlink: (fp) => {
				events.push(['unlink', fp]);
			}
		});

		assert.equal(syncFileWatcher.isPaused(), false);
		syncFileWatcher.pause();
		assert.equal(syncFileWatcher.isPaused(), true);

		syncFileWatcher.resume();
		assert.equal(syncFileWatcher.isPaused(), false);
	});
});
