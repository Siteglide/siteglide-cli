/**
 * Map plan colour tokens to chalk for CLI prompts and related log lines.
 */

const chalk = require('chalk');

/**
 * @param {string | undefined | null} token
 * @param {string} text
 * @param {NodeJS.WriteStream} [stream] When set (e.g. `process.stderr` for ora), colour follows that stream — default `chalk` only inspects stdout.
 * @returns {string}
 */
function applyCliColour(token, text, stream) {
	if (!text || !token || token === 'plain') {
		return text;
	}
	const c = stream === process.stderr ? chalk.stderr : chalk;
	switch (token) {
		case 'info':
			// The CLI's one blue: cyan ("ice blue"), matching check.js and readiness.js. Never chalk.blue.
			return c.cyan(text);
		case 'success':
			return c.green.bold(text);
		case 'danger':
			return c.red(text);
		case 'warning':
			return c.yellow(text);
		case 'muted':
			return c.dim(text);
		default:
			return text;
	}
}

module.exports = {
	applyCliColour
};
