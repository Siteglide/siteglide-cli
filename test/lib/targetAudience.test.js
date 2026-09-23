const fs = require('fs');
const os = require('os');
const path = require('path');
const {
	ensureProjectPreferences,
	readProjectPreferences,
	writeProjectPreferences,
	missingAudienceFields,
	needsAudiencePrompt
} = require('../../lib/projectPreferences');
const { promptTargetAudienceIfNeeded } = require('../../lib/targetAudience');

describe('target audience preferences', () => {
	let cwd;

	beforeEach(() => {
		cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-audience-'));
	});

	afterEach(() => {
		fs.rmSync(cwd, { recursive: true, force: true });
	});

	test('missingAudienceFields lists only null keys', () => {
		expect(missingAudienceFields({ role: 'developer', git: null, siteglideCli: 'advanced' })).toEqual([
			'git'
		]);
		expect(needsAudiencePrompt({ role: 'developer', git: 'beginner', siteglideCli: 'advanced' })).toEqual(false);
	});

	test('writeProjectPreferences merges without clobbering existing values', () => {
		writeProjectPreferences(cwd, { role: 'designer', git: 'beginner', siteglideCli: null });
		writeProjectPreferences(cwd, { siteglideCli: 'advanced' });
		expect(readProjectPreferences(cwd).target_audience).toEqual({
			role: 'designer',
			git: 'beginner',
			siteglideCli: 'advanced'
		});
	});

	test('promptTargetAudienceIfNeeded skips when non-interactive', async () => {
		ensureProjectPreferences(cwd);
		const originalIsTTY = process.stdin.isTTY;
		process.stdin.isTTY = false;

		try {
			const result = await promptTargetAudienceIfNeeded(cwd);
			expect(result).toEqual({
				cancelled: false,
				prompted: false,
				audience: { role: null, git: null, siteglideCli: null }
			});
		} finally {
			process.stdin.isTTY = originalIsTTY;
		}
	});

	test('promptTargetAudienceIfNeeded skips when already complete', async () => {
		writeProjectPreferences(cwd, {
			role: 'developer',
			git: 'advanced',
			siteglideCli: 'advanced'
		});
		const originalIsTTY = process.stdin.isTTY;
		process.stdin.isTTY = true;

		try {
			const result = await promptTargetAudienceIfNeeded(cwd);
			expect(result.prompted).toEqual(false);
			expect(result.cancelled).toEqual(false);
			expect(result.audience).toEqual({
				role: 'developer',
				git: 'advanced',
				siteglideCli: 'advanced'
			});
		} finally {
			process.stdin.isTTY = originalIsTTY;
		}
	});
});
