#!/usr/bin/env node

const path = require('path');
const program = require('commander');
const version = require('./package.json').version;
const logger = require('./lib/logger');
const { run, initConfig, updateDocs } = require('./lib/check');

function collect(value, previous) {
	return previous.concat([value]);
}

program
	.version(version, '-v, --version')
	.name('siteglide-cli check')
	.usage('[path] [options]')
	.description('Check Liquid code quality with platformos-check linter')
	.arguments('[path]')
	.option('--init', 'initialize .platformos-check.yml configuration file')
	.option('--update-docs', 'download the latest platformOS Liquid documentation used by the linter')
	.option('-a', 'enable automatic fixing')
	.option('-c, --check <name>', 'only show offenses from the named check (repeatable)', collect, [])
	.option('-f <format>', 'output format: text or json', 'text')
	.option('-s, --silent', 'only show errors, no success messages')
	.action(async (checkPath, options) => {
		const absolutePath = path.resolve(checkPath || process.cwd());
		const hasInit = !!options.init;
		const hasUpdateDocs = !!options.updateDocs;
		const hasLintFlags = !!options.a || (options.check && options.check.length > 0) ||
			(options.f && options.f !== 'text') || !!options.silent;

		if (hasInit && hasUpdateDocs) {
			logger.Error('Cannot combine --init and --update-docs.');
			return;
		}

		if (hasInit && hasLintFlags) {
			logger.Error('Cannot combine --init with lint options (-a, -c, -f, -s).');
			return;
		}

		if (hasUpdateDocs && hasLintFlags) {
			logger.Error('Cannot combine --update-docs with lint options (-a, -c, -f, -s).');
			return;
		}

		if (hasInit) {
			await initConfig(absolutePath);
			return;
		}

		if (hasUpdateDocs) {
			await updateDocs();
			return;
		}

		await run({
			path: absolutePath,
			autoFix: options.a || false,
			checks: options.check.length > 0 ? options.check : undefined,
			format: options.f || 'text',
			silent: options.silent || false
		});
	});

program.parse(process.argv);
