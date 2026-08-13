const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { run } = require('../../lib/git/readiness');
const {
	isSiteglideDirGitignored,
	gitignoreAlreadyListsSiteglide,
	appendSiteglideToGitignore,
	SITEGLIDE_IGNORE_ENTRY
} = require('../../lib/git/siteglideGitignore');

function gitInit(cwd) {
	assert.equal(run('git', ['init'], { cwd }).ok, true);
	run('git', ['config', 'user.email', 'test@example.com'], { cwd });
	run('git', ['config', 'user.name', 'Test User'], { cwd });
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

	it('detects when .siteglide/ is not gitignored', () => {
		assert.equal(isSiteglideDirGitignored(cwd), false);
	});

	it('detects when .siteglide/ is gitignored', () => {
		fs.writeFileSync(path.join(cwd, '.gitignore'), `${SITEGLIDE_IGNORE_ENTRY}\n`);
		assert.equal(isSiteglideDirGitignored(cwd), true);
	});

	it('appends .siteglide/ to an existing .gitignore', () => {
		fs.writeFileSync(path.join(cwd, '.gitignore'), 'node_modules/\n');
		const result = appendSiteglideToGitignore(cwd);
		assert.equal(result.ok, true);
		const content = fs.readFileSync(path.join(cwd, '.gitignore'), 'utf8');
		assert.match(content, /node_modules\//);
		assert.match(content, /\.siteglide\//);
		assert.equal(isSiteglideDirGitignored(cwd), true);
	});

	it('creates .gitignore when missing', () => {
		const result = appendSiteglideToGitignore(cwd);
		assert.equal(result.ok, true);
		assert.equal(fs.existsSync(path.join(cwd, '.gitignore')), true);
		assert.equal(isSiteglideDirGitignored(cwd), true);
	});

	it('does not duplicate an existing .siteglide/ entry', () => {
		fs.writeFileSync(path.join(cwd, '.gitignore'), `${SITEGLIDE_IGNORE_ENTRY}\n`);
		const result = appendSiteglideToGitignore(cwd);
		assert.equal(result.ok, true);
		assert.equal(result.alreadyPresent, true);
		const content = fs.readFileSync(path.join(cwd, '.gitignore'), 'utf8');
		assert.equal((content.match(/\.siteglide\/?/g) || []).length, 1);
	});

	it('gitignoreAlreadyListsSiteglide matches common spellings', () => {
		assert.equal(gitignoreAlreadyListsSiteglide('.siteglide/\n'), true);
		assert.equal(gitignoreAlreadyListsSiteglide('.siteglide\n'), true);
		assert.equal(gitignoreAlreadyListsSiteglide('node_modules/\n'), false);
	});
});
