/**
 * Last-resort handlers so a crash always ends with a red error line instead of a bare stack trace.
 */

/**
 * @param {string} headline e.g. '[Sync] Sync stopped because of an unexpected error'
 */
function installFatalErrorHandlers(headline) {
	const report = (err) => {
		try {
			const logger = require('./logger');
			const detail = err instanceof Error ? logger.describeError(err) : String(err);
			logger.Error(`${headline}: ${detail}`, { exit: false });
		} catch {
			console.error(`\x1b[31m${headline}: ${err && err.stack ? err.stack : String(err)}\x1b[0m`);
		}
		process.exit(1);
	};
	// Node raises an unhandled rejection as an uncaught exception, so this covers both.
	process.on('uncaughtException', report);
}

/**
 * Exit codes a child process uses after it has already printed its own red error (logger.Error exits 1),
 * or after the user stopped it (130 SIGINT, 143 SIGTERM, 0xC000013A Ctrl+C on Windows).
 */
const REPORTED_EXIT_CODES = new Set([0, 1, 130, 143, 0xC000013A]);

/**
 * Message for a child that exited without reporting why, or null when it reported (or was stopped) itself.
 * @param {string} name
 * @param {number | null} code
 * @param {string | null} signal
 * @returns {string | null}
 */
function unreportedChildExitMessage(name, code, signal) {
	if (signal) {
		if (
			signal === 'SIGINT'
			|| signal === 'SIGTERM'
		) {
			return null;
		}
		return `${name} stopped unexpectedly (signal ${signal}).`;
	}
	if (
		code === null
		|| REPORTED_EXIT_CODES.has(code)
	) {
		return null;
	}
	return `${name} stopped unexpectedly (exit code ${code}).`;
}

module.exports = {
	installFatalErrorHandlers,
	unreportedChildExitMessage
};
