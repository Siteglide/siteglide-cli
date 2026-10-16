const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

describe('cliDebug', () => {
	const prevDebug = process.env.DEBUG;

	beforeEach(() => {
		delete process.env.DEBUG;
	});

	afterEach(() => {
		if (prevDebug === undefined) {
			delete process.env.DEBUG;
		} else {
			process.env.DEBUG = prevDebug;
		}
	});

	it('isCliDebug is false when DEBUG is unset', () => {
		const { isCliDebug } = require('../../lib/cliDebug');
		assert.equal(isCliDebug(), false);
	});

	it('enableCliDebug and DEBUG=1 both enable isCliDebug', () => {
		const { isCliDebug, enableCliDebug, applyDebugFlag } = require('../../lib/cliDebug');
		enableCliDebug();
		assert.equal(isCliDebug(), true);
		delete process.env.DEBUG;
		process.env.DEBUG = '1';
		assert.equal(isCliDebug(), true);
		assert.equal(applyDebugFlag({ debug: true }), true);
		assert.equal(isCliDebug(), true);
	});

	it('applyDebugFlag ignores absent flag', () => {
		const { isCliDebug, applyDebugFlag } = require('../../lib/cliDebug');
		assert.equal(applyDebugFlag({}), false);
		assert.equal(isCliDebug(), false);
	});

	it('argvHasDebugFlag detects -debug on argv', () => {
		const { argvHasDebugFlag, DEBUG_CLI_FLAG } = require('../../lib/cliDebug');
		assert.equal(DEBUG_CLI_FLAG, '-debug');
		assert.equal(argvHasDebugFlag(['node', 'pull.js', '-debug']), true);
		assert.equal(argvHasDebugFlag(['node', 'pull.js']), false);
	});
});

describe('logger quiet gating', () => {
	const prevDebug = process.env.DEBUG;

	afterEach(() => {
		if (prevDebug === undefined) {
			delete process.env.DEBUG;
		} else {
			process.env.DEBUG = prevDebug;
		}
	});

	it('Quiet does not write when DEBUG is unset', () => {
		delete process.env.DEBUG;
		const logger = require('../../lib/logger');
		let written = 0;
		const orig = console.log;
		console.log = () => {
			written += 1;
		};
		try {
			logger.Quiet('should not appear');
		} finally {
			console.log = orig;
		}
		assert.equal(written, 0);
	});

	it('Quiet runs without error when DEBUG is set and isCliDebug is true', () => {
		process.env.DEBUG = '1';
		delete require.cache[require.resolve('../../lib/cliDebug')];
		delete require.cache[require.resolve('../../lib/logger')];
		const { isCliDebug } = require('../../lib/cliDebug');
		assert.equal(isCliDebug(), true);
		const logger = require('../../lib/logger');
		assert.doesNotThrow(() => {
			logger.Quiet('visible progress');
		});
	});
});
