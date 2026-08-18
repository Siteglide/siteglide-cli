const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const { removeMcpIdeArtifacts } = require('../helpers/mcpIdeArtifacts');

const mockFetch = jest.fn();
const mockProbeGithubMcpRepo = jest.fn();
const mockAttemptGithubMcpInstall = jest.fn();
const mockConfirm = jest.fn();
const mockEnsureMcpRegistered = jest.fn();
const mockEnsureMcpIdeRules = jest.fn();

jest.mock('node-fetch', () => mockFetch);
jest.mock('../../lib/mcpGithub', () => ({
	probeGithubMcpRepo: (...args) => mockProbeGithubMcpRepo(...args),
	attemptGithubMcpInstall: (...args) => mockAttemptGithubMcpInstall(...args)
}));
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
const { ensureMcpOnPull } = require('../../lib/mcpAlpha');

beforeEach(() => {
	mockFetch.mockReset();
	mockProbeGithubMcpRepo.mockReset();
	mockAttemptGithubMcpInstall.mockReset();
	mockConfirm.mockReset();
	mockEnsureMcpRegistered.mockReset();
	mockEnsureMcpIdeRules.mockReset();
	jest.spyOn(logger, 'Warn').mockImplementation(() => {});
	jest.spyOn(logger, 'Info').mockImplementation(() => {});
	jest.spyOn(logger, 'Debug').mockImplementation(() => {});
	mockEnsureMcpRegistered.mockResolvedValue({ updated: [] });
	mockEnsureMcpIdeRules.mockResolvedValue({ updated: [] });
});

afterEach(() => {
	jest.restoreAllMocks();
});

test('ensureMcpOnPull silently skips when npm and GitHub are unavailable', async () => {
	const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'sg-mcp-fallback-'));
	const cliRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sg-mcp-cli-'));

	try {
		mockFetch.mockResolvedValue({
			status: 404,
			ok: false
		});
		mockProbeGithubMcpRepo.mockResolvedValue({
			accessible: false,
			branches: []
		});

		const result = await ensureMcpOnPull({
			rootPath,
			cliRoot,
			interactive: true
		});

		expect(result).toEqual({
			skipped: true,
			reason: 'no-install-source',
			installedVersion: null,
			latestVersion: null
		});
		expect(logger.Warn).not.toHaveBeenCalled();
		expect(mockAttemptGithubMcpInstall).not.toHaveBeenCalled();
	} finally {
		await removeMcpIdeArtifacts(rootPath);
		await fs.remove(rootPath);
		await fs.remove(cliRoot);
	}
});

test('ensureMcpOnPull does not warn about npm when GitHub install is declined', async () => {
	const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'sg-mcp-fallback-'));
	const cliRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sg-mcp-cli-'));

	try {
		mockFetch.mockResolvedValue({
			status: 404,
			ok: false
		});
		mockProbeGithubMcpRepo.mockResolvedValue({
			accessible: true,
			branches: ['main']
		});
		mockAttemptGithubMcpInstall.mockResolvedValue({
			attempted: true,
			installed: false,
			branch: null
		});

		const result = await ensureMcpOnPull({
			rootPath,
			cliRoot,
			interactive: true
		});

		expect(result).toEqual({
			skipped: true,
			reason: 'mcp-not-installed',
			installedVersion: null,
			latestVersion: null
		});
		expect(mockAttemptGithubMcpInstall).toHaveBeenCalled();
		expect(logger.Warn).not.toHaveBeenCalledWith(
			expect.stringMatching(/coming soon|not published on npm/i),
			expect.anything()
		);
	} finally {
		await removeMcpIdeArtifacts(rootPath);
		await fs.remove(rootPath);
		await fs.remove(cliRoot);
	}
});
