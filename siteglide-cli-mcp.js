#!/usr/bin/env node
process.noDeprecation = true;

/**
 * Thin launcher for Siteglide MCP (stdio). stdout is reserved for MCP JSON-RPC.
 */
const { spawn } = require('child_process');
const { resolveGlobalMcpBin } = require('./lib/resolveGlobalMcpBin');

const bin = resolveGlobalMcpBin();
if (!bin) {
	console.error(
		'AI: @siteglide/siteglide-mcp is not installed globally.\n' +
			'Run siteglide-cli pull and accept the MCP install prompt,\n' +
			'or run: npm install -g @siteglide/siteglide-mcp@latest'
	);
	process.exit(1);
}

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
