const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
	joinUser,
	joinProject,
	migrateLegacySiteglideLayout,
	rel,
	SITEGLIDE_USER_IGNORE_ENTRY
} = require('../../lib/siteglidePaths');

describe('siteglidePaths', () => {
	let cwd;

	beforeEach(() => {
		cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-paths-'));
	});

	afterEach(() => {
		fs.rmSync(cwd, { recursive: true, force: true });
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
		assert.equal(fs.existsSync(legacyConfig), false);
	});

	it('rel paths match module output', () => {
		assert.equal(rel.syncStatusDir, '.siteglide/user/sync');
		assert.equal(rel.pullModulesConfig, '.siteglide/project/modules.json');
		assert.equal(rel.aiAgentPreferences, '.siteglide/user/ai-agent-preferences.json');
		assert.equal(rel.gitignoreUser, '.siteglide/user/');
		assert.equal(rel.gitignoreSecrets, '.siteglide-config');
	});

	it('SITEGLIDE_USER_IGNORE_ENTRY is the documented gitignore path', () => {
		assert.equal(SITEGLIDE_USER_IGNORE_ENTRY, '.siteglide/user/');
	});
});
