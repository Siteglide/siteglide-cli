const { runCli } = require('../helpers/runCli');

test('should return error for missing command on stdout', () => {
	const command = runCli('siteglide-cli.js', ['missing']);
	expect(command.code).toEqual(1);
	expect(command.output).toMatch(/unknown command.*missing/i);
});

test('should run help on add', () => {
	const command = runCli('siteglide-cli.js', ['add', '--help']);
	expect(command.code).toEqual(0);
	expect(command.output).toMatch(/Usage: siteglide-cli add/);
});

test('should run help on sync', () => {
	const command = runCli('siteglide-cli.js', ['sync', '--help']);
	expect(command.code).toEqual(0);
	expect(command.output).toMatch(/Usage: siteglide-cli sync/);
});
