#!/usr/bin/env node

/**
 * Thin launcher for Siteglide MCP (stdio). stdout is reserved for MCP JSON-RPC.
 */
const path = require('path');
const { spawn } = require('child_process');

function resolveMcpBin() {
	const fs = require('fs');
	try {
		const main = require.resolve('@siteglide/siteglide-mcp');
		const candidate = path.join(path.dirname(main), '..', 'bin', 'siteglide-mcp.js');
		if (fs.existsSync(candidate)) {
			return candidate;
		}
	} catch {
		/* fall through */
	}

	const sibling = path.resolve(__dirname, '..', 'Siteglide-MCP', 'bin', 'siteglide-mcp.js');
	if (fs.existsSync(sibling)) {
		return sibling;
	}

	console.error(
		'[siteglide-cli-mcp] @siteglide/siteglide-mcp is not installed.\n' +
			'Run siteglide-cli pull to install MCP from npm or GitHub when available,\n' +
			'or from the siteglide-cli repo: npm run install:mcp'
	);
	process.exit(1);
}

const bin = resolveMcpBin();
const child = spawn(process.execPath, [bin, ...process.argv.slice(2)], {
	stdio: 'inherit',
	env: process.env
});

child.on('exit', (code, signal) => {
	if (signal) {
		process.kill(process.pid, signal);
	} else {
		process.exit(code ?? 1);
	}
});
