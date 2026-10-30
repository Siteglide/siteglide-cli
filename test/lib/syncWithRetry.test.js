const assert = require('assert');
const { withSyncTimeoutRetry } = require('../../lib/syncWithRetry');

describe('withSyncTimeoutRetry', () => {
	it('retries on Siteglide API timeout then succeeds', async () => {
		let calls = 0;
		const retries = [];

		const result = await withSyncTimeoutRetry(
			async () => {
				calls += 1;
				if (calls === 1) {
					const err = new Error('Request failed with status 503');
					err.name = 'StatusCodeError';
					err.statusCode = 503;
					err.error = { error: 'timeout' };
					throw err;
				}
				return { ok: true };
			},
			{
				sleepFn: async () => {},
				onRetry: (info) => {
					retries.push(info);
				}
			}
		);

		assert.deepEqual(result, { ok: true });
		assert.equal(calls, 2);
		assert.deepEqual(retries, [{ attempt: 1, maxAttempts: 3, delayMs: 3000 }]);
	});
});
