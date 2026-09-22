const { runCli } = require('../helpers/runCli');

const ROUTER_HELP_COMMANDS = [
	['siteglide-cli.js', ['--version'], /Siteglide CLI v/],
	['siteglide-cli.js', ['--help'], /Commands:/],
	['siteglide-cli.js', ['add', '--help'], /Usage: siteglide-cli add/],
	['siteglide-cli.js', ['list', '--help'], /Usage: siteglide-cli list/],
	['siteglide-cli.js', ['sync', '--help'], /Usage: siteglide-cli sync/],
	['siteglide-cli.js', ['pull', '--help'], /Usage: siteglide-cli pull/],
	['siteglide-cli.js', ['deploy', '--help'], /Usage: siteglide-cli deploy/],
	['siteglide-cli.js', ['init', '--help'], /Usage: siteglide-cli init/],
	['siteglide-cli.js', ['check', '--help'], /Usage: siteglide-cli check/],
	['siteglide-cli.js', ['gui', '--help'], /Usage: siteglide-cli gui/],
	['siteglide-cli.js', ['logs', '--help'], /Usage: siteglide-cli logs/],
	['siteglide-cli.js', ['modules', '--help'], /Usage: siteglide-cli modules/],
	['siteglide-cli.js', ['export', '--help'], /Usage: siteglide-cli export/]
];

const BIN_HELP = [
	['siteglide-cli-add.js', /Usage: siteglide-cli add/],
	['siteglide-cli-list.js', /Usage: siteglide-cli list/],
	['siteglide-cli-sync.js', /Usage: siteglide-cli sync/],
	['siteglide-cli-pull.js', /Usage: siteglide-cli pull/],
	['siteglide-cli-deploy.js', /Usage: siteglide-cli deploy/],
	['siteglide-cli-init.js', /Usage: siteglide-cli init/],
	['siteglide-cli-check.js', /Usage: siteglide-cli check/],
	['siteglide-cli-gui.js', /Usage: siteglide-cli gui/],
	['siteglide-cli-logs.js', /Usage: siteglide-cli logs/],
	['siteglide-cli-modules.js', /Usage: siteglide-cli modules/],
	['siteglide-cli-export.js', /Usage: siteglide-cli export/],
	['siteglide-cli-archive.js', /Usage: siteglide-cli-archive/],
	['siteglide-cli-import.js', /Usage: siteglide-cli-import/],
	['siteglide-cli-push.js', /Usage: siteglide-cli-push/],
	['siteglide-cli-watch.js', /Usage: siteglide-cli-watch/]
];

test('router reports unknown commands', () => {
	const result = runCli('siteglide-cli.js', ['missing']);
	expect(result.code).toEqual(1);
	expect(result.output).toMatch(/unknown command.*missing/i);
});

test('router help lists mcp command', () => {
	const result = runCli('siteglide-cli.js', ['--help']);
	expect(result.code).toEqual(0);
	expect(result.output).toMatch(/mcp/);
});

describe.each(ROUTER_HELP_COMMANDS)('router help: %s %j', (entry, args, pattern) => {
	test('prints usage', () => {
		const result = runCli(entry, args);
		expect(result.code).toEqual(0);
		expect(result.output).toMatch(pattern);
	});
});

describe.each(BIN_HELP)('bin help: %s', (entry, pattern) => {
	test('prints usage', () => {
		const result = runCli(entry, ['--help']);
		expect(result.code).toEqual(0);
		expect(result.output).toMatch(pattern);
	});
});

test('pull help documents -s / --skip-remote-check', () => {
	const result = runCli('siteglide-cli-pull.js', ['--help']);
	expect(result.code).toEqual(0);
	expect(result.output).toMatch(/-s, --skip-remote-check/);
});

test('sync help documents -s / --skip-remote-check', () => {
	const result = runCli('siteglide-cli-sync.js', ['--help']);
	expect(result.code).toEqual(0);
	expect(result.output).toMatch(/-s, --skip-remote-check/);
});

test('deploy source documents -s / --skip-remote-check option', () => {
	const fs = require('fs');
	const path = require('path');
	const deploySource = fs.readFileSync(
		path.join(__dirname, '../../siteglide-cli-deploy.js'),
		'utf8'
	);
	expect(deploySource).toMatch(/\.option\('-s, --skip-remote-check'/);
});
