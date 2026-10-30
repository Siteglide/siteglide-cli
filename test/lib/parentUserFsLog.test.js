const fs = require('fs');
const os = require('os');
const path = require('path');
const { ensureDirWithLog } = require('../../lib/parentUserFsLog');

describe('parentUserFsLog', () => {
	let parentDir;

	beforeEach(() => {
		parentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-parent-log-'));
	});

	afterEach(() => {
		fs.rmSync(parentDir, { recursive: true, force: true });
	});

	test('ensureDirWithLog reports created shared folder at Quiet', () => {
		const target = path.join(parentDir, '.siteglide', 'user');
		const logger = require('../../lib/logger');
		const quietSpy = jest.spyOn(logger, 'Quiet').mockImplementation(() => {});

		const result = ensureDirWithLog(target, 'test context');

		expect(result.ok).toBe(true);
		expect(result.created).toBe(true);
		expect(fs.existsSync(target)).toBe(true);
		expect(quietSpy).toHaveBeenCalledWith(
			expect.stringContaining('created shared folder'),
			{ exit: false }
		);

		quietSpy.mockRestore();
	});
});
