const path = require('path');
const { MCP_BIN_REL, resolveGlobalMcpBin } = require('../../lib/resolveGlobalMcpBin');

test('resolveGlobalMcpBin uses require.resolve when bin exists beside main entry', () => {
	const main = '/global/node_modules/@siteglide/siteglide-mcp/dist/index.js';
	const expectedBin = path.join('/global/node_modules/@siteglide/siteglide-mcp/bin', 'siteglide-mcp.js');

	const bin = resolveGlobalMcpBin({
		resolveModule: () => main,
		fs: {
			existsSync: (candidate) => candidate === expectedBin
		},
		runNpm: () => {
			throw new Error('npm root should not be called');
		},
		execPath: '/usr/bin/node'
	});

	expect(bin).toEqual(expectedBin);
});

test('resolveGlobalMcpBin falls back to npm root -g when require.resolve fails', () => {
	const npmRoot = path.join('C:', 'npm', 'root');
	const expectedBin = path.join(npmRoot, MCP_BIN_REL);

	const bin = resolveGlobalMcpBin({
		resolveModule: () => {
			throw new Error('MODULE_NOT_FOUND');
		},
		fs: {
			existsSync: (candidate) => candidate === expectedBin
		},
		runNpm: (args) => {
			expect(args).toEqual(['root', '-g']);
			return npmRoot;
		},
		execPath: path.join('C:', 'nodejs', 'node.exe')
	});

	expect(bin).toEqual(expectedBin);
});

test('resolveGlobalMcpBin falls back to node_modules beside process.execPath', () => {
	const nodeDir = path.join('C:', 'nodejs');
	const expectedBin = path.join(nodeDir, 'node_modules', MCP_BIN_REL);

	const bin = resolveGlobalMcpBin({
		resolveModule: () => {
			throw new Error('MODULE_NOT_FOUND');
		},
		fs: {
			existsSync: (candidate) => candidate === expectedBin
		},
		runNpm: () => {
			throw new Error('npm root should not be called');
		},
		execPath: path.join(nodeDir, 'node.exe')
	});

	expect(bin).toEqual(expectedBin);
});

test('resolveGlobalMcpBin returns null when all resolution paths miss', () => {
	expect(resolveGlobalMcpBin({
		resolveModule: () => {
			throw new Error('MODULE_NOT_FOUND');
		},
		fs: {
			existsSync: () => false
		},
		runNpm: () => {
			throw new Error('npm failed');
		},
		execPath: path.join('C:', 'nodejs', 'node.exe')
	})).toEqual(null);
});
