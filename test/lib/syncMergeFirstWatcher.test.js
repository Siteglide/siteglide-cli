const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const syncFileWatcher = require('../../lib/sync/syncFileWatcher');

describe('sync merge-first watcher integration', () => {
	let pauseCount = 0;
	let resumeCount = 0;
	const originalPause = syncFileWatcher.pause;
	const originalResume = syncFileWatcher.resume;

	beforeEach(() => {
		pauseCount = 0;
		resumeCount = 0;
		syncFileWatcher.pause = () => {
			pauseCount += 1;
			originalPause();
		};
		syncFileWatcher.resume = () => {
			resumeCount += 1;
			originalResume();
		};
	});

	afterEach(() => {
		syncFileWatcher.pause = originalPause;
		syncFileWatcher.resume = originalResume;
		syncFileWatcher.close();
	});

	it('merge-first flow pauses watcher before pull and resumes in finally', async () => {
		let pullStarted = false;

		syncFileWatcher.attach({
			directories: [__dirname],
			options: { ignoreInitial: true },
			onChange: () => {},
			onAdd: () => {},
			onUnlink: () => {}
		});

		try {
			syncFileWatcher.pause();
			await (async () => {
				pullStarted = true;
				assert.equal(syncFileWatcher.isPaused(), true);
			})();
		} finally {
			syncFileWatcher.resume();
		}

		assert.equal(pauseCount, 1);
		assert.equal(resumeCount, 1);
		assert.equal(pullStarted, true);
		assert.equal(syncFileWatcher.isPaused(), false);
	});
});
