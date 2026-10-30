/**
 * Run git subprocesses with retry when the repository lock (.git/index.lock) is held.
 */

const { run } = require('./readiness');
const logger = require('../logger');

const DEFAULT_MAX_WAIT_MS = 60000;
const DEFAULT_POLL_INTERVAL_MS = 500;
const RETRY_LOG_INTERVAL_MS = 5000;

/**
 * @param {{ stdout?: string, stderr?: string }} result
 * @returns {boolean}
 */
function isGitLockError(result) {
	const text = `${result.stderr || ''}\n${result.stdout || ''}`;
	if (!text) {
		return false;
	}
	return /index\.lock/i.test(text)
		|| /another git process seems to be running/i.test(text)
		|| (/unable to create/i.test(text) && /index\.lock/i.test(text));
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
 * @param {number} [value]
 * @param {number} fallback
 * @returns {number}
 */
function parsePositiveInt(value, fallback) {
	const parsed = parseInt(value, 10);
	if (Number.isNaN(parsed) || parsed < 1) {
		return fallback;
	}
	return parsed;
}

/**
 * Run a command; retry while git reports index.lock / another process busy.
 *
 * @param {string} bin
 * @param {string[]} args
 * @param {{
 *   cwd?: string,
 *   maxWaitMs?: number,
 *   pollIntervalMs?: number,
 *   onRetry?: (info: { attempt: number, elapsedMs: number, result: object }) => void
 * }} [opts]
 * @returns {Promise<{ ok: boolean, status: number, stdout: string, stderr: string, timedOut?: boolean, lockBusy?: boolean }>}
 */
async function runWithRetry(bin, args, opts = {}) {
	const cwd = opts.cwd || process.cwd();
	const maxWaitMs = opts.maxWaitMs
		?? parsePositiveInt(process.env.SITEGLIDE_GIT_LOCK_MAX_WAIT_MS, DEFAULT_MAX_WAIT_MS);
	const pollIntervalMs = opts.pollIntervalMs
		?? parsePositiveInt(process.env.SITEGLIDE_GIT_LOCK_POLL_MS, DEFAULT_POLL_INTERVAL_MS);
	const onRetry = opts.onRetry;
	const startedAt = Date.now();
	let attempt = 0;
	let lastLoggedAt = 0;
	let lastResult = run(bin, args, { cwd });

	while (!lastResult.ok && isGitLockError(lastResult) && Date.now() - startedAt < maxWaitMs) {
		attempt += 1;
		const elapsedMs = Date.now() - startedAt;
		if (onRetry) {
			onRetry({ attempt, elapsedMs, result: lastResult });
		} else if (elapsedMs - lastLoggedAt >= RETRY_LOG_INTERVAL_MS || attempt === 1) {
			lastLoggedAt = elapsedMs;
			logger.Warn(
				`[git] Repository busy (another git process or index.lock). Retrying… (${Math.round(elapsedMs / 1000)}s)`,
				{ exit: false }
			);
		}
		await sleep(pollIntervalMs);
		lastResult = run(bin, args, { cwd });
	}

	if (lastResult.ok || !isGitLockError(lastResult)) {
		return lastResult;
	}

	return Object.assign({}, lastResult, {
		timedOut: true,
		lockBusy: true
	});
}

module.exports = {
	isGitLockError,
	sleep,
	runWithRetry,
	DEFAULT_MAX_WAIT_MS,
	DEFAULT_POLL_INTERVAL_MS
};
