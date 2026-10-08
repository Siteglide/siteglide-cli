const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { run } = require('../../lib/git/readiness');
const { GITIGNORE_AGENTS_LINE } = require('../../lib/siteglidePaths');
const {
	resolveAgentGitignoreEntries,
	gitignoreAlreadyListsEntry,
	appendAgentGitignoreEntries,
	isAgentEntryIgnoreConfigured
} = require('../../lib/git/agentGitignore');

function gitInit(cwd) {
	assert.equal(run('git', ['init'], { cwd }).ok, true);
	run('git', ['config', 'user.email', 'test@example.com'], { cwd });
	run('git', ['config', 'user.name', 'Test User'], { cwd });
	run('git', ['config', 'checkout.defaultRemote', 'origin'], { cwd });
	run('git', ['checkout', '-b', 'main'], { cwd });
}

describe('agentGitignore', () => {
	let cwd;

	beforeEach(() => {
		cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-agent-gitignore-'));
		gitInit(cwd);
	});

	afterEach(() => {
		fs.rmSync(cwd, { recursive: true, force: true });
	});

	it('resolves entries for enabled skill agents and .agents/', () => {
		assert.deepEqual(
			resolveAgentGitignoreEntries({
				includeAgentsRoot: true,
				enabledSkillAgents: ['Cursor', 'Claude']
			}),
			['.agents/', '.cursor/', '.claude/', '.mcp.json']
		);
	});

	it('detects an existing ignore line without duplicating it', () => {
		fs.writeFileSync(path.join(cwd, '.gitignore'), `${GITIGNORE_AGENTS_LINE}\n`);
		const result = appendAgentGitignoreEntries(cwd, [GITIGNORE_AGENTS_LINE, '.cursor/']);
		assert.equal(result.ok, true);
		assert.deepEqual(result.added, ['.cursor/']);
		const content = fs.readFileSync(path.join(cwd, '.gitignore'), 'utf8');
		assert.equal((content.match(/\.agents\/?/g) || []).length, 1);
		assert.match(content, /\.cursor\//);
	});

	it('does not rewrite .gitignore when every entry is already listed', () => {
		fs.writeFileSync(
			path.join(cwd, '.gitignore'),
			`${GITIGNORE_AGENTS_LINE}\n.cursor/\n`
		);
		const before = fs.readFileSync(path.join(cwd, '.gitignore'), 'utf8');
		const result = appendAgentGitignoreEntries(cwd, [GITIGNORE_AGENTS_LINE, '.cursor/']);
		assert.equal(result.ok, true);
		assert.equal(result.alreadyPresent, true);
		assert.deepEqual(result.added, []);
		const after = fs.readFileSync(path.join(cwd, '.gitignore'), 'utf8');
		assert.equal(after, before);
	});

	it('treats a parent directory rule as covering nested agent paths', () => {
		fs.writeFileSync(path.join(cwd, '.gitignore'), '.cursor/\n');
		assert.equal(isAgentEntryIgnoreConfigured(cwd, '.cursor/'), true);
		assert.equal(isAgentEntryIgnoreConfigured(cwd, '.cursor/skills'), true);
	});

	it('gitignoreAlreadyListsEntry matches common spellings', () => {
		assert.equal(gitignoreAlreadyListsEntry('.agents/\n', '.agents/'), true);
		assert.equal(gitignoreAlreadyListsEntry('.agents\n', '.agents/'), true);
		assert.equal(gitignoreAlreadyListsEntry('node_modules/\n', '.agents/'), false);
	});
});
