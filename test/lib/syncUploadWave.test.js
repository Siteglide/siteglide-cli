const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
	createSyncUploadWave,
	checkAllowsUpload,
	checkHasRemoteConflict
} = require('../../lib/sync/syncUploadWave');

describe('syncUploadWave', () => {
	it('seals with proceed true when all checks pass', async () => {
		const wave = createSyncUploadWave();

		wave.joinWave();
		wave.joinWave();
		wave.joinWave();

		wave.reportCheck('app/a.liquid', 'push', { proceed: true });
		wave.reportCheck('app/b.liquid', 'push', { proceed: true });

		const pending = wave.awaitWaveDecision();
		wave.reportCheck('app/c.liquid', 'push', { proceed: true });

		const decision = await pending;
		assert.equal(decision.proceed, true);
		assert.equal(decision.entries.length, 3);
	});

	it('seals with proceed false when any check has remote conflict', async () => {
		const wave = createSyncUploadWave();

		wave.joinWave();
		wave.joinWave();

		wave.reportCheck('app/a.liquid', 'push', { proceed: true });
		const pending = wave.awaitWaveDecision();
		wave.reportCheck('app/b.liquid', 'push', {
			proceed: false,
			remoteConflict: true,
			meta: { path: 'views/pages/b.liquid' }
		});

		const decision = await pending;
		assert.equal(decision.proceed, false);
		assert.equal(decision.conflicts.length, 1);
		assert.equal(decision.primaryConflict.path, 'app/b.liquid');
	});

	it('closes wave after each worker calls finishWave', async () => {
		const wave = createSyncUploadWave();

		wave.joinWave();
		wave.joinWave();
		wave.reportCheck('app/a.liquid', 'push', { proceed: true });
		wave.reportCheck('app/b.liquid', 'push', { proceed: true });
		await wave.awaitWaveDecision();

		wave.finishWave();
		wave.finishWave();

		assert.equal(wave.getCurrentWave().phase, 'closed');
	});

	it('blocks upload race: ok worker cannot proceed until barrier resolves', async () => {
		const wave = createSyncUploadWave();
		let uploadAttempted = false;

		wave.joinWave();
		wave.joinWave();

		wave.reportCheck('app/conflict.liquid', 'push', {
			proceed: false,
			remoteConflict: true,
			meta: { path: 'views/pages/conflict.liquid' }
		});

		const followerDecision = wave.awaitWaveDecision();
		wave.reportCheck('app/ok.liquid', 'push', { proceed: true });

		const decision = await followerDecision;
		if (decision.proceed && checkAllowsUpload({ proceed: true })) {
			uploadAttempted = true;
		}

		assert.equal(decision.proceed, false);
		assert.equal(uploadAttempted, false);
		assert.equal(checkHasRemoteConflict(decision.primaryConflict.checkResult), true);
	});
});
