const instance = process.env.NO_COLOR ? require('./logger/simple.js') : require('./logger/rainbow.js');
const { localTimeZoneLabel } = require('./formatLocalDateTime');

const formatter = (msg, opts = { hideTimestamp: false }) => {
	let message = msg;

	if (typeof msg != 'string') {
		message = JSON.stringify(msg, null, 2);
	}

	if (!opts.hideTimestamp) {
		const now = new Date();
		const HHMMSS = now.toTimeString().split(' ')[0];
		const tz = localTimeZoneLabel(now);
		message = `[${HHMMSS} ${tz}] ${message}`;
	}

	return message.trim();
};

const logger = {
	Error: (message, opts) => {
		const options = Object.assign({}, { exit: true }, opts);
		instance.Print('\n');
		instance.Error(formatter(message, options));

		if (options.exit) {
			process.exit(1);
		}
	},
	Success: (message, opts = {}) => instance.Success(formatter(message, opts)),
	Quiet: (message, opts = {}) => instance.Quiet(formatter(message, opts)),
	Info: (message, opts = {}) => instance.Info(formatter(message, opts)),
	Warn: (message, opts = {}) => instance.Warn(formatter(message, opts)),
	Print: (message, opts = {}) => instance.Print(message, opts),
	Debug: (message, opts = {}) => {
		if (process.env.DEBUG) {
			instance.Print('\n');
			instance.Warn(formatter(message, opts));
		}
	}
};

module.exports = logger;
