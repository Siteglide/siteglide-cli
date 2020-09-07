#!/usr/bin/env node

const program = require('commander'),
	updateNotifier = require('update-notifier'),
	pkg = require('./package.json'),
	logger = require('./lib/logger'),
	version = 'Siteglide CLI v' + pkg.version;

updateNotifier({
	pkg: pkg,
	isGlobal: true
}).notify({
	defer: false
});

program
	.version(version, '-v, --version')
	.command('add [environment] --email [email] --url [url]', 'Add a site or environment')
	.command('sync [environment]', 'update site on local file change')
	.command('pull [environment]', 'get all files from site')
	.command('graphql [environment]', 'gui for graphql')
	.command('logs [environment]', 'stream debugging logs from your website')
	.command('init', 'create default folder structure for Siteglide Admin')
	.command('deploy [environment]', 'upload all code to your site')
	.command('export [environment]', 'export the code, assets and data from your site')
	.command('migrate [environment] --url [url]', 'Static site migration into siteglide')
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