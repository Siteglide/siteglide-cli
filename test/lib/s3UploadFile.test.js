const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const originalFetch = global.fetch;

describe('s3UploadFile', () => {
	let tmpDir;
	let uploadFile;
	let uploadFileFormData;

	beforeEach(async () => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-s3-upload-'));
		global.fetch = async () => ({ ok: true, status: 200, text: async () => '' });
		// Fresh module graph so fetch mock applies
		const modulePath = path.join(__dirname, '..', '..', 'lib', 's3UploadFile.js');
		delete require.cache[modulePath];
		delete require.cache[path.join(__dirname, '..', '..', 'lib', 'assetContentType.js')];
		const mod = require(modulePath);
		uploadFile = mod.uploadFile;
		uploadFileFormData = mod.uploadFileFormData;
	});

	afterEach(() => {
		global.fetch = originalFetch;
		if (tmpDir && fs.existsSync(tmpDir)) {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	it('PUT sends Content-Type from file extension without octet-stream fallback', async () => {
		const filePath = path.join(tmpDir, 'image.jpg');
		fs.writeFileSync(filePath, Buffer.from('jpeg-bytes'));
		let seenHeaders;

		global.fetch = async (_url, options) => {
			seenHeaders = options.headers;
			return { ok: true, status: 200, text: async () => '' };
		};

		await uploadFile(filePath, 'https://s3.example.com/bucket/key');

		assert.equal(seenHeaders['Content-Type'], 'image/jpeg');
		assert.equal(seenHeaders['Content-Length'], String(fs.statSync(filePath).size));
	});

	it('includes S3 Code and Message when upload fails with XML body', async () => {
		const filePath = path.join(tmpDir, 'assets.zip');
		fs.writeFileSync(filePath, Buffer.from('zip'));

		global.fetch = async () => ({
			ok: false,
			status: 403,
			text: async () =>
				'<?xml version="1.0"?><Error><Code>AccessDenied</Code><Message>Request has expired</Message></Error>'
		});

		await assert.rejects(
			() => uploadFile(filePath, 'https://s3.example.com/bucket/assets.zip'),
			(err) => {
				assert.equal(err.statusCode, 403);
				assert.equal(err.message, 'Upload failed with status 403: AccessDenied: Request has expired');
				return true;
			}
		);
	});

	it('preserves signed Content-Type form field and sets File.type from path', async () => {
		const filePath = path.join(tmpDir, 'image.png');
		fs.writeFileSync(filePath, Buffer.from('PNG'));
		const data = {
			url: 'https://s3.example.com/bucket',
			fields: {
				key: 'assets/${filename}',
				'Content-Type': 'application/octet-stream',
				policy: 'policy',
				signature: 'sig'
			}
		};
		let formBody;

		global.fetch = async (_url, options) => {
			formBody = options.body;
			return { ok: true, status: 200, text: async () => '' };
		};

		await uploadFileFormData(filePath, data);

		assert.ok(formBody instanceof FormData);
		const contentTypeFields = formBody.getAll('Content-Type');
		assert.deepEqual(contentTypeFields, ['application/octet-stream']);
		const filePart = formBody.get('file');
		assert.equal(filePart.type, 'image/png');
	});

	it('adds Content-Type form field when presigned fields omit it', async () => {
		const filePath = path.join(tmpDir, 'image.png');
		fs.writeFileSync(filePath, Buffer.from('PNG'));
		const data = {
			url: 'https://s3.example.com/bucket',
			fields: {
				key: 'assets/${filename}',
				policy: 'policy',
				signature: 'sig'
			}
		};
		let formBody;

		global.fetch = async (_url, options) => {
			formBody = options.body;
			return { ok: true, status: 200, text: async () => '' };
		};

		await uploadFileFormData(filePath, data);

		assert.deepEqual(formBody.getAll('Content-Type'), ['image/png']);
		assert.equal(formBody.get('file').type, 'image/png');
	});
});
