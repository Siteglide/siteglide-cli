const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const {
	NPM_ORG_SCOPE,
	MCP_PACKAGE_NAME,
	DEFAULT_PACKAGE,
	pickLatestPublishedVersion,
	getMcpConfigStatus,
	isCliLocalMcpDependency
} = require('../../lib/mcpAlpha');
const { SERVER_NAME } = require('../../lib/ai');

test('pickLatestPublishedVersion prefers dist-tag then highest semver', () => {
	expect(pickLatestPublishedVersion({
		tagVersion: '0.2.0-alpha.1',
		versions: ['0.1.0-alpha.0', '0.2.0-alpha.1'],
		distTags: { alpha: '0.2.0-alpha.1' }
	}, 'alpha')).toEqual('0.2.0-alpha.1');

	expect(pickLatestPublishedVersion({
		tagVersion: null,
		versions: ['0.1.0-alpha.0', '0.2.0-alpha.1'],
		distTags: {}
	}, 'alpha')).toEqual('0.2.0-alpha.1');

	expect(pickLatestPublishedVersion(null, 'alpha')).toEqual(null);
});

test('getMcpConfigStatus reports configured when siteglide server exists', async () => {
	const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'sg-mcp-status-'));
	const cursorPath = path.join(rootPath, '.cursor', 'mcp.json');

	try {
		await fs.ensureDir(path.dirname(cursorPath));
		await fs.writeFile(cursorPath, JSON.stringify({
			mcpServers: {
				[SERVER_NAME]: { command: 'node', args: ['siteglide-cli-mcp.js'] }
			}
		}, null, 2));

		expect(getMcpConfigStatus(rootPath)).toEqual({
			configured: true,
			paths: [cursorPath],
			missing: [
				path.join(rootPath, '.mcp.json'),
				path.join(rootPath, '.vscode', 'mcp.json')
			]
		});
	} finally {
		await fs.remove(rootPath);
	}
});

test('DEFAULT_PACKAGE is scoped npm name: @siteglide org + siteglide-mcp package', () => {
	expect(NPM_ORG_SCOPE).toEqual('@siteglide');
	expect(MCP_PACKAGE_NAME).toEqual('siteglide-mcp');
	expect(DEFAULT_PACKAGE).toEqual('@siteglide/siteglide-mcp');
});

test('isCliLocalMcpDependency detects file: dependency in CLI package.json', () => {
	expect(isCliLocalMcpDependency()).toEqual(true);
});
