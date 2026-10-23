const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
	joinUser,
	joinProject,
	joinAboutMe,
	joinAiAgentPreferences,
	legacyAboutMePath,
	legacyAiAgentPreferencesPath,
	migrateAboutMeToParent,
	migrateAiAgentPreferencesToParent,
	migrateLegacySiteglideLayout,
	rel,
	SITEGLIDE_USER_IGNORE_ENTRY
} = require('../../lib/siteglidePaths');

describe('siteglidePaths', () => {
	let parentDir;
	let cwd;

	beforeEach(() => {
		parentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-paths-'));
		cwd = path.join(parentDir, 'project');
		fs.mkdirSync(cwd, { recursive: true });
	});

	afterEach(() => {
		fs.rmSync(parentDir, { recursive: true, force: true });
	});

	it('joinProject keeps modules config under project/', () => {
		assert.equal(
			path.relative(cwd, joinProject(cwd, 'modules.json')),
			path.join('.siteglide', 'project', 'modules.json')
		);
	});

	it('joinUser writes under .siteglide/user/', () => {
		assert.equal(
			path.relative(cwd, joinUser(cwd, 'sync', '1.json')),
			path.join('.siteglide', 'user', 'sync', '1.json')
		);
	});

	it('migrateLegacySiteglideLayout moves flat runtime metadata into user/', () => {
		const legacySync = path.join(cwd, '.siteglide', 'sync');
		fs.mkdirSync(legacySync, { recursive: true });
		fs.writeFileSync(path.join(legacySync, '1.json'), '{}');

		migrateLegacySiteglideLayout(cwd);

		assert.equal(fs.existsSync(path.join(cwd, '.siteglide', 'sync', '1.json')), false);
		assert.equal(fs.existsSync(joinUser(cwd, 'sync', '1.json')), true);
	});

	it('migrateLegacySiteglideLayout moves IDE/ and cli-settings/ into user/ and project/', () => {
		const legacyIdeSync = path.join(cwd, '.siteglide', 'IDE', 'sync');
		fs.mkdirSync(legacyIdeSync, { recursive: true });
		fs.writeFileSync(path.join(legacyIdeSync, '2.json'), '{}');

		const legacyConfig = path.join(cwd, '.siteglide', 'cli-settings', 'modules.json');
		fs.mkdirSync(path.dirname(legacyConfig), { recursive: true });
		fs.writeFileSync(legacyConfig, '{}');

		migrateLegacySiteglideLayout(cwd);

		assert.equal(fs.existsSync(joinUser(cwd, 'sync', '2.json')), true);
		assert.equal(fs.existsSync(joinProject(cwd, 'modules.json')), true);
		assert.equal(fs.existsSync(path.join(cwd, '.siteglide', 'IDE', 'sync', '2.json')), false);
		assert.equal(fs.existsSync(legacyConfig), false);
	});

	it('rel paths match module output', () => {
		assert.equal(rel.syncStatusDir, '.siteglide/user/sync');
		assert.equal(rel.syncCurrentConflict, '.siteglide/user/sync/current-conflict.json');
		assert.equal(rel.remoteCheckDir, '.siteglide/user/remote-check');
		assert.equal(rel.pullBaselineDir, '.siteglide/user/pull');
		assert.equal(rel.pullBaseline('staging'), '.siteglide/user/pull/staging.json');
		assert.equal(rel.mergeDir, '.siteglide/user/merge');
		assert.equal(rel.mergeManifest('staging'), '.siteglide/user/merge/staging.json');
		assert.equal(rel.pullModulesConfig, '.siteglide/project/modules.json');
		assert.equal(rel.sourceOfTruthConfig, '.siteglide/project/sourceOfTruth.json');
		assert.equal(rel.aboutMe, '../.siteglide/user/about-me.json');
		assert.equal(rel.aiAgentPreferences, '../.siteglide/user/ai-agent-preferences.json');
		assert.equal(rel.gitignoreUser, '.siteglide/user/');
		assert.equal(rel.gitignoreSecrets, '.siteglide-config');
	});

	it('SITEGLIDE_USER_IGNORE_ENTRY is the documented gitignore path', () => {
		assert.equal(SITEGLIDE_USER_IGNORE_ENTRY, '.siteglide/user/');
	});

	it('joinAboutMe resolves to parent .siteglide/user/about-me.json', () => {
		assert.equal(
			joinAboutMe(cwd),
			path.join(parentDir, '.siteglide', 'user', 'about-me.json')
		);
	});

	it('joinAiAgentPreferences resolves to parent .siteglide/user/ai-agent-preferences.json', () => {
		assert.equal(
			joinAiAgentPreferences(cwd),
			path.join(parentDir, '.siteglide', 'user', 'ai-agent-preferences.json')
		);
	});

	it('migrateAiAgentPreferencesToParent moves legacy project ai-agent-preferences.json to the parent folder', () => {
		const legacyPath = legacyAiAgentPreferencesPath(cwd);
		fs.mkdirSync(path.dirname(legacyPath), { recursive: true });
		fs.writeFileSync(
			legacyPath,
			`${JSON.stringify({ pull_behaviour: { include: ['Cursor'], exclude: ['Windsurf'] } }, null, 2)}\n`,
			'utf8'
		);

		migrateAiAgentPreferencesToParent(cwd);

		const parentPath = path.join(parentDir, '.siteglide', 'user', 'ai-agent-preferences.json');
		assert.equal(fs.existsSync(legacyPath), false);
		assert.equal(fs.existsSync(parentPath), true);
		assert.deepEqual(JSON.parse(fs.readFileSync(parentPath, 'utf8')).pull_behaviour.include, ['Cursor']);
	});

	it('ensureParentSiteglideUserDir creates parent .siteglide/user without a shell cd', () => {
		const { ensureParentSiteglideUserDir, parentSiteglideUserDir } = require('../../lib/siteglidePaths');
		const target = parentSiteglideUserDir(cwd);
		assert.equal(fs.existsSync(target), false);
		ensureParentSiteglideUserDir(cwd);
		assert.equal(fs.existsSync(target), true);
	});

	it('migrateAboutMeToParent moves legacy project about-me.json to the parent folder', () => {
		const legacyPath = legacyAboutMePath(cwd);
		fs.mkdirSync(path.dirname(legacyPath), { recursive: true });
		fs.writeFileSync(
			legacyPath,
			`${JSON.stringify({ target_audience: { role: 'developer', git: 'advanced', siteglideCli: null } }, null, 2)}\n`,
			'utf8'
		);

		migrateAboutMeToParent(cwd);

		const parentPath = path.join(parentDir, '.siteglide', 'user', 'about-me.json');
		assert.equal(fs.existsSync(legacyPath), false);
		assert.equal(fs.existsSync(parentPath), true);
		assert.equal(JSON.parse(fs.readFileSync(parentPath, 'utf8')).target_audience.role, 'developer');
	});
});
