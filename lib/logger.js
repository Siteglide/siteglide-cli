const instance = process.env.NO_COLOR ? require('./logger/simple.js') : require('./logger/rainbow.js');
const { isCliDebug } = require('./cliDebug');
const { sanitizeSecrets } = require('./sanitize');

let activeSpinner = null;

const registerSpinner = spinner => {
	activeSpinner = spinner;
};

const clearActiveSpinner = () => {
	if (activeSpinner && activeSpinner.isSpinning) {
		activeSpinner.clear();
	}
};

/**
 * `JSON.stringify` of an Error is `{}`, so errors are described by message and code, plus the stack in debug mode.
 * @param {Error & { code?: string }} err
 * @returns {string}
 */
const describeError = (err) => {
	let text = err.message || err.name || String(err);
	const cause = err.cause instanceof Error ? err.cause : null;
	if (
		cause
		&& cause.message
		&& !text.includes(cause.message)
	) {
		text += `: ${cause.message}`;
	}
	const code = err.code || (cause && cause.code);
	if (
		code
		&& !text.includes(code)
	) {
		text += ` (${code})`;
	}
	if (
		isCliDebug()
		&& err.stack
	) {
		text += `\n${err.stack}`;
	}
	return text;
};

const formatter = (msg, opts = { hideTimestamp: false }) => {
	let message = msg;

	if (msg instanceof Error) {
		message = describeError(msg);
	} else if (typeof msg != 'string') {
		message = JSON.stringify(sanitizeSecrets(msg), null, 2);
	}

	if (!opts.hideTimestamp) {
		const HHMMSS = new Date().toTimeString().split(' ')[0];
		message = `[${HHMMSS}] ${message}`;
	}

	return message.trim();
};

const logger = {
	Error: (message, opts) => {
		const options = Object.assign({}, { exit: true }, opts);
		clearActiveSpinner();
		instance.Print('\n');
		instance.Error(formatter(message, options));

		if (options.exit) {
			process.exit(1);
		}
	},
	Success: (message, opts = {}) => { clearActiveSpinner(); instance.Success(formatter(message, opts)); },
	Quiet: (message, opts = {}) => {
		if (!isCliDebug()) {
			return;
		}
		clearActiveSpinner();
		instance.Quiet(formatter(message, opts));
	},
	Muted: (message, opts = {}) => { clearActiveSpinner(); instance.Quiet(formatter(message, opts)); },
	Info: (message, opts = {}) => { clearActiveSpinner(); instance.Info(formatter(message, opts)); },
	Warn: (message, opts = {}) => { clearActiveSpinner(); instance.Warn(formatter(message, opts)); },
	Print: (message, opts = {}) => { clearActiveSpinner(); instance.Print(message, opts); },
	Debug: (message, opts = {}) => {
		if (!isCliDebug()) {
			return;
		}
		clearActiveSpinner();
		instance.Print('\n');
		instance.Warn(formatter(message, opts));
	},
	registerSpinner,
	describeError
};

module.exports = logger;
