const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildGitSetupAiPrompt, buildTemporaryBranchAiPrompt } = require('../../lib/aiPrompts');

describe('buildTemporaryBranchAiPrompt', () => {
	it('names the branches and asks for git_status', () => {
		assert.equal(buildTemporaryBranchAiPrompt({
			currentBranch: 'temp-pull-from-staging-2026-10-16-1453',
			homeBranch: 'main',
			command: 'sync'
		}), [
			'siteglide-cli sync stopped: I am on merge-first temporary git branch "temp-pull-from-staging-2026-10-16-1453".',
			'My expected home branch is "main".',
			'',
			'Call the Siteglide MCP tool `git_status` on this project and follow its rescue guidance.'
		].join('\n'));
	});
});

describe('buildGitSetupAiPrompt', () => {
	it('includes the git setup to-do list and pull-again reminder', () => {
		const prompt = buildGitSetupAiPrompt();
		assert.match(prompt, /To-do list:/);
		assert.match(prompt, /git_status/);
		assert.match(prompt, /siteglide-cli pull command again/);
		assert.match(prompt, /Siteglide MCP audience tool/);
	});
});
