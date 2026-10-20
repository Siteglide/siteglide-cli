/**
 * Record Siteglide sync API failures to the live sync status file for MCP sync_errors.
 */

const logger = require('./logger');
const { appendSyncStatusError } = require('./syncStatus');

/**
 * Build terminal log line and structured entry from a sync API response body.
 *
 * @param {string} filePath unixified API path
 * @param {object | null | undefined} body
 * @returns {{ logLine: string, entry: object }}
 */
function syncErrorFromPushBody(filePath, body) {
	if (!body) {
		const logLine = '[Sync] Error: unhandled.';
		return {
			logLine,
			entry: {
				at: new Date().toISOString(),
				path: filePath,
				kind: 'unhandled',
				message: logLine,
				logLine
			}
		};
	}

	if (body.error) {
		const logLine = `[Sync] Error: ${filePath}\n${body.error}`;
		return {
			logLine,
			entry: {
				at: new Date().toISOString(),
				path: filePath,
				kind: 'validation',
				message: String(body.error),
				logLine,
				raw: { error: body.error }
			}
		};
	}

	if (body.reason || body.message) {
		let logLine = `[Sync] Error: ${filePath}`;
		const errorName = body.name ? body.name : 'Error';
		let detail;
		if (body.mark) {
			detail = `Location: ${errorName} on line ${body.mark.line}, column ${body.mark.column}.`;
			logLine += `\n${detail}`;
		}
		const guide = body.message || body.reason;
		logLine += `\nGuide: ${guide}`;
		return {
			logLine,
			entry: {
				at: new Date().toISOString(),
				path: filePath,
				kind: 'validation',
				message: String(guide),
				detail,
				logLine,
				raw: {
					name: body.name,
					reason: body.reason,
					message: body.message,
					mark: body.mark
				}
			}
		};
	}

	const logLine = '[Sync] Error: unhandled.';
	return {
		logLine,
		entry: {
			at: new Date().toISOString(),
			path: filePath,
			kind: 'unhandled',
			message: logLine,
			logLine,
			raw: body
		}
	};
}

/**
 * @param {string} displayPath path for logging
 * @param {string} [detail]
 */
function syncErrorFromAssetFailure(displayPath, detail) {
	const message = detail || 'Failed to sync';
	const logLine = detail
		? `[Sync] Error: ${displayPath}\n${detail}`
		: `[Sync] Error: ${displayPath} - Failed to sync`;
	return {
		logLine,
		entry: {
			at: new Date().toISOString(),
			path: displayPath.replace(/\\/g, '/'),
			kind: 'asset',
			message,
			logLine
		}
	};
}

/**
 * @param {{ logLine: string, entry: object, cwd?: string, pid?: number }} opts
 */
function recordSyncUploadError(opts) {
	logger.Error(opts.logLine, { exit: false });
	appendSyncStatusError({
		cwd: opts.cwd,
		pid: opts.pid,
		entry: opts.entry
	});
}

module.exports = {
	syncErrorFromPushBody,
	syncErrorFromAssetFailure,
	recordSyncUploadError
};
