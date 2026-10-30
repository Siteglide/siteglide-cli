const { isSiteglideApiTimeout } = require('./apiGatewayTimeout');

const SYNC_TIMEOUT_RETRY_DELAYS_MS = [3000, 5000, 10000];

function sleep(ms) {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

/**
 * Retry sync when Siteglide API cuts the request at its 25s limit (503 timeout).
 *
 * @param {() => Promise<unknown>} requestFn
 * @param {{ onRetry?: (info: { attempt: number, maxAttempts: number, delayMs: number }) => void, sleepFn?: (ms: number) => Promise<void> }} [opts]
 * @returns {Promise<unknown>}
 */
async function withSyncTimeoutRetry(requestFn, opts = {}) {
	const onRetry = opts.onRetry;
	const sleepFn = opts.sleepFn || sleep;
	let attempt = 0;

	while (true) {
		try {
			return await requestFn();
		} catch (error) {
			if (
				!isSiteglideApiTimeout(error)
				|| attempt >= SYNC_TIMEOUT_RETRY_DELAYS_MS.length
			) {
				throw error;
			}

			const delayMs = SYNC_TIMEOUT_RETRY_DELAYS_MS[attempt];
			attempt += 1;

			if (onRetry) {
				onRetry({
					attempt,
					maxAttempts: SYNC_TIMEOUT_RETRY_DELAYS_MS.length,
					delayMs
				});
			}

			await sleepFn(delayMs);
		}
	}
}

module.exports = {
	SYNC_TIMEOUT_RETRY_DELAYS_MS,
	withSyncTimeoutRetry
};
