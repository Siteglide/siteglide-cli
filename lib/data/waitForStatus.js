/**
 * Poll `statusCheck` until the remote job leaves a waiting state.
 * Uses exponential backoff so short jobs finish sooner than a fixed 1.5s interval,
 * while long jobs still settle at the previous 1.5s cadence.
 *
 * Waiting statuses: `pending`, `ready_for_export`
 * Terminal statuses: `done`, `success`, `error` (resolved — callers decide if error is fatal)
 *
 * @param {() => Promise<{status: string}>} statusCheck - Function that fetches the current job status.
 * @returns {Promise<object>} Resolves with the status response object.
 * Side effects: none beyond calling `statusCheck` on a timer.
 */
const waitForStatus = (statusCheck) => {
	const INITIAL_DELAY_MS = 300;
	const MAX_DELAY_MS = 1500;
	const MAX_ATTEMPTS = 80;

	/**
	 * Delay before the next poll after `attempt` waiting responses (0-based).
	 * @param {number} attempt - How many times we have already seen a waiting status.
	 * @returns {number} Milliseconds to wait.
	 */
	const delayForAttempt = (attempt) => {
		return Math.min(MAX_DELAY_MS, Math.round(INITIAL_DELAY_MS * Math.pow(1.5, attempt)));
	};

	return new Promise((resolve, reject) => {
		let count = 0;
		const getStatus = () => {
			statusCheck().then(response => {
				if (response.status === 'pending' || response.status === 'ready_for_export') {
					if (count < MAX_ATTEMPTS) {
						const delayMs = delayForAttempt(count);
						count++;
						setTimeout(getStatus, delayMs);
					} else {
						count = 0;
						reject('error');
					}
				} else if (response.status === 'done' || response.status === 'success' || response.status === 'error') {
					count = 0;
					resolve(response);
				} else {
					count = 0;
					reject('error');
				}
			});
		};
		getStatus();
	});
};

module.exports = waitForStatus;
