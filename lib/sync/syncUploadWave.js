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
 * @param {object} [opts]
 * @param {(message: string) => void} [opts.log]
 * @returns {object}
 */
function createSyncUploadWave(opts = {}) {
	const log = opts.log || (() => {});

	/** @type {object | null} */
	let wave = null;

	/**
	 * @returns {object}
	 */
	function openWave() {
		nextWaveId += 1;
		let resolveClose = null;
		const closedPromise = new Promise((resolve) => {
			resolveClose = resolve;
		});
		wave = {
			id: nextWaveId,
			phase: 'checking',
			inFlightChecks: 0,
			workersRemaining: 0,
			barrierPromise: null,
			barrierResolve: null,
			outcome: null,
			entries: new Map(),
			closedPromise,
			resolveClose
		};
		wave.barrierPromise = new Promise((resolve) => {
			wave.barrierResolve = resolve;
		});
		log(`[Sync wave ${wave.id}] opened`);
		return wave;
	}

	function closeWaveNow() {
		if (!wave || wave.phase === 'closed') {
			return;
		}
		const waveId = wave.id;
		wave.phase = 'closed';
		if (wave.resolveClose) {
			wave.resolveClose();
		}
		log(`[Sync wave ${waveId}] closed`);
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

		w.workersRemaining = entries.length;

		if (gitBlocked) {
			w.phase = 'blocked';
			w.outcome = {
				proceed: false,
				gitBlocked: true,
				entries
			};
			log(`[Sync wave ${w.id}] sealed blocked (git) entries=${entries.length}`);
		} else if (conflicts.length > 0) {
			w.phase = 'blocked';
			w.outcome = {
				proceed: false,
				gitBlocked: false,
				entries,
				conflicts,
				primaryConflict: conflicts[0]
			};
			log(`[Sync wave ${w.id}] sealed blocked (remote conflict) entries=${entries.length}`);
		} else {
			w.phase = 'uploading';
			w.outcome = {
				proceed: true,
				entries
			};
			log(`[Sync wave ${w.id}] sealed proceed entries=${entries.length}`);
		}

		if (w.barrierResolve) {
			w.barrierResolve(w.outcome);
		}
	}

	/**
	 * Wait until the current wave is joinable or closed.
	 * @returns {Promise<void>}
	 */
	async function waitUntilJoinable() {
		while (true) {
			if (!wave || wave.phase === 'closed') {
				return;
			}
			if (wave.phase === 'checking' && !wave.outcome) {
				return;
			}
			const waveId = wave.id;
			const phase = wave.phase;
			log(`[Sync wave ${waveId}] waiting to join (phase=${phase})`);
			await wave.closedPromise;
		}
	}

	/**
	 * Register a worker entering the check phase for the current wave.
	 * Waits if a prior wave is still uploading or resolving.
	 * @returns {Promise<number>}
	 */
	async function joinWave() {
		await waitUntilJoinable();
		const w = getOpenWave();
		if (w.phase !== 'checking' || w.outcome) {
			return joinWave();
		}
		w.inFlightChecks += 1;
		log(`[Sync wave ${w.id}] joined inFlight=${w.inFlightChecks}`);
		return w.id;
	}

	/**
	 * @param {string} filePath
	 * @param {string} op
	 * @param {object} checkResult
	 */
	function reportCheck(filePath, op, checkResult) {
		if (!wave || wave.phase !== 'checking') {
			log(`[Sync wave] reportCheck ignored phase=${wave ? wave.phase : 'none'} path=${filePath}`);
			return null;
		}
		const key = taskKey(filePath, op);
		wave.entries.set(key, { path: filePath, op, checkResult });
		wave.inFlightChecks -= 1;
		log(`[Sync wave ${wave.id}] reported ${filePath.replace(/\\/g, '/')} inFlight=${wave.inFlightChecks}`);
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
	 * @returns {boolean}
	 */
	function isBusy() {
		return Boolean(wave && wave.phase !== 'closed');
	}

	/**
	 * @param {object} outcome
	 */
	function markConflictResolving() {
		if (!wave) {
			return;
		}
		log(`[Sync wave ${wave.id}] resolving conflict`);
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
		wave.workersRemaining = (outcome.entries || []).length;
		if (wave.barrierResolve) {
			wave.barrierResolve(outcome);
		}
	}

	/**
	 * Mark one worker finished; close wave when all workers in the wave complete.
	 */
	function finishWave() {
		if (!wave) {
			return;
		}
		if (wave.workersRemaining > 0) {
			wave.workersRemaining -= 1;
			log(`[Sync wave ${wave.id}] worker done remaining=${wave.workersRemaining}`);
			if (wave.workersRemaining <= 0) {
				closeWaveNow();
			}
			return;
		}
		closeWaveNow();
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
		if (!wave || wave.phase === 'closed') {
			return;
		}
		await wave.closedPromise;
	}

	return {
		joinWave,
		reportCheck,
		awaitWaveDecision,
		markConflictResolving,
		beginResolvedUpload,
		finishWave,
		waitForWaveClosed,
		waitUntilJoinable,
		getCurrentWaveId,
		getCurrentWave,
		getEntry,
		isBlocked,
		isBusy,
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
