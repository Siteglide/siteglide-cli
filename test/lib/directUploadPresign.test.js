const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
	formatPresignErrorDetail,
	policyExpirationFromPresignPolicy,
	summarizeDirectUploadPresign,
	directUploadPresignFailureMessage
} = require('../../lib/directUploadPresign');

describe('directUploadPresign', () => {
	it('summarizeDirectUploadPresign expands error arrays and objects', () => {
		const summary = summarizeDirectUploadPresign({
			error: [{ code: 'invalid', message: 'directory not allowed' }]
		});
		assert.deepEqual(summary.topLevelKeys, ['error']);
		assert.equal(
			summary.errorDetail,
			JSON.stringify([{ code: 'invalid', message: 'directory not allowed' }], null, 2)
		);
	});

	it('directUploadPresignFailureMessage returns null for a valid presign-directory payload', () => {
		assert.equal(
			directUploadPresignFailureMessage({
				url: 'https://bucket.example/upload',
				fields: { key: 'assets/${filename}' }
			}),
			null
		);
	});

	it('directUploadPresignFailureMessage includes expanded error detail', () => {
		const message = directUploadPresignFailureMessage({
			error: 'presign-url does not accept directory'
		});
		assert.equal(message, 'Asset presign failed:\npresign-url does not accept directory');
	});

	it('formatPresignErrorDetail stringifies nested errors', () => {
		assert.equal(
			formatPresignErrorDetail({ errors: ['a', 'b'] }),
			JSON.stringify({ errors: ['a', 'b'] }, null, 2)
		);
	});

	it('summarizeDirectUploadPresign reads policy expiration for debug timelines', () => {
		const policy = Buffer.from(
			JSON.stringify({ expiration: '2026-10-23T15:42:23Z', conditions: [] }),
			'utf8'
		).toString('base64');
		const summary = summarizeDirectUploadPresign({
			url: 'https://bucket.example/upload',
			fields: { key: 'instances/1/assets/${filename}', policy }
		});
		assert.equal(summary.policyExpiresAt, '2026-10-23T15:42:23Z');
		assert.equal(policyExpirationFromPresignPolicy(policy), '2026-10-23T15:42:23Z');
	});
});
