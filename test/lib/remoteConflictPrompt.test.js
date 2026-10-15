const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
	formatSyncConflictFileLabel,
	CANCEL_SKIP_REMOTE_HINT
} = require('../../lib/remoteConflictPrompt');

describe('CANCEL_SKIP_REMOTE_HINT', () => {
	it('uses muted skip-remote wording', () => {
		assert.equal(CANCEL_SKIP_REMOTE_HINT, '-s Skipping conflict checks');
	});
});

describe('formatSyncConflictFileLabel', () => {
	it('prefers API physical path over local path', () => {
		assert.equal(
			formatSyncConflictFileLabel({
				path: 'assets/css/site.css',
				localPath: 'marketplace_builder/assets/css/site.css'
			}),
			'assets/css/site.css'
		);
	});

	it('falls back to local path when physical path is missing', () => {
		assert.equal(
			formatSyncConflictFileLabel({
				localPath: 'modules/core/public/views/partials/foo.liquid'
			}),
			'modules/core/public/views/partials/foo.liquid'
		);
	});

	it('normalizes backslashes', () => {
		assert.equal(
			formatSyncConflictFileLabel({
				path: 'assets\\css\\site.css'
			}),
			'assets/css/site.css'
		);
	});
});
