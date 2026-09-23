const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { hasProjectMcpConfig } = require('../../lib/ai');
const { maybeOfferGitSetupHint } = require('../../lib/git/maybeGitSetupHint');

describe('hasProjectMcpConfig', () => {
	let cwd;

	beforeEach(() => {
		cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-mcp-config-'));
	});

	afterEach(() => {
		fs.rmSync(cwd, { recursive: true, force: true });
	});

	it('returns false when no project MCP config exists', () => {
		assert.equal(hasProjectMcpConfig(cwd), false);
	});

	it('returns true when .cursor/mcp.json exists', () => {
		const cursorDir = path.join(cwd, '.cursor');
		fs.mkdirSync(cursorDir, { recursive: true });
		fs.writeFileSync(path.join(cursorDir, 'mcp.json'), '{}\n');
		assert.equal(hasProjectMcpConfig(cwd), true);
	});
});

describe('maybeOfferGitSetupHint', () => {
	let cwd;

	beforeEach(() => {
		cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-git-hint-'));
	});

	afterEach(() => {
		fs.rmSync(cwd, { recursive: true, force: true });
	});

	it('skips when project MCP config is not present yet', async () => {
		const result = await maybeOfferGitSetupHint({
			cwd,
			git: { repoInitialized: false, installed: true, identityConfigured: false }
		});
		assert.deepEqual(result, { offered: false, reason: 'awaiting_mcp' });
	});

	it('skips when git repo is already initialized', async () => {
		const cursorDir = path.join(cwd, '.cursor');
		fs.mkdirSync(cursorDir, { recursive: true });
		fs.writeFileSync(path.join(cursorDir, 'mcp.json'), '{}\n');

		const result = await maybeOfferGitSetupHint({
			cwd,
			git: { repoInitialized: true, installed: true, identityConfigured: true }
		});
		assert.deepEqual(result, { offered: false, reason: 'git_ready' });
	});
});
