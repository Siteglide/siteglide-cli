const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
	ensureSiteglideSkillsNamespaceLink,
	migrateFullSkillsTreeSymlinkIfPresent
} = require('../../lib/agentSkillsNamespaceLink');

describe('migrateFullSkillsTreeSymlinkIfPresent', () => {
	let cwd;

	beforeEach(() => {
		cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-ns-link-'));
	});

	afterEach(() => {
		fs.rmSync(cwd, { recursive: true, force: true });
	});

	it('replaces a legacy whole-tree skills symlink with a real directory', async () => {
		const agentsSkills = path.join(cwd, '.agents', 'skills');
		const cursorSkills = path.join(cwd, '.cursor', 'skills');
		fs.mkdirSync(agentsSkills, { recursive: true });
		fs.mkdirSync(path.dirname(cursorSkills), { recursive: true });
		fs.symlinkSync(agentsSkills, cursorSkills, 'junction');

		await migrateFullSkillsTreeSymlinkIfPresent(
			path.join(cwd, '.cursor', 'skills'),
			path.join(cwd, '.agents', 'skills')
		);

		const stat = fs.lstatSync(cursorSkills);
		assert.equal(stat.isSymbolicLink(), false);
		assert.equal(stat.isDirectory(), true);
	});
});

describe('ensureSiteglideSkillsNamespaceLink', () => {
	let cwd;

	beforeEach(() => {
		cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-ns-link-'));
	});

	afterEach(() => {
		fs.rmSync(cwd, { recursive: true, force: true });
	});

	it('links only siteglide and leaves room for other skills', async () => {
		const agentsSiteglide = path.join(cwd, '.agents', 'skills', 'siteglide', 'studio', 'demo');
		const cursorSkills = path.join(cwd, '.cursor', 'skills');
		fs.mkdirSync(agentsSiteglide, { recursive: true });
		fs.writeFileSync(path.join(agentsSiteglide, 'SKILL.md'), '# demo\n', 'utf8');
		fs.mkdirSync(path.join(cursorSkills, 'my-local-skill'), { recursive: true });
		fs.writeFileSync(path.join(cursorSkills, 'my-local-skill', 'SKILL.md'), '# mine\n', 'utf8');

		await ensureSiteglideSkillsNamespaceLink({
			agentSkillsDir: path.join(cwd, '.cursor', 'skills'),
			agentsSkillsRoot: path.join(cwd, '.agents', 'skills')
		});

		assert.equal(fs.existsSync(path.join(cursorSkills, 'my-local-skill', 'SKILL.md')), true);
		const nsStat = fs.lstatSync(path.join(cursorSkills, 'siteglide'));
		assert.equal(nsStat.isSymbolicLink(), true);
		assert.equal(
			fs.readFileSync(path.join(cursorSkills, 'siteglide', 'studio', 'demo', 'SKILL.md'), 'utf8'),
			'# demo\n'
		);
	});

	it('migrates from a legacy whole-tree symlink', async () => {
		const agentsSkills = path.join(cwd, '.agents', 'skills');
		const cursorSkills = path.join(cwd, '.cursor', 'skills');
		fs.mkdirSync(path.join(agentsSkills, 'siteglide', 'system', 'search-docs'), { recursive: true });
		fs.writeFileSync(
			path.join(agentsSkills, 'siteglide', 'system', 'search-docs', 'SKILL.md'),
			'# search\n',
			'utf8'
		);
		fs.mkdirSync(path.dirname(cursorSkills), { recursive: true });
		fs.symlinkSync(agentsSkills, cursorSkills, 'junction');

		await ensureSiteglideSkillsNamespaceLink({
			agentSkillsDir: path.join(cwd, '.cursor', 'skills'),
			agentsSkillsRoot: path.join(cwd, '.agents', 'skills')
		});

		assert.equal(fs.lstatSync(cursorSkills).isSymbolicLink(), false);
		assert.equal(
			fs.readFileSync(
				path.join(cursorSkills, 'siteglide', 'system', 'search-docs', 'SKILL.md'),
				'utf8'
			),
			'# search\n'
		);
	});
});
