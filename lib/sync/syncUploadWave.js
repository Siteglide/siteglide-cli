/**
 * In-flight check/upload wave for sync (CONCURRENCY workers).
 *
 * All workers in a wave finish remote checks before any upload runs.
 * If any check fails, the whole wave blocks until the leader resolves.
 */

let nextWaveId = 0;

/**
 * @param {string} filePath
 * @param {string} op
 * @returns {string}
 */
function taskKey(filePath, op) {
	return `${op}:${filePath.replace(/\\/g, '/')}`;
}

/**
 * @param {object} checkResult
 * @returns {boolean}
 */
function checkAllowsUpload(checkResult) {
	if (!checkResult || checkResult.proceed === false) {
		return false;
	}
	if (checkResult.skipUpload) {
		return false;
	}
	return true;
}

/**
 * @param {object} checkResult
 * @returns {boolean}
 */
function checkHasRemoteConflict(checkResult) {
	return Boolean(checkResult && checkResult.remoteConflict);
}

/**
 * @param {object} checkResult
 * @returns {boolean}
 */
function checkHasGitBlock(checkResult) {
	return Boolean(checkResult && checkResult.gitBlocked);
}

/**
 * @returns {object}
 */
function createSyncUploadWave() {
	/** @type {object | null} */
	let wave = null;

	/**
	 * @returns {object}
	 */
	function openWave() {
		nextWaveId += 1;
		wave = {
			id: nextWaveId,
			phase: 'checking',
			inFlightChecks: 0,
			barrierPromise: null,
			barrierResolve: null,
			outcome: null,
			uploadsRemaining: 0,
			entries: new Map()
		};
		wave.barrierPromise = new Promise((resolve) => {
			wave.barrierResolve = resolve;
		});
		return wave;
	}

	/**
	 * @returns {object}
	 */
	function getOpenWave() {
		if (!wave || wave.phase === 'closed') {
			return openWave();
		}
		return wave;
	}

	/**
	 * @param {object} w
	 */
	function sealWave(w) {
		if (w.phase !== 'checking' || w.inFlightChecks > 0) {
			return;
		}

		const entries = [...w.entries.values()];
		const gitBlocked = entries.some((entry) => checkHasGitBlock(entry.checkResult));
		const conflicts = entries.filter((entry) => checkHasRemoteConflict(entry.checkResult));

		if (gitBlocked) {
			w.phase = 'blocked';
			w.outcome = {
				proceed: false,
				gitBlocked: true,
				entries
			};
		} else if (conflicts.length > 0) {
			w.phase = 'blocked';
			w.outcome = {
				proceed: false,
				gitBlocked: false,
				entries,
				conflicts,
				primaryConflict: conflicts[0]
			};
		} else {
			w.phase = 'uploading';
			w.outcome = {
				proceed: true,
				entries
			};
			w.uploadsRemaining = entries.length;
		}

		if (w.barrierResolve) {
			w.barrierResolve(w.outcome);
		}
	}

	/**
	 * Register a worker entering the check phase for the current wave.
	 */
	function joinWave() {
		const w = getOpenWave();
		if (w.phase !== 'checking') {
			throw new Error('sync upload wave is not accepting checks');
		}
		w.inFlightChecks += 1;
		return w.id;
	}

	/**
	 * @param {string} filePath
	 * @param {string} op
	 * @param {object} checkResult
	 */
	function reportCheck(filePath, op, checkResult) {
		if (!wave || wave.phase !== 'checking') {
			return null;
		}
		const key = taskKey(filePath, op);
		wave.entries.set(key, { path: filePath, op, checkResult });
		wave.inFlightChecks -= 1;
		if (wave.inFlightChecks === 0) {
			sealWave(wave);
		}
		return wave.outcome;
	}

	/**
	 * @returns {Promise<object>}
	 */
	async function awaitWaveDecision() {
		if (!wave || wave.phase === 'closed') {
			throw new Error('no active sync upload wave');
		}
		if (wave.outcome) {
			return wave.outcome;
		}
		return wave.barrierPromise;
	}

	/**
	 * @returns {boolean}
	 */
	function isBlocked() {
		return Boolean(wave && wave.phase === 'blocked');
	}

	/**
	 * @param {object} outcome
	 */
	function markConflictResolving() {
		if (!wave) {
			return;
		}
		wave.phase = 'resolving';
	}

	/**
	 * @param {object} outcome
	 */
	function beginResolvedUpload(outcome) {
		if (!wave) {
			return;
		}
		wave.phase = 'uploading';
		wave.outcome = outcome;
		wave.uploadsRemaining = (outcome.entries || []).length;
		if (wave.barrierResolve) {
			wave.barrierResolve(outcome);
		}
	}

	/**
	 * Mark one upload finished; close wave when all uploads done.
	 */
	function finishWave() {
		if (!wave) {
			return;
		}
		if (wave.phase === 'uploading') {
			wave.uploadsRemaining -= 1;
			if (wave.uploadsRemaining <= 0) {
				wave.phase = 'closed';
			}
			return;
		}
		wave.phase = 'closed';
	}

	/**
	 * @returns {number | null}
	 */
	function getCurrentWaveId() {
		return wave ? wave.id : null;
	}

	/**
	 * @returns {object | null}
	 */
	function getCurrentWave() {
		return wave;
	}

	/**
	 * @param {string} filePath
	 * @param {string} op
	 * @returns {object | null}
	 */
	function getEntry(filePath, op) {
		if (!wave || !wave.entries) {
			return null;
		}
		return wave.entries.get(taskKey(filePath, op)) || null;
	}

	/**
	 * Wait until the active wave closes.
	 * @returns {Promise<void>}
	 */
	async function waitForWaveClosed() {
		const w = wave;
		if (!w || w.phase === 'closed') {
			return;
		}
		await w.barrierPromise;
		if (wave && wave.phase !== 'closed') {
			await waitForWaveClosed();
		}
	}

	return {
		joinWave,
		reportCheck,
		awaitWaveDecision,
		markConflictResolving,
		beginResolvedUpload,
		finishWave,
		waitForWaveClosed,
		getCurrentWaveId,
		getCurrentWave,
		getEntry,
		isBlocked,
		checkAllowsUpload,
		checkHasRemoteConflict,
		checkHasGitBlock
	};
}

module.exports = {
	createSyncUploadWave,
	taskKey,
	checkAllowsUpload,
	checkHasRemoteConflict,
	checkHasGitBlock
};
