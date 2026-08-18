const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
	joinIde,
	joinCliSettings,
	migrateLegacySiteglideLayout,
	rel,
	SITEGLIDE_IDE_IGNORE_ENTRY
} = require('../../lib/siteglidePaths');
const { syncCurrentConflictPath } = require('../../lib/syncCurrentConflict');
const { pullBaselineDir } = require('../../lib/pullBaseline');

describe('siteglidePaths', () => {
	let cwd;

	beforeEach(() => {
		cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-paths-'));
	});

	afterEach(() => {
		fs.rmSync(cwd, { recursive: true, force: true });
	});

	it('joinCliSettings keeps modules config outside IDE/', () => {
		assert.equal(
			path.relative(cwd, joinCliSettings(cwd, 'modules.json')),
			path.join('.siteglide', 'cli-settings', 'modules.json')
		);
	});

	it('joinIde writes under .siteglide/IDE/', () => {
		assert.equal(
			path.relative(cwd, joinIde(cwd, 'sync', '1.json')),
			path.join('.siteglide', 'IDE', 'sync', '1.json')
		);
	});

	it('migrateLegacySiteglideLayout moves runtime metadata into IDE/', () => {
		const legacySync = path.join(cwd, '.siteglide', 'sync');
		fs.mkdirSync(legacySync, { recursive: true });
		fs.writeFileSync(path.join(legacySync, '1.json'), '{}');

		migrateLegacySiteglideLayout(cwd);

		assert.equal(fs.existsSync(path.join(cwd, '.siteglide', 'sync', '1.json')), false);
		assert.equal(fs.existsSync(joinIde(cwd, 'sync', '1.json')), true);
	});

	it('migrateLegacySiteglideLayout does not move cli-settings', () => {
		const legacyConfig = path.join(cwd, '.siteglide', 'cli-settings', 'modules.json');
		fs.mkdirSync(path.dirname(legacyConfig), { recursive: true });
		fs.writeFileSync(legacyConfig, '{}');

		migrateLegacySiteglideLayout(cwd);

		assert.equal(fs.existsSync(legacyConfig), true);
		assert.equal(fs.existsSync(joinCliSettings(cwd, 'modules.json')), true);
	});

	it('rel paths match module output', () => {
		assert.equal(syncCurrentConflictPath(cwd), path.join(cwd, rel.syncCurrentConflict));
		assert.equal(pullBaselineDir(cwd), joinIde(cwd, 'pull'));
	});

	it('SITEGLIDE_IDE_IGNORE_ENTRY matches repo .gitignore', () => {
		const gitignore = fs.readFileSync(path.join(__dirname, '../../.gitignore'), 'utf8');
		assert.match(gitignore, new RegExp(SITEGLIDE_IDE_IGNORE_ENTRY.replace('/', '\\/')));
	});
});
