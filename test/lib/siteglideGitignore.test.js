const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { run } = require('../../lib/git/readiness');
const {
	isSiteglideDirGitignored,
	isSiteglideUserIgnoreConfigured,
	listTrackedSiteglideUserFiles,
	untrackSiteglideUserFromGit,
	gitignoreAlreadyListsSiteglide,
	appendSiteglideToGitignore,
	SITEGLIDE_IGNORE_ENTRY
} = require('../../lib/git/siteglideGitignore');

function gitInit(cwd) {
	assert.equal(run('git', ['init'], { cwd }).ok, true);
	run('git', ['config', 'user.email', 'test@example.com'], { cwd });
	run('git', ['config', 'user.name', 'Test User'], { cwd });
	run('git', ['config', 'checkout.defaultRemote', 'origin'], { cwd });
	run('git', ['checkout', '-b', 'main'], { cwd });
}

describe('siteglideGitignore', () => {
	let cwd;

	beforeEach(() => {
		cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-gitignore-'));
		gitInit(cwd);
	});

	afterEach(() => {
		fs.rmSync(cwd, { recursive: true, force: true });
	});

	it('detects when .siteglide/user/ is not gitignored', () => {
		assert.equal(isSiteglideDirGitignored(cwd), false);
	});

	it('detects when .siteglide/user/ is gitignored', () => {
		fs.writeFileSync(path.join(cwd, '.gitignore'), `${SITEGLIDE_IGNORE_ENTRY}\n`);
		assert.equal(isSiteglideDirGitignored(cwd), true);
	});

	it('detects gitignore from a repository subdirectory', () => {
		fs.writeFileSync(path.join(cwd, '.gitignore'), `${SITEGLIDE_IGNORE_ENTRY}\n`);
		const sub = path.join(cwd, 'app', 'nested');
		fs.mkdirSync(sub, { recursive: true });
		assert.equal(isSiteglideUserIgnoreConfigured(sub), true);
	});

	it('detects .siteglide/* ignore pattern without an explicit user line', () => {
		fs.writeFileSync(path.join(cwd, '.gitignore'), '.siteglide/*\n!.siteglide/project/\n');
		assert.equal(isSiteglideUserIgnoreConfigured(cwd), true);
	});

	it('treats .siteglide/user/ as gitignored when listed in .gitignore but still tracked', () => {
		fs.writeFileSync(path.join(cwd, '.gitignore'), `${SITEGLIDE_IGNORE_ENTRY}\n`);
		const userFile = path.join(cwd, '.siteglide', 'user', 'sync', 'state.json');
		fs.mkdirSync(path.dirname(userFile), { recursive: true });
		fs.writeFileSync(userFile, '{}');
		assert.equal(run('git', ['add', '-f', userFile], { cwd }).ok, true);
		assert.equal(run('git', ['commit', '-m', 'track user metadata'], { cwd }).ok, true);
		assert.equal(isSiteglideUserIgnoreConfigured(cwd), true);
		assert.deepEqual(listTrackedSiteglideUserFiles(cwd), ['.siteglide/user/sync/state.json']);
	});

	it('untracks all files under .siteglide/user/ without deleting them from disk', () => {
		fs.writeFileSync(path.join(cwd, '.gitignore'), `${SITEGLIDE_IGNORE_ENTRY}\n`);
		const userFile = path.join(cwd, '.siteglide', 'user', 'pull', 'baseline.json');
		fs.mkdirSync(path.dirname(userFile), { recursive: true });
		fs.writeFileSync(userFile, '{}');
		assert.equal(run('git', ['add', '-f', userFile], { cwd }).ok, true);
		assert.equal(run('git', ['commit', '-m', 'track user metadata'], { cwd }).ok, true);

		const result = untrackSiteglideUserFromGit(cwd);
		assert.equal(result.ok, true);
		assert.deepEqual(result.untracked, ['.siteglide/user/pull/baseline.json']);
		assert.equal(listTrackedSiteglideUserFiles(cwd).length, 0);
		assert.equal(fs.existsSync(userFile), true);
	});

	it('appends .siteglide/user/ to an existing .gitignore', () => {
		fs.writeFileSync(path.join(cwd, '.gitignore'), 'node_modules/\n');
		const result = appendSiteglideToGitignore(cwd);
		assert.equal(result.ok, true);
		const content = fs.readFileSync(path.join(cwd, '.gitignore'), 'utf8');
		assert.match(content, /node_modules\//);
		assert.match(content, /\.siteglide\/user\//);
		assert.equal(isSiteglideDirGitignored(cwd), true);
	});

	it('creates .gitignore when missing', () => {
		const result = appendSiteglideToGitignore(cwd);
		assert.equal(result.ok, true);
		assert.equal(fs.existsSync(path.join(cwd, '.gitignore')), true);
		assert.equal(isSiteglideDirGitignored(cwd), true);
	});

	it('does not duplicate an existing .siteglide/user/ entry', () => {
		fs.writeFileSync(path.join(cwd, '.gitignore'), `${SITEGLIDE_IGNORE_ENTRY}\n`);
		const result = appendSiteglideToGitignore(cwd);
		assert.equal(result.ok, true);
		assert.equal(result.alreadyPresent, true);
		const content = fs.readFileSync(path.join(cwd, '.gitignore'), 'utf8');
		assert.equal((content.match(/\.siteglide\/user\/?/g) || []).length, 1);
	});

	it('gitignoreAlreadyListsSiteglide matches common spellings', () => {
		assert.equal(gitignoreAlreadyListsSiteglide('.siteglide/user/\n'), true);
		assert.equal(gitignoreAlreadyListsSiteglide('.siteglide/user\n'), true);
		assert.equal(gitignoreAlreadyListsSiteglide('.siteglide/user/**\n'), true);
		assert.equal(gitignoreAlreadyListsSiteglide('.siteglide/\n'), true);
		assert.equal(gitignoreAlreadyListsSiteglide('node_modules/\n'), false);
	});
});
