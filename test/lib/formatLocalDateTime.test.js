const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { formatLocalDateTime } = require('../../lib/formatLocalDateTime');

describe('formatLocalDateTime', () => {
	it('returns unknown for empty values', () => {
		assert.equal(formatLocalDateTime(null), 'unknown');
		assert.equal(formatLocalDateTime(''), 'unknown');
	});

	it('formats a known instant in local time with a timezone label', () => {
		const out = formatLocalDateTime('2026-08-12T14:30:00.000Z');
		assert.match(out, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} /);
		assert.match(out, /UTC[+-]\d{2}:\d{2}/);
		assert.equal(out.includes('Z'), false);
	});

	it('returns the raw string when unparseable', () => {
		assert.equal(formatLocalDateTime('not-a-date'), 'not-a-date');
	});
});
