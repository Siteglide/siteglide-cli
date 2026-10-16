const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
	formatNestedPullOutputTail,
	nestedPullFailureMessage,
	appendNestedPullCapture
} = require('../../lib/pull/nestedPullOutput');

describe('formatNestedPullOutputTail', () => {
	it('prefers tagged pull and error lines', () => {
		const text = [
			'noise from spinner',
			'[15:36:58] pulling',
			'[15:36:59] [Error] [pull] Refusing pull while conflict_markers.',
			'[15:36:59] Pull failed'
		].join('\n');
		assert.equal(
			formatNestedPullOutputTail(text, 2),
			'[15:36:59] [Error] [pull] Refusing pull while conflict_markers.\n[15:36:59] Pull failed'
		);
	});

	it('falls back to last raw lines when nothing is tagged', () => {
		const text = 'line one\nline two\nline three';
		assert.equal(formatNestedPullOutputTail(text, 2), 'line two\nline three');
	});

	it('includes fetch failed and spinner failure lines', () => {
		const text = [
			'[15:38:00] [GET] https://api.example/list_modules',
			'✖ Pull failed',
			'[15:38:11] fetch failed'
		].join('\n');
		assert.match(formatNestedPullOutputTail(text), /fetch failed/);
		assert.match(formatNestedPullOutputTail(text), /Pull failed/);
	});
});

describe('nestedPullFailureMessage', () => {
	it('includes exit code and tail', () => {
		const msg = nestedPullFailureMessage(1, '[Error] [Cancelled] Pull not executed');
		assert.match(msg, /Nested pull failed \(exit 1\):/);
		assert.match(msg, /Pull not executed/);
	});

	it('hints when capture is empty', () => {
		assert.equal(
			nestedPullFailureMessage(1, ''),
			'Nested pull failed (exit 1). See the nested pull output above for details.'
		);
	});
});

describe('appendNestedPullCapture', () => {
	it('truncates from the front when over limit', () => {
		const long = 'a'.repeat(20000);
		const out = appendNestedPullCapture('', long);
		assert.equal(out.length, 16384);
		assert.ok(out.endsWith('a'));
	});
});
