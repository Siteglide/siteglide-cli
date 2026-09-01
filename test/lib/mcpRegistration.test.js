const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const { getMcpConfigStatus } = require('../../lib/mcpAlpha');
const {
	SERVER_NAME,
	ensureMcpRegistered,
	ensureMcpIdeRules,
	resolveMcpScriptPath,
	buildMcpLaunchEntry
} = require('../../lib/ai');
const { mcpIdeArtifactPaths, removeMcpIdeArtifacts } = require('../helpers/mcpIdeArtifacts');

test('ensureMcpRegistered and ensureMcpIdeRules write only under rootPath and cleanup removes artifacts', async () => {
	const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'sg-mcp-reg-'));
	const fakeHome = await fs.mkdtemp(path.join(os.tmpdir(), 'sg-mcp-home-'));
	const cursorPath = path.join(rootPath, '.cursor', 'mcp.json');

	try {
		await fs.ensureDir(path.dirname(cursorPath));
		await fs.writeFile(cursorPath, JSON.stringify({
			mcpServers: {
				other: { command: 'keep-me' },
				[SERVER_NAME]: { command: 'siteglide-cli-mcp' }
			}
		}, null, 2));

		const first = ensureMcpRegistered({ rootPath, homedir: fakeHome });
		expect(first.updated).toContain('Cursor');
		expect(first.added).toContain('Windsurf');
		expect(first.added).toContain('VSCode');
		expect(first.added).toContain('Claude');

		const afterFirst = JSON.parse(await fs.readFile(cursorPath, 'utf8'));
		expect(afterFirst.mcpServers.other).toEqual({ command: 'keep-me' });
		expect(afterFirst.mcpServers[SERVER_NAME].command).toEqual(process.execPath);
		expect(afterFirst.mcpServers[SERVER_NAME].args).toEqual([resolveMcpScriptPath()]);

		const second = ensureMcpRegistered({ rootPath, homedir: fakeHome });
		expect(second.unchanged).toContain('Cursor');
		expect(second.updated.includes('Cursor')).toEqual(false);

		const desired = buildMcpLaunchEntry();
		expect(desired.command).toEqual(process.execPath);
		expect(fs.existsSync(desired.args[0])).toEqual(true);

		expect(getMcpConfigStatus(rootPath).configured).toEqual(true);

		const rules = ensureMcpIdeRules({ rootPath });
		expect(rules.written).toEqual(['Cursor', 'Claude', 'Windsurf', 'Copilot']);

		for (let i = 0; i < mcpIdeArtifactPaths(rootPath).length; i++) {
			expect(await fs.pathExists(mcpIdeArtifactPaths(rootPath)[i])).toEqual(true);
		}

		await removeMcpIdeArtifacts(rootPath);

		for (let i = 0; i < mcpIdeArtifactPaths(rootPath).length; i++) {
			expect(await fs.pathExists(mcpIdeArtifactPaths(rootPath)[i])).toEqual(false);
		}
	} finally {
		await removeMcpIdeArtifacts(rootPath);
		await fs.remove(rootPath);
		await fs.remove(fakeHome);
	}
});

test('ensureMcpRegistered skips excluded agents but still writes included mcp.json files', async () => {
	const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'sg-mcp-gated-'));
	const fakeHome = await fs.mkdtemp(path.join(os.tmpdir(), 'sg-mcp-gated-home-'));
	const enabledSkillAgents = ['Cursor', 'VSCode'];

	try {
		const result = ensureMcpRegistered({ rootPath, homedir: fakeHome, enabledSkillAgents });
		expect(result.added).toEqual(['Cursor', 'VSCode']);
		expect(await fs.pathExists(path.join(rootPath, '.cursor', 'mcp.json'))).toEqual(true);
		expect(await fs.pathExists(path.join(rootPath, '.vscode', 'mcp.json'))).toEqual(true);
		expect(await fs.pathExists(path.join(rootPath, '.mcp.json'))).toEqual(false);

		const rules = ensureMcpIdeRules({ rootPath, enabledSkillAgents });
		expect(rules.written).toEqual(['Cursor']);
		expect(await fs.pathExists(path.join(rootPath, '.claude', 'siteglide-mcp.md'))).toEqual(false);

		expect(getMcpConfigStatus(rootPath, enabledSkillAgents)).toEqual({
			configured: true,
			paths: [
				path.join(rootPath, '.cursor', 'mcp.json'),
				path.join(rootPath, '.vscode', 'mcp.json')
			],
			missing: []
		});
	} finally {
		await removeMcpIdeArtifacts(rootPath);
		await fs.remove(rootPath);
		await fs.remove(fakeHome);
	}
});
