const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { spawnSync } = require('child_process');
const { describeError } = require('../../lib/logger');
const { unreportedChildExitMessage } = require('../../lib/fatalError');

const LIB = path.join(__dirname, '..', '..', 'lib');
const HEADLINE = '[Sync] Sync stopped because of an unexpected error';

/**
 * @param {string} body script run after the optional handler install
 * @param {{ install: boolean }} opts
 */
function runScript(body, { install }) {
	const prelude = install
		? `require(${JSON.stringify(path.join(LIB, 'fatalError.js'))}).installFatalErrorHandlers(${JSON.stringify(HEADLINE)});\n`
		: '';
	const res = spawnSync(process.execPath, ['-e', prelude + body], {
		encoding: 'utf8',
		env: Object.assign({}, process.env, { NO_COLOR: '1', DEBUG: '', SITEGLIDE_CLI_DEBUG: '' })
	});
	return { code: res.status, stderr: res.stderr.replace(/\[\d{2}:\d{2}:\d{2}\] /g, '').trim() };
}

describe('describeError', () => {
	it('describes an Error by message, cause and code instead of {}', () => {
		const cause = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
		const err = new Error('fetch failed', { cause });
		assert.equal(describeError(err), 'fetch failed: socket hang up (ECONNRESET)');
	});

	it('logger.Error prints the message of an Error object', () => {
		const res = runScript(
			`require(${JSON.stringify(path.join(LIB, 'logger.js'))}).Error(new Error('Request failed with status 502'), { exit: false });`,
			{ install: false }
		);
		assert.deepEqual(res, { code: 0, stderr: 'Request failed with status 502' });
	});
});

describe('installFatalErrorHandlers', () => {
	const rejection = 'Promise.reject(new Error(\'boom from watch\'));';
	const exception = 'setTimeout(() => { throw new Error(\'thrown from watch\'); }, 0);';

	it('reports an unhandled rejection as one error line and exits 1', () => {
		assert.deepEqual(runScript(rejection, { install: true }), {
			code: 1,
			stderr: `${HEADLINE}: boom from watch`
		});
	});

	it('reports an uncaught exception as one error line and exits 1', () => {
		assert.deepEqual(runScript(exception, { install: true }), {
			code: 1,
			stderr: `${HEADLINE}: thrown from watch`
		});
	});

	it('control: without the handlers Node prints a stack trace and no headline', () => {
		const res = runScript(rejection, { install: false });
		assert.deepEqual(
			{ code: res.code, hasHeadline: res.stderr.includes(HEADLINE), hasStack: res.stderr.includes('boom from watch') },
			{ code: 1, hasHeadline: false, hasStack: true }
		);
	});
});

describe('unreportedChildExitMessage', () => {
	it('stays silent when the child reported or was stopped, and speaks otherwise', () => {
		const cases = [
			[0, null],
			[1, null],
			[130, null],
			[143, null],
			[0xC000013A, null],
			[null, 'SIGINT'],
			[null, 'SIGTERM'],
			[3, null],
			[134, null],
			[null, 'SIGKILL']
		];
		assert.deepEqual(
			cases.map(([code, signal]) => unreportedChildExitMessage('[Sync] Sync', code, signal)),
			[
				null,
				null,
				null,
				null,
				null,
				null,
				null,
				'[Sync] Sync stopped unexpectedly (exit code 3).',
				'[Sync] Sync stopped unexpectedly (exit code 134).',
				'[Sync] Sync stopped unexpectedly (signal SIGKILL).'
			]
		);
	});
});
