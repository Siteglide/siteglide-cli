/**
 * Pause/resume the sync upload queue while a conflict is being resolved.
 *
 * First conflict pauses the async queue and elects a leader (prompts the user).
 * Other workers wait on waitForLeader() until the leader calls exitConflictMode().
 */

/**
 * @param {object} opts
 * @param {{ pause?: Function, resume?: Function }} opts.queue
 * @param {object} [opts.logger]
 * @param {(cwd?: string) => { open: boolean, reason?: string, paths?: string[] }} opts.hasOpenGitConflicts
 * @param {number} [opts.pollIntervalMs]
 * @param {() => boolean} [opts.isSyncStopping]
 * @param {(payload: object) => void} [opts.onUpdateConflictStatus]
 * @returns {object}
 */
function createSyncConflictGate(opts) {
	const queue = opts.queue;
	const logger = opts.logger;
	const hasOpenGitConflicts = opts.hasOpenGitConflicts;
	const pollIntervalMs = opts.pollIntervalMs || 3000;
	const isSyncStopping = opts.isSyncStopping || (() => false);
	const onUpdateConflictStatus = opts.onUpdateConflictStatus || (() => {});

	let paused = false;
	let leaderActive = false;
	let activeConflictPromise = null;
	let resolveActiveConflict = null;

	/**
	 * Pause the queue on first conflict. Returns whether this caller is the leader.
	 * @returns {{ isLeader: boolean }}
	 */
	const enterConflictMode = () => {
		if (activeConflictPromise) {
			return { isLeader: false };
		}
		paused = true;
		leaderActive = true;
		if (queue && typeof queue.pause === 'function') {
			queue.pause();
		}
		activeConflictPromise = new Promise((resolve) => {
			resolveActiveConflict = resolve;
		});
		if (logger) {
			logger.Warn('[Sync] Paused — resolve conflict to continue.', { exit: false });
		}
		return { isLeader: true };
	};

	/**
	 * Wait until the active conflict leader finishes (exitConflictMode).
	 * @returns {Promise<void>}
	 */
	const waitForLeader = async () => {
		if (activeConflictPromise) {
			await activeConflictPromise;
		}
	};

	/**
	 * Resume the queue after conflict handling completes.
	 */
	const exitConflictMode = () => {
		leaderActive = false;
		if (resolveActiveConflict) {
			resolveActiveConflict();
		}
		activeConflictPromise = null;
		resolveActiveConflict = null;
		if (paused) {
			paused = false;
			if (queue && typeof queue.resume === 'function') {
				queue.resume();
			}
		}
	};

	/**
	 * @returns {boolean}
	 */
	const isPaused = () => paused;

	/**
	 * @returns {boolean}
	 */
	const isActiveLeader = () => leaderActive;

	/**
	 * Poll git until conflict markers are cleared or sync is stopping.
	 * @param {{ cwd?: string }} [waitOpts]
	 * @returns {Promise<boolean>} true when clean, false when sync stopping
	 */
	const waitForGitClean = async (waitOpts = {}) => {
		const cwd = waitOpts.cwd || process.cwd();
		onUpdateConflictStatus({
			status: 'waiting_for_git_resolution',
			syncPaused: true,
			cwd
		});

		while (true) {
			if (isSyncStopping()) {
				return false;
			}
			const open = hasOpenGitConflicts(cwd);
			if (!open.open) {
				return true;
			}
			const count = (open.paths || []).length;
			if (logger) {
				const suffix = count === 1 ? '' : 's';
				logger.Warn(
					`[Sync] Waiting for git conflict resolution… (${count} file${suffix} with markers)`,
					{ exit: false }
				);
			}
			await new Promise((resolve) => {
				setTimeout(resolve, pollIntervalMs);
			});
		}
	};

	return {
		enterConflictMode,
		waitForLeader,
		exitConflictMode,
		isPaused,
		isActiveLeader,
		waitForGitClean
	};
}

module.exports = {
	createSyncConflictGate
};
