#!/usr/bin/env node

const program = require('commander'),
	updateNotifier = require('update-notifier'),
	pkg = require('./package.json'),
	logger = require('./lib/logger'),
	version = 'Siteglide CLI v' + pkg.version;

updateNotifier({
	pkg: pkg
}).notify({
	defer: true,
	isGlobal: true
});

program
	.version(version)
	.command('add [environment] --email [email] --url [url]', 'Add a site or environment')
	.command('sync [environment]', 'update site on local file change')
	.command('pull [environment]', 'get all files from site')
	.command('init', 'create default folder structure for Siteglide Admin')
	.parse(process.argv);

const commandList = Object.keys(program._execs);
if (!commandList.includes(program.args[0])) {
	logger.Error(`unknown command: ${program.args[0]}`, {
		exit: false
	});
	program.help();
	process.exit(1);
}

if (!program.args.length) program.help();