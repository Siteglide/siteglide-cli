/**
 * Map plan colour tokens to chalk for CLI prompts and related log lines.
 */

const chalk = require('chalk');

/**
 * @param {string | undefined | null} token
 * @param {string} text
 * @returns {string}
 */
function applyCliColour(token, text) {
	if (!text || !token || token === 'plain') {
		return text;
	}
	switch (token) {
		case 'info':
			return chalk.blue(text);
		case 'success':
			return chalk.green(text);
		case 'danger':
			return chalk.red(text);
		case 'warning':
			return chalk.yellow(text);
		case 'muted':
			return chalk.dim(text);
		default:
			return text;
	}
}

module.exports = {
	applyCliColour
};
