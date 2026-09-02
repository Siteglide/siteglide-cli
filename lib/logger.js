const instance = process.env.NO_COLOR ? require('./logger/simple.js') : require('./logger/rainbow.js');

let activeSpinner = null;

const registerSpinner = spinner => {
	activeSpinner = spinner;
};

const clearActiveSpinner = () => {
	if (activeSpinner && activeSpinner.isSpinning) {
		activeSpinner.clear();
	}
};

const formatter = (msg, opts = { hideTimestamp: false }) => {
	let message = msg;

	if (typeof msg != 'string') {
		message = JSON.stringify(msg, null, 2);
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
	Quiet: (message, opts = {}) => { clearActiveSpinner(); instance.Quiet(formatter(message, opts)); },
	Info: (message, opts = {}) => { clearActiveSpinner(); instance.Info(formatter(message, opts)); },
	Warn: (message, opts = {}) => { clearActiveSpinner(); instance.Warn(formatter(message, opts)); },
	Print: (message, opts = {}) => { clearActiveSpinner(); instance.Print(message, opts); },
	Debug: (message, opts = {}) => {
		if (process.env.DEBUG) {
			clearActiveSpinner();
			instance.Print('\n');
			instance.Warn(formatter(message, opts));
		}
	},
	registerSpinner
};

module.exports = logger;
