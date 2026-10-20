const assert = require('assert');
const {
	waitForReleaseStatus,
	WAITING_STATUSES,
	spinnerTextForStatus
} = require('../../lib/deploy/waitForReleaseStatus');

describe('waitForReleaseStatus', () => {
	const prevDebug = process.env.DEBUG;

	afterEach(() => {
		if (prevDebug === undefined) {
			delete process.env.DEBUG;
		} else {
			process.env.DEBUG = prevDebug;
		}
	});

	it('waits through ready_for_import and in_progress before success', async () => {
		const sequence = [
			{ id: 1, status: 'ready_for_import' },
			{ id: 1, status: 'in_progress' },
			{ id: 1, status: 'in_progress' },
			{ id: 1, status: 'success', report: { Pages: { upserted: ['a.liquid'] } } }
		];
		let calls = 0;
		const waiting = [];

		const result = await waitForReleaseStatus(
			async () => sequence[calls++],
			1,
			{
				onWaiting: (response, text) => {
					waiting.push({ status: response.status, text });
				}
			}
		);

		assert.equal(calls, 4);
		assert.equal(result.status, 'success');
		assert.deepEqual(waiting, [
			{ status: 'ready_for_import', text: spinnerTextForStatus('ready_for_import') },
			{ status: 'in_progress', text: spinnerTextForStatus('in_progress') },
			{ status: 'in_progress', text: spinnerTextForStatus('in_progress') }
		]);
	});

	it('rejects on error status with response attached', async () => {
		const errBody = {
			id: 9,
			status: 'error',
			error: { error: 'Validation failed', details: { file_path: 'views/pages/x.liquid' } }
		};

		await assert.rejects(
			() => waitForReleaseStatus(async () => errBody, 9),
			(err) => {
				assert.equal(err.message, 'Deploy status error');
				assert.deepEqual(err.response, errBody);
				return true;
			}
		);
	});

	it('defines the same waiting set pos-cli polls on', () => {
		assert.deepEqual([...WAITING_STATUSES].sort(), ['in_progress', 'ready_for_import']);
	});
});
