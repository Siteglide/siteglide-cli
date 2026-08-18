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
