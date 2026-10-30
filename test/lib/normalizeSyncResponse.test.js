const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeSyncBody } = require('../../lib/sync/normalizeSyncResponse');

describe('normalizeSyncBody', () => {
	it('parses JSON string array from Siteglide sync API', () => {
		const body = ['{"refresh_index":false,"updated_at":"2026-01-01T12:00:00.000Z"}'];
		assert.deepEqual(normalizeSyncBody(body), {
			refresh_index: false,
			updated_at: '2026-01-01T12:00:00.000Z'
		});
	});

	it('returns object body unchanged', () => {
		const body = { refresh_index: true };
		assert.deepEqual(normalizeSyncBody(body), body);
	});

	it('returns non-JSON string element as-is', () => {
		const body = ['not-json'];
		assert.equal(normalizeSyncBody(body), 'not-json');
	});
});
