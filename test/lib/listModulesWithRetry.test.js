const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
	LIST_MODULES_RETRY_DELAYS_MS,
	isRetryableListModulesError,
	withListModulesRetry
} = require('../../lib/listModulesWithRetry');

describe('isRetryableListModulesError', () => {
	it('retries only HTTP 401 StatusCodeError', () => {
		assert.equal(isRetryableListModulesError({ name: 'StatusCodeError', statusCode: 401 }), true);
		assert.equal(isRetryableListModulesError({ name: 'StatusCodeError', statusCode: 404 }), false);
		assert.equal(isRetryableListModulesError({ name: 'RequestError' }), false);
	});
});

describe('withListModulesRetry', () => {
	it('retries 401 with configured delays then succeeds', async () => {
		const delays = [];
		const retries = [];
		let calls = 0;
		const err401 = { name: 'StatusCodeError', statusCode: 401 };

		const result = await withListModulesRetry(
			async () => {
				calls++;
				if (calls <= 2) {
					throw err401;
				}
				return { data: ['core'] };
			},
			{
				sleepFn: async (ms) => {
					delays.push(ms);
				},
				onRetry: (info) => {
					retries.push(info);
				}
			}
		);

		assert.deepEqual(result, { data: ['core'] });
		assert.equal(calls, 3);
		assert.deepEqual(delays, [
			LIST_MODULES_RETRY_DELAYS_MS[0],
			LIST_MODULES_RETRY_DELAYS_MS[1]
		]);
		assert.deepEqual(retries, [
			{ attempt: 1, maxAttempts: 4, delayMs: 1000 },
			{ attempt: 2, maxAttempts: 4, delayMs: 3000 }
		]);
	});

	it('throws after four 401 retries without retrying other status codes', async () => {
		const err401 = { name: 'StatusCodeError', statusCode: 401 };
		const err404 = { name: 'StatusCodeError', statusCode: 404 };
		let calls401 = 0;

		await assert.rejects(
			() => withListModulesRetry(
				async () => {
					calls401++;
					throw err401;
				},
				{ sleepFn: async () => {} }
			),
			err401
		);
		assert.equal(calls401, 5);

		let calls404 = 0;
		await assert.rejects(
			() => withListModulesRetry(
				async () => {
					calls404++;
					throw err404;
				},
				{ sleepFn: async () => {} }
			),
			err404
		);
		assert.equal(calls404, 1);
	});
});
