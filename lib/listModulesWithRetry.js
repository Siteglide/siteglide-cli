const LIST_MODULES_RETRY_DELAYS_MS = [1000, 3000, 5000, 10000];

/**
 * @param {Error & { name?: string, statusCode?: number }} error
 * @returns {boolean}
 */
function isRetryableListModulesError(error) {
	return error.name === 'StatusCodeError' && error.statusCode === 401;
}

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

/**
 * Call `requestFn` until it succeeds or a non-retryable error is thrown.
 * Retries HTTP 401 up to four times with 1s, 3s, 5s, and 10s delays.
 *
 * @param {() => Promise<unknown>} requestFn
 * @param {{ onRetry?: (info: { attempt: number, maxAttempts: number, delayMs: number }) => void, sleepFn?: (ms: number) => Promise<void> }} [opts]
 * @returns {Promise<unknown>}
 */
async function withListModulesRetry(requestFn, opts = {}) {
	const onRetry = opts.onRetry;
	const sleepFn = opts.sleepFn || sleep;
	let attempt = 0;

	while (true) {
		try {
			return await requestFn();
		} catch (error) {
			if (
				!isRetryableListModulesError(error)
				|| attempt >= LIST_MODULES_RETRY_DELAYS_MS.length
			) {
				throw error;
			}

			const delayMs = LIST_MODULES_RETRY_DELAYS_MS[attempt];
			if (onRetry) {
				onRetry({
					attempt: attempt + 1,
					maxAttempts: LIST_MODULES_RETRY_DELAYS_MS.length,
					delayMs
				});
			}

			await sleepFn(delayMs);
			attempt++;
		}
	}
}

module.exports = {
	LIST_MODULES_RETRY_DELAYS_MS,
	isRetryableListModulesError,
	withListModulesRetry,
	sleep
};
