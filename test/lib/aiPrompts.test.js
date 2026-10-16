const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildGitSetupAiPrompt } = require('../../lib/aiPrompts');

describe('buildGitSetupAiPrompt', () => {
	it('includes the git setup to-do list and pull-again reminder', () => {
		const prompt = buildGitSetupAiPrompt();
		assert.match(prompt, /To-do list:/);
		assert.match(prompt, /git_status/);
		assert.match(prompt, /siteglide-cli pull command again/);
		assert.match(prompt, /AI agentic assistant/);
	});
});
