const { deployDebug } = require('../deployDebug');

const POLL_MS = 1000;
const MAX_STATUS_RETRIES = 3;

const WAITING_STATUSES = new Set(['ready_for_import', 'in_progress']);

const isTransientError = (error) => {
	return (
		error.name === 'RequestError'
		|| (error.name === 'StatusCodeError' && error.statusCode >= 500)
	);
};

const spinnerTextForStatus = (status) => {
	if (status === 'ready_for_import') {
		return 'Deploy scheduled, waiting…';
	}
	if (status === 'in_progress') {
		return 'Deploy in progress…';
	}
	return null;
};

/**
 * Poll marketplace release status until the import leaves ready_for_import / in_progress.
 * Matches pos-cli deploy polling semantics.
 *
 * @param {(releaseId: string|number) => Promise<object>} fetchStatus
 * @param {string|number} releaseId
 * @param {{ onWaiting?: (response: object) => void, onTerminal?: (response: object) => void }} [hooks]
 * @returns {Promise<object>} Final release record (e.g. status success).
 */
const waitForReleaseStatus = (fetchStatus, releaseId, hooks = {}) => {
	return new Promise((resolve, reject) => {
		let retries = 0;

		const poll = () => {
			fetchStatus(releaseId)
				.then((response) => {
					deployDebug('status', response);

					const status = response && response.status;

					if (WAITING_STATUSES.has(status)) {
						const text = spinnerTextForStatus(status);
						if (hooks.onWaiting) {
							hooks.onWaiting(response, text);
						}
						setTimeout(poll, POLL_MS);
						return;
					}

					if (status === 'error') {
						if (hooks.onTerminal) {
							hooks.onTerminal(response);
						}
						reject(Object.assign(new Error('Deploy status error'), { response }));
						return;
					}

					if (hooks.onTerminal) {
						hooks.onTerminal(response);
					}
					resolve(response);
				})
				.catch((error) => {
					if (isTransientError(error) && retries < MAX_STATUS_RETRIES) {
						retries += 1;
						deployDebug('status poll retry', `${retries}/${MAX_STATUS_RETRIES}: ${error.name}`);
						setTimeout(poll, POLL_MS * retries);
						return;
					}

					deployDebug('status poll failed', `${error.name}: ${error.message}`);
					reject(error);
				});
		};

		deployDebug('polling', `deployment ${releaseId}`);
		poll();
	});
};

module.exports = {
	waitForReleaseStatus,
	WAITING_STATUSES,
	POLL_MS,
	MAX_STATUS_RETRIES,
	isTransientError,
	spinnerTextForStatus
};
