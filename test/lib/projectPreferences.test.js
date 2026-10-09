const fs = require('fs');
const os = require('os');
const path = require('path');
const {
	ensureProjectPreferences,
	readProjectPreferences,
	projectPreferencesPath
} = require('../../lib/projectPreferences');

describe('projectPreferences', () => {
	let parentDir;
	let cwd;

	beforeEach(() => {
		parentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-prefs-'));
		cwd = path.join(parentDir, 'project');
		fs.mkdirSync(cwd, { recursive: true });
	});

	afterEach(() => {
		fs.rmSync(parentDir, { recursive: true, force: true });
	});

	test('creates null defaults and does not clobber filled values', () => {
		ensureProjectPreferences(cwd);
		const first = readProjectPreferences(cwd);
		expect(first.target_audience).toEqual({
			role: null,
			git: null,
			siteglideCli: null
		});
		fs.writeFileSync(
			projectPreferencesPath(cwd),
			JSON.stringify({
				target_audience: { role: 'designer', git: 'beginner', siteglideCli: null }
			}, null, 2),
			'utf8'
		);
		ensureProjectPreferences(cwd);
		const second = readProjectPreferences(cwd);
		expect(second.target_audience.role).toBe('designer');
		expect(second.target_audience.git).toBe('extra help');
		expect(second.target_audience.siteglideCli).toBe(null);
	});

	test('stores file under parent .siteglide/user/about-me.json', () => {
		ensureProjectPreferences(cwd);
		expect(projectPreferencesPath(cwd)).toBe(
			path.join(parentDir, '.siteglide', 'user', 'about-me.json')
		);
	});

	test('migrates legacy project-level about-me.json on read', () => {
		const legacyPath = path.join(cwd, '.siteglide', 'user', 'about-me.json');
		fs.mkdirSync(path.dirname(legacyPath), { recursive: true });
		fs.writeFileSync(
			legacyPath,
			JSON.stringify({
				target_audience: { role: 'tester', git: 'beginner', siteglideCli: 'advanced' }
			}, null, 2),
			'utf8'
		);
		const prefs = readProjectPreferences(cwd);
		expect(prefs.target_audience.role).toBe('tester');
		expect(prefs.target_audience.git).toBe('extra help');
		expect(prefs.target_audience.siteglideCli).toBe('familiar');
		expect(fs.existsSync(legacyPath)).toBe(false);
		expect(fs.existsSync(projectPreferencesPath(cwd))).toBe(true);
	});
});
