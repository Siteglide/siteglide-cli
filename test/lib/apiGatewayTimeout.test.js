const assert = require('assert');
const { isSiteglideApiTimeout, requestIdFromError } = require('../../lib/apiGatewayTimeout');

describe('apiGatewayTimeout', () => {
	it('detects Siteglide API 503 timeout body', () => {
		assert.equal(isSiteglideApiTimeout({
			name: 'StatusCodeError',
			statusCode: 503,
			error: { error: 'timeout' }
		}), true);
	});

	it('does not treat other 503 responses as API timeout', () => {
		assert.equal(isSiteglideApiTimeout({
			name: 'StatusCodeError',
			statusCode: 503,
			error: { error: 'unavailable' }
		}), false);
	});

	it('reads x-request-id from error response headers', () => {
		assert.equal(requestIdFromError({
			response: { headers: { 'x-request-id': 'abc-123' } }
		}), 'abc-123');
	});
});
