/**
 * `-debug` on Siteglide CLI commands — same effect as DEBUG=1 for this process.
 */

const DEBUG_CLI_FLAG = '-debug';
const DEBUG_OPTION_DESC = 'Verbose CLI output (same as DEBUG=1 for this command)';

/**
 * @returns {boolean}
 */
function isCliDebug() {
	return Boolean(process.env.DEBUG);
}

function enableCliDebug() {
	process.env.DEBUG = '1';
}

/**
 * @param {import('commander').Command} program
 */
function addDebugOption(program) {
	program.option(DEBUG_CLI_FLAG, DEBUG_OPTION_DESC);
}

/**
 * @returns {boolean}
 */
function argvHasDebugFlag(argv = process.argv) {
	return argv.includes(DEBUG_CLI_FLAG);
}

/**
 * Commander may expose `debug` or `Debug` depending on option spelling.
 *
 * @param {object} [params]
 * @returns {boolean} whether debug was enabled from the flag
 */
function applyDebugFlag(params) {
	if (!params) {
		return false;
	}
	if (params.debug || params.Debug) {
		enableCliDebug();
		return true;
	}
	return false;
}

/**
 * After `program.parse()`, read global options from the command instance.
 *
 * @param {import('commander').Command} program
 * @returns {boolean}
 */
function applyDebugFromProgram(program) {
	return applyDebugFlag(program.opts());
}

/**
 * @returns {boolean}
 */
function shouldPassDebugToChild() {
	return isCliDebug();
}

module.exports = {
	DEBUG_CLI_FLAG,
	DEBUG_OPTION_DESC,
	isCliDebug,
	enableCliDebug,
	addDebugOption,
	argvHasDebugFlag,
	applyDebugFlag,
	applyDebugFromProgram,
	shouldPassDebugToChild
};
