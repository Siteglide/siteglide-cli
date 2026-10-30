const fs = require('fs');
const path = require('path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { serializeRemoteFile } = require('../../lib/pull/serializeRemoteFile');

const fixtureRoot = path.join(__dirname, '../fixtures/pull-serialize');

describe('serializeRemoteFile', () => {
	it('body-only partial matches golden 404.liquid when record has no frontmatter fields', () => {
		const golden = fs.readFileSync(
			path.join(fixtureRoot, 'partial-body-only/404.liquid'),
			'utf8'
		);
		const out = serializeRemoteFile({
			kind: 'partial',
			record: {
				body: golden.trim() + '\n'
			}
		});
		assert.equal(out, golden.trim() + '\n');
	});

	it('emits frontmatter when page record has layout and metadata', () => {
		const out = serializeRemoteFile({
			kind: 'page',
			record: {
				layout: 'templates/1',
				max_deep_level: 1,
				metadata: { name: 'Blog', enabled: true, file_type: 'page' },
				redirect_to: '',
				redirect_url: '',
				searchable: true,
				content: '{% comment %}body{% endcomment %}'
			}
		});
		assert.match(out, /^---\n/);
		assert.match(out, /layout: templates\/1/);
		assert.match(out, /\n---\n/);
		assert.match(out, /body/);
	});
});
