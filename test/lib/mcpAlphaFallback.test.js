const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const { removeMcpIdeArtifacts } = require('../helpers/mcpIdeArtifacts');

const mockFetch = jest.fn();
const mockConfirm = jest.fn();
const mockEnsureMcpRegistered = jest.fn();
const mockEnsureMcpIdeRules = jest.fn();
const mockExecFileSync = jest.fn();
const mockExecFile = jest.fn((cmd, args, opts, cb) => {
	if (typeof opts === 'function') {
		cb = opts;
	}
	cb(null, { stdout: '' });
});

jest.mock('node-fetch', () => mockFetch);
jest.mock('child_process', () => {
	const actual = jest.requireActual('child_process');
	return {
		...actual,
		execFileSync: (...args) => mockExecFileSync(...args),
		execFile: (...args) => mockExecFile(...args)
	};
});
jest.mock('../../lib/confirm', () => (...args) => mockConfirm(...args));
jest.mock('../../lib/ai', () => {
	const actual = jest.requireActual('../../lib/ai');
	return {
		...actual,
		ensureMcpRegistered: (...args) => mockEnsureMcpRegistered(...args),
		ensureMcpIdeRules: (...args) => mockEnsureMcpIdeRules(...args)
	};
});

const logger = require('../../lib/logger');
const {
	DEFAULT_PACKAGE,
	MCP_UPDATE_DECLINED_KEY,
	ensureMcpOnPull
} = require('../../lib/mcpAlpha');

const npmListStdout = (version) => JSON.stringify({
	dependencies: version ? {
		[DEFAULT_PACKAGE]: { version }
	} : {}
});

const mockGlobalMcpVersion = (version) => {
	mockExecFileSync.mockImplementation((cmd, args) => {
		if (Array.isArray(args) && args[0] === 'list' && args[1] === '-g') {
			return npmListStdout(version);
		}
		if (Array.isArray(args) && args[0] === 'install' && args[1] === '-g') {
			return '';
		}
		throw new Error(`Unexpected execFileSync: ${JSON.stringify(args)}`);
	});
};

beforeEach(() => {
	mockFetch.mockReset();
	mockConfirm.mockReset();
	mockEnsureMcpRegistered.mockReset();
	mockEnsureMcpIdeRules.mockReset();
	mockExecFileSync.mockReset();
	mockExecFile.mockClear();
	jest.spyOn(logger, 'Warn').mockImplementation(() => {});
	jest.spyOn(logger, 'Info').mockImplementation(() => {});
	jest.spyOn(logger, 'Debug').mockImplementation(() => {});
	mockEnsureMcpRegistered.mockReturnValue({ added: [], updated: [], unchanged: [], errors: [] });
	mockEnsureMcpIdeRules.mockReturnValue({ written: [] });
});

afterEach(() => {
	jest.restoreAllMocks();
});

test('ensureMcpOnPull warns when npm has no published package and MCP is not installed globally', async () => {
	const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'sg-mcp-fallback-'));

	try {
		mockFetch.mockResolvedValue({
			status: 404,
			ok: false
		});
		mockGlobalMcpVersion(null);

		const result = await ensureMcpOnPull({
			rootPath,
			interactive: true
		});

		expect(result).toEqual({
			skipped: true,
			reason: 'mcp-not-installed',
			installedVersion: null,
			latestVersion: null
		});
		expect(logger.Warn).toHaveBeenCalledWith(
			'[pull] AI: siteglide-mcp is unavailable — IDE registration skipped',
			{ exit: false }
		);
		expect(mockConfirm).not.toHaveBeenCalled();
	} finally {
		await removeMcpIdeArtifacts(rootPath);
		await fs.remove(rootPath);
	}
});

test('ensureMcpOnPull stores reminder when user declines global MCP install', async () => {
	const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'sg-mcp-fallback-'));

	try {
		mockFetch.mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({
				versions: {
					'0.1.0': {}
				},
				'dist-tags': {
					latest: '0.1.0'
				}
			})
		});
		mockGlobalMcpVersion(null);
		mockConfirm.mockResolvedValue('n');

		const result = await ensureMcpOnPull({
			rootPath,
			interactive: true
		});

		expect(result).toEqual({
			skipped: true,
			reason: 'mcp-not-installed',
			installedVersion: null,
			latestVersion: '0.1.0'
		});
		expect(mockConfirm).toHaveBeenCalled();
		const reminders = JSON.parse(await fs.readFile(path.join(rootPath, '.siteglide', 'user', 'reminders.json'), 'utf8'));
		expect(typeof reminders[MCP_UPDATE_DECLINED_KEY]).toEqual('string');
		expect(mockExecFileSync).not.toHaveBeenCalledWith(
			expect.anything(),
			expect.arrayContaining(['install', '-g'])
		);
	} finally {
		await removeMcpIdeArtifacts(rootPath);
		await fs.remove(rootPath);
	}
});

test('ensureMcpOnPull suppresses prompt within 7 days of declining MCP update', async () => {
	const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'sg-mcp-fallback-'));
	const remindersPath = path.join(rootPath, '.siteglide', 'user', 'reminders.json');

	try {
		await fs.ensureDir(path.dirname(remindersPath));
		await fs.writeFile(remindersPath, JSON.stringify({
			[MCP_UPDATE_DECLINED_KEY]: new Date().toISOString()
		}, null, 2));

		mockFetch.mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({
				versions: {
					'0.1.0': {},
					'0.1.1': {}
				},
				'dist-tags': {
					latest: '0.1.1'
				}
			})
		});
		mockGlobalMcpVersion('0.1.0');

		await ensureMcpOnPull({
			rootPath,
			interactive: true
		});

		expect(mockConfirm).not.toHaveBeenCalled();
		expect(logger.Debug).toHaveBeenCalledWith(
			expect.stringMatching(/\[pull\] AI:.*reminder suppressed/i)
		);
	} finally {
		await removeMcpIdeArtifacts(rootPath);
		await fs.remove(rootPath);
	}
});

test('ensureMcpOnPull installs globally when user accepts update', async () => {
	const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'sg-mcp-fallback-'));

	try {
		mockFetch.mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({
				versions: {
					'0.1.0': {},
					'0.1.1': {}
				},
				'dist-tags': {
					latest: '0.1.1'
				}
			})
		});

		let globalVersion = '0.1.0';
		mockExecFileSync.mockImplementation((cmd, args) => {
			if (Array.isArray(args) && args[0] === 'list' && args[1] === '-g') {
				return npmListStdout(globalVersion);
			}
			if (Array.isArray(args) && args[0] === 'install' && args[1] === '-g') {
				globalVersion = '0.1.1';
				return '';
			}
			throw new Error(`Unexpected execFileSync: ${JSON.stringify(args)}`);
		});
		mockExecFile.mockImplementation((cmd, args, opts, cb) => {
			if (typeof opts === 'function') {
				cb = opts;
			}
			if (cmd === process.execPath && Array.isArray(args) && args[0] === '-e') {
				cb(null, { stdout: globalVersion });
				return;
			}
			cb(null, { stdout: '' });
		});

		mockConfirm.mockResolvedValue('Y');

		const result = await ensureMcpOnPull({
			rootPath,
			interactive: true
		});

		expect(result.skipped).toEqual(false);
		expect(result.installedVersion).toEqual('0.1.1');
		expect(mockExecFileSync).toHaveBeenCalledWith(
			expect.anything(),
			['install', '-g', `${DEFAULT_PACKAGE}@0.1.1`],
			expect.any(Object)
		);
	} finally {
		await removeMcpIdeArtifacts(rootPath);
		await fs.remove(rootPath);
	}
});

test('ensureMcpOnPull caps install offer when npm latest exceeds CLI compatible range', async () => {
	const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'sg-mcp-fallback-'));

	try {
		mockFetch.mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({
				versions: {
					'0.1.0': {},
					'0.1.1': {},
					'0.2.0': {}
				},
				'dist-tags': {
					latest: '0.2.0'
				}
			})
		});
		mockGlobalMcpVersion('0.1.0');
		mockConfirm.mockResolvedValue('Y');

		let globalVersion = '0.1.0';
		mockExecFileSync.mockImplementation((cmd, args) => {
			if (Array.isArray(args) && args[0] === 'list' && args[1] === '-g') {
				return npmListStdout(globalVersion);
			}
			if (Array.isArray(args) && args[0] === 'install' && args[1] === '-g') {
				globalVersion = '0.1.1';
				return '';
			}
			throw new Error(`Unexpected execFileSync: ${JSON.stringify(args)}`);
		});
		mockExecFile.mockImplementation((cmd, args, opts, cb) => {
			if (typeof opts === 'function') {
				cb = opts;
			}
			if (cmd === process.execPath && Array.isArray(args) && args[0] === '-e') {
				cb(null, { stdout: globalVersion });
				return;
			}
			cb(null, { stdout: '' });
		});

		const result = await ensureMcpOnPull({
			rootPath,
			interactive: true
		});

		expect(result.latestVersion).toEqual('0.1.1');
		expect(mockExecFileSync).toHaveBeenCalledWith(
			expect.anything(),
			['install', '-g', `${DEFAULT_PACKAGE}@0.1.1`],
			expect.any(Object)
		);
	} finally {
		await removeMcpIdeArtifacts(rootPath);
		await fs.remove(rootPath);
	}
});

test('ensureMcpOnPull warns when globally installed MCP exceeds CLI compatible range', async () => {
	const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'sg-mcp-fallback-'));

	try {
		mockFetch.mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({
				versions: {
					'0.1.0': {},
					'0.1.1': {},
					'0.2.0': {}
				},
				'dist-tags': {
					latest: '0.2.0'
				}
			})
		});

		mockGlobalMcpVersion('0.2.0');
		mockExecFile.mockImplementation((cmd, args, opts, cb) => {
			if (typeof opts === 'function') {
				cb = opts;
			}
			if (cmd === process.execPath && Array.isArray(args) && args[0] === '-e') {
				cb(null, { stdout: '0.2.0' });
				return;
			}
			cb(null, { stdout: '' });
		});

		await ensureMcpOnPull({
			rootPath,
			interactive: true
		});

		expect(logger.Warn).toHaveBeenCalledWith(
			expect.stringMatching(/\[pull\] AI:.*0\.2\.0 is newer than this CLI supports \(\^0\.1\.0-0\)/),
			{ exit: false }
		);
		expect(logger.Warn).toHaveBeenCalledWith(
			expect.stringMatching(/\[pull\] AI:.*npm install -g @siteglide\/siteglide-mcp@0\.1\.1/),
			{ exit: false }
		);
	} finally {
		await removeMcpIdeArtifacts(rootPath);
		await fs.remove(rootPath);
	}
});
