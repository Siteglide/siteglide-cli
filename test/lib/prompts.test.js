const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { PROMPT_HINTS } = require('../../lib/prompts');

describe('prompt hints', () => {
	it('documents keyboard usage for each interactive prompt type', () => {
		assert.match(PROMPT_HINTS.select, /arrow keys/i);
		assert.match(PROMPT_HINTS.select, /Enter/i);
		assert.match(PROMPT_HINTS.checkbox, /arrow keys/i);
		assert.match(PROMPT_HINTS.checkbox, /Space/i);
		assert.match(PROMPT_HINTS.checkbox, /select\/deselect/i);
		assert.match(PROMPT_HINTS.confirm, /Press Y or n/);
		assert.doesNotMatch(PROMPT_HINTS.confirm, /default/i);
		assert.match(PROMPT_HINTS.input, /Enter/i);
	});
});
