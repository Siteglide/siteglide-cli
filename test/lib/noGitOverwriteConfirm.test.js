const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const {
	shouldPromptNoGitOverwriteConfirm,
	promptNoGitOverwriteConfirmIfNeeded,
	NO_GIT_OVERWRITE_CONFIRM_MESSAGE
} = require('../../lib/pull/noGitOverwriteConfirm');

describe('shouldPromptNoGitOverwriteConfirm', () => {
	it('prompts when no repo and interactive', () => {
		assert.equal(shouldPromptNoGitOverwriteConfirm({
			repoInitialized: false,
			isInteractive: true
		}), true);
	});

	it('skips when repo initialized', () => {
		assert.equal(shouldPromptNoGitOverwriteConfirm({
			repoInitialized: true,
			isInteractive: true
		}), false);
	});

	it('skips for merge-first sync nested pull', () => {
		assert.equal(shouldPromptNoGitOverwriteConfirm({
			mergeFirstSync: true,
			repoInitialized: false,
			isInteractive: true
		}), false);
	});

	it('skips when assumeYes', () => {
		assert.equal(shouldPromptNoGitOverwriteConfirm({
			repoInitialized: false,
			assumeYes: true,
			isInteractive: true
		}), false);
	});

	it('skips when not interactive', () => {
		assert.equal(shouldPromptNoGitOverwriteConfirm({
			repoInitialized: false,
			isInteractive: false
		}), false);
	});
});

describe('promptNoGitOverwriteConfirmIfNeeded', () => {
	let originalIsTTY;

	beforeEach(() => {
		originalIsTTY = process.stdin.isTTY;
		Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
	});

	afterEach(() => {
		Object.defineProperty(process.stdin, 'isTTY', {
			value: originalIsTTY,
			configurable: true
		});
	});

	it('returns true without calling confirm when repo initialized', async () => {
		let called = false;
		const result = await promptNoGitOverwriteConfirmIfNeeded({
			repoInitialized: true,
			confirmYesNo: async () => {
				called = true;
				return true;
			}
		});
		assert.equal(result, true);
		assert.equal(called, false);
	});

	it('returns false when user declines', async () => {
		let cancelCalled = false;
		const result = await promptNoGitOverwriteConfirmIfNeeded({
			repoInitialized: false,
			confirmYesNo: async () => false,
			onCancel: () => {
				cancelCalled = true;
			}
		});
		assert.equal(result, false);
		assert.equal(cancelCalled, true);
	});

	it('returns true when user confirms', async () => {
		let message = '';
		const result = await promptNoGitOverwriteConfirmIfNeeded({
			repoInitialized: false,
			confirmYesNo: async (msg) => {
				message = msg;
				return true;
			}
		});
		assert.equal(result, true);
		assert.equal(message, NO_GIT_OVERWRITE_CONFIRM_MESSAGE);
	});
});
