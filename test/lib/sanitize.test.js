const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { spawnSync } = require('child_process');
const { sanitizeSecrets } = require('../../lib/sanitize');

const LIB = path.join(__dirname, '..', '..', 'lib');
const TOKEN = 'tok_live_9f8e7d6c5b4a';

describe('sanitizeSecrets', () => {
	it('replaces credential values at any depth and leaves everything else alone', () => {
		const input = {
			uri: 'https://example.com/api/private/cli/ping',
			headers: {
				Authorization: TOKEN,
				token: TOKEN,
				'x-api-key': TOKEN,
				'set-cookie': ['session=abc'],
				site: 'https://example.com',
				From: 'dev@example.com'
			},
			list: [{ access_token: TOKEN, id: 3 }],
			emptyToken: '',
			tokens_count: 2
		};
		assert.deepEqual(sanitizeSecrets(input), {
			uri: 'https://example.com/api/private/cli/ping',
			headers: {
				Authorization: '<sanitized>',
				token: '<sanitized>',
				'x-api-key': '<sanitized>',
				'set-cookie': '<sanitized>',
				site: 'https://example.com',
				From: 'dev@example.com'
			},
			list: [{ access_token: '<sanitized>', id: 3 }],
			emptyToken: '',
			tokens_count: 2
		});
		assert.equal(input.headers.Authorization, TOKEN);
	});

	it('keeps an Error\'s name and message and survives a cycle', () => {
		const err = Object.assign(new Error('Request failed with status 401'), { statusCode: 401 });
		err.self = err;
		assert.deepEqual(sanitizeSecrets(err), {
			name: 'Error',
			message: 'Request failed with status 401',
			statusCode: 401,
			self: '[Circular]'
		});
	});
});

describe('a failed request printed in debug mode', () => {
	it('never shows the token, wherever the error is printed', () => {
		const script = `
			const http = require('http');
			const { apiRequest } = require(${JSON.stringify(path.join(LIB, 'apiRequest.js'))});
			const ServerError = require(${JSON.stringify(path.join(LIB, 'ServerError.js'))});
			const Gateway = require(${JSON.stringify(path.join(LIB, 'proxy.js'))});
			let received = null;
			const server = http.createServer((req, res) => {
				received = req.headers.authorization;
				res.writeHead(401, { 'set-cookie': 'session=${TOKEN}' });
				res.end('{"error":"unauthorized"}');
			});
			server.listen(0, '127.0.0.1', async () => {
				const url = 'http://127.0.0.1:' + server.address().port;
				new Gateway({ url, token: ${JSON.stringify(TOKEN)}, email: 'dev@example.com' });
				try {
					await apiRequest({ uri: url + '/api/private/cli/ping', headers: { Authorization: ${JSON.stringify(TOKEN)} } });
				} catch (err) {
					console.log('server received the token:', received === ${JSON.stringify(TOKEN)});
					console.log(err);
					server.close();
					ServerError.unauthorized(err);
				}
			});
		`;
		const res = spawnSync(process.execPath, ['-e', script], {
			encoding: 'utf8',
			env: Object.assign({}, process.env, { NO_COLOR: '1', DEBUG: '1' })
		});
		const output = res.stdout + res.stderr;

		assert.ok(output.includes('server received the token: true'), output);
		assert.ok(output.includes('Unauthorized error:'), output);
		assert.ok(output.includes('Request headers:'), output);
		assert.ok(output.includes('<sanitized>'), output);
		assert.equal(output.includes(TOKEN), false, output);
	});
});
