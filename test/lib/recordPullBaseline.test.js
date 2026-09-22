const fs = require('fs');
const os = require('os');
const path = require('path');
const { recordPullBaselineAfterPull } = require('../../lib/recordPullBaseline');
const { readPullBaseline } = require('../../lib/pullBaseline');

describe('recordPullBaselineAfterPull', () => {
	let cwd;

	beforeEach(() => {
		cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-record-baseline-'));
	});

	afterEach(() => {
		fs.rmSync(cwd, { recursive: true, force: true });
	});

	test('skipRemoteCheck writes timestamp only without lastPullCommit', () => {
		recordPullBaselineAfterPull({
			environment: 'staging',
			skipRemoteCheck: true,
			cwd
		});
		const baseline = readPullBaseline('staging', cwd);
		expect(baseline.environment).toBe('staging');
		expect(baseline.lastPulledAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
		expect(baseline.lastPullCommit).toBeUndefined();
	});
});
