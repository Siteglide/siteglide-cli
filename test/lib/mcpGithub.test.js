const {
	GITHUB_MCP_REPO,
	parseLsRemoteBranches,
	buildGithubInstallSpec,
	probeGithubMcpRepo
} = require('../../lib/mcpGithub');

test('parseLsRemoteBranches extracts branch names from git ls-remote output', () => {
	const output = [
		'abc123\trefs/heads/main',
		'def456\trefs/heads/staging-mj',
		'ghi789\trefs/heads/feature/foo'
	].join('\n');

	expect(parseLsRemoteBranches(output)).toEqual([
		'feature/foo',
		'main',
		'staging-mj'
	]);
});

test('buildGithubInstallSpec returns npm github spec', () => {
	expect(buildGithubInstallSpec('main')).toEqual(`github:${GITHUB_MCP_REPO}#main`);
});

test('probeGithubMcpRepo returns branches when git ls-remote succeeds', async () => {
	const result = await probeGithubMcpRepo({
		timeoutMs: 1000,
		execFileAsync: async () => {
			return {
				stdout: 'abc123\trefs/heads/main\ndef456\trefs/heads/dev\n'
			};
		}
	});
	expect(result).toEqual({
		accessible: true,
		branches: ['dev', 'main']
	});
});

test('probeGithubMcpRepo returns not accessible when git ls-remote fails', async () => {
	const result = await probeGithubMcpRepo({
		timeoutMs: 1000,
		execFileAsync: async () => {
			throw new Error('authentication failed');
		}
	});
	expect(result).toEqual({
		accessible: false,
		branches: []
	});
});
