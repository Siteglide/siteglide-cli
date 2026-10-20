const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
	formatPresignErrorDetail,
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
});
