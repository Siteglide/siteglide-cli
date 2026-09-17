const fs = require('fs');
const os = require('os');
const path = require('path');
const {
	ensureProjectPreferences,
	readProjectPreferences,
	projectPreferencesPath
} = require('../../lib/projectPreferences');

describe('projectPreferences', () => {
	let cwd;

	beforeEach(() => {
		cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-prefs-'));
	});

	afterEach(() => {
		fs.rmSync(cwd, { recursive: true, force: true });
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
		expect(second.target_audience.git).toBe('beginner');
		expect(second.target_audience.siteglideCli).toBe(null);
	});

	test('stores file under .siteglide/project/project-preferences.json', () => {
		ensureProjectPreferences(cwd);
		expect(projectPreferencesPath(cwd)).toBe(
			path.join(cwd, '.siteglide', 'project', 'project-preferences.json')
		);
	});
});
