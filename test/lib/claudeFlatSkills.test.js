const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
	claudeFlatSkillFileName,
	syncClaudeFlatSkills
} = require('../../lib/claudeFlatSkills');

describe('claudeFlatSkillFileName', () => {
	it('maps a Siteglide skill root to a flat Claude filename', () => {
		assert.equal(
			claudeFlatSkillFileName('skills/siteglide/studio/build-page/SKILL.md'),
			'siteglide_studio_build-page.SKILL.md'
		);
		assert.equal(
			claudeFlatSkillFileName('skills/siteglide/platformOS/search-pos-docs/SKILL.md'),
			'siteglide_platformOS_search-pos-docs.SKILL.md'
		);
	});

	it('returns null for nested SKILL paths and non-skill files', () => {
		assert.equal(
			claudeFlatSkillFileName('skills/siteglide/studio/build-theme/references/foo.md'),
			null
		);
		assert.equal(
			claudeFlatSkillFileName('skills/siteglide/studio/build-theme/SKILL.md'),
			'siteglide_studio_build-theme.SKILL.md'
		);
	});
});

describe('syncClaudeFlatSkills', () => {
	let cwd;

	beforeEach(() => {
		cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-claude-skills-'));
	});

	afterEach(() => {
		fs.rmSync(cwd, { recursive: true, force: true });
	});

	it('writes flat files and removes stale managed skills', async () => {
		const agentsRoot = path.join(cwd, '.agents');
		const claudeSkillsDir = path.join(cwd, '.claude', 'skills');
		fs.mkdirSync(path.join(agentsRoot, 'skills', 'siteglide', 'studio', 'build-page'), { recursive: true });
		fs.writeFileSync(
			path.join(agentsRoot, 'skills', 'siteglide', 'studio', 'build-page', 'SKILL.md'),
			'# build-page\n',
			'utf8'
		);
		fs.mkdirSync(claudeSkillsDir, { recursive: true });
		fs.writeFileSync(
			path.join(claudeSkillsDir, 'siteglide_studio_old-skill.SKILL.md'),
			'# stale\n',
			'utf8'
		);
		fs.writeFileSync(path.join(claudeSkillsDir, 'user-custom.SKILL.md'), '# keep\n', 'utf8');

		const result = await syncClaudeFlatSkills({
			agentsRoot,
			claudeSkillsDir
		});

		assert.deepEqual(result.written, ['siteglide_studio_build-page.SKILL.md']);
		assert.deepEqual(result.removed, ['siteglide_studio_old-skill.SKILL.md']);
		assert.equal(
			fs.readFileSync(path.join(claudeSkillsDir, 'siteglide_studio_build-page.SKILL.md'), 'utf8'),
			'# build-page\n'
		);
		assert.equal(fs.existsSync(path.join(claudeSkillsDir, 'siteglide_studio_old-skill.SKILL.md')), false);
		assert.equal(fs.existsSync(path.join(claudeSkillsDir, 'user-custom.SKILL.md')), true);
	});

	it('replaces a skills directory symlink with real flat files', async () => {
		const agentsRoot = path.join(cwd, '.agents');
		const claudeSkillsDir = path.join(cwd, '.claude', 'skills');
		const agentsSkills = path.join(agentsRoot, 'skills');
		fs.mkdirSync(path.join(agentsSkills, 'siteglide', 'system', 'search-docs'), { recursive: true });
		fs.writeFileSync(
			path.join(agentsSkills, 'siteglide', 'system', 'search-docs', 'SKILL.md'),
			'# search-docs\n',
			'utf8'
		);
		fs.mkdirSync(path.dirname(claudeSkillsDir), { recursive: true });
		fs.symlinkSync(agentsSkills, claudeSkillsDir, 'junction');

		await syncClaudeFlatSkills({ agentsRoot, claudeSkillsDir });

		const linkStat = fs.lstatSync(claudeSkillsDir);
		assert.equal(linkStat.isSymbolicLink(), false);
		assert.equal(
			fs.readFileSync(path.join(claudeSkillsDir, 'siteglide_system_search-docs.SKILL.md'), 'utf8'),
			'# search-docs\n'
		);
	});
});
