const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { copyToClipboard } = require('../../lib/clipboard');
const {
	COPY_AI_PROMPT_VALUE,
	copyAiPromptChoice,
	copyAiPrompt
} = require('../../lib/prompts');

describe('clipboard helpers', () => {
	it('copyAiPromptChoice uses stable value for select menus', () => {
		assert.deepEqual(copyAiPromptChoice(), {
			name: 'Copy AI prompt to clipboard',
			value: COPY_AI_PROMPT_VALUE,
			description: 'Copies a ready-made prompt you can paste into Cursor or Claude chat'
		});
		assert.equal(copyAiPromptChoice({ name: 'Copy help' }).name, 'Copy help');
	});

	it('copyToClipboard accepts a string without throwing', () => {
		const result = copyToClipboard('siteglide clipboard smoke test');
		assert.equal(typeof result.ok, 'boolean');
		if (!result.ok) {
			assert.equal(typeof result.error, 'string');
		}
	});

	it('copyAiPrompt returns clipboard result shape', () => {
		const result = copyAiPrompt('siteglide AI prompt smoke test');
		assert.equal(typeof result.ok, 'boolean');
	});
});
