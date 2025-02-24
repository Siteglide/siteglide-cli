#!/usr/bin/env node

const program = require('commander'),
	updateNotifier = require('update-notifier'),
	pkg = require('./package.json'),
	logger = require('./lib/logger'),
	chalk = require('chalk'),
	version = 'Siteglide CLI v' + pkg.version;

updateNotifier({
	pkg: pkg
}).notify({
	isGlobal: true,
	defer: false,
	message: 'Update available ' +
	chalk.dim('{currentVersion}') +
	chalk.reset(' → ') +
	chalk.green('{latestVersion}') +
	' \nRun ' + chalk.cyan('{updateCommand}') + ' to update' +
	' \nChangelog: https://developers.siteglide.com/cli-changelog'
});

program
	.version(version, '-v, --version')
	.command('add [environment] --email [email] --url [url]', 'Add a site or environment')
	.command('list', 'List your current environments for the site')
	.command('sync [environment]', 'update site on local file change')
	.command('pull [environment]', 'get all files from site')
	.command('gui [environment]', 'gui for GraphiQL and Liquid Evaluator')
	.command('logs [environment]', 'stream debugging logs from your website')
	.command('init', 'create default folder structure for Siteglide Admin')
	.command('deploy [environment]', 'upload all code to your site')
	.command('export [environment]', 'export the code, assets and data from your site')
	.command('migrate [environment] --url [url]', 'Static site migration into siteglide')
	.command('modules [environment]', 'list modules installed on the site')
	.command('sitebuilder', 'Setup Wizard for Tailwind, e.g. Tailwind')
	// .command('import [environment]', 'import your data.json to bulk upload all data')
	.parse(process.argv);

var commandList = [];
program.commands.map(command => commandList.push(command._name));

if (!commandList.includes(program.args[0])) {
	logger.Error(`unknown command: ${program.args[0]}`, {
		exit: false
	});
	program.help();
	process.exit(1);
}

if (!program.args.length) program.help();
