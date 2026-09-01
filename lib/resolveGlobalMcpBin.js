const fs = require('fs');
const path = require('path');
const { runNpmSync } = require('./runNpm');

const MCP_PACKAGE_SCOPE = '@siteglide';
const MCP_PACKAGE_NAME = 'siteglide-mcp';
const MCP_PACKAGE = `${MCP_PACKAGE_SCOPE}/${MCP_PACKAGE_NAME}`;
const MCP_BIN_REL = path.join(MCP_PACKAGE_SCOPE, MCP_PACKAGE_NAME, 'bin', 'siteglide-mcp.js');

const tryBin = (candidate) => {
	return candidate && fs.existsSync(candidate) ? candidate : null;
};

const binBesideMainEntry = (mainPath) => path.join(path.dirname(mainPath), '..', 'bin', 'siteglide-mcp.js');

/**
 * Resolve the Siteglide MCP launcher script on disk.
 *
 * Fallback order:
 * 1. require.resolve (local dep, NODE_PATH, sibling global install)
 * 2. node_modules beside process.execPath (default Node installer layout)
 * 3. npm root -g (same source of truth as npm list -g / nvm / custom prefix)
 *
 * @param {{
 *   fs?: Pick<typeof fs, 'existsSync'>,
 *   resolveModule?: (name: string) => string,
 *   runNpm?: (args: string[]) => string,
 *   execPath?: string
 * }} [deps] - Injectable for tests.
 * @returns {string | null}
 */
const resolveGlobalMcpBin = (deps = {}) => {
	const fsImpl = deps.fs || fs;
	const resolveModule = deps.resolveModule || ((name) => require.resolve(name));
	const runNpm = deps.runNpm || ((args) => runNpmSync(args));
	const nodeExecPath = deps.execPath || process.execPath;

	const tryBinImpl = (candidate) => {
		return candidate && fsImpl.existsSync(candidate) ? candidate : null;
	};

	try {
		const main = resolveModule(MCP_PACKAGE);
		const hit = tryBinImpl(binBesideMainEntry(main));
		if (hit) {
			return hit;
		}
	} catch {
		/* continue */
	}

	const besideNode = path.join(path.dirname(nodeExecPath), 'node_modules', MCP_BIN_REL);
	const hitBesideNode = tryBinImpl(besideNode);
	if (hitBesideNode) {
		return hitBesideNode;
	}

	try {
		const root = runNpm(['root', '-g']).trim();
		const hitGlobal = tryBinImpl(path.join(root, MCP_BIN_REL));
		if (hitGlobal) {
			return hitGlobal;
		}
	} catch {
		/* continue */
	}

	return null;
};

module.exports = {
	MCP_PACKAGE,
	MCP_BIN_REL,
	resolveGlobalMcpBin
};
