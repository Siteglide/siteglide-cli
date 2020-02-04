#!/usr/bin/env node

const program = require('commander'),
	spawn = require('child_process').spawn,
	fetchAuthData = require('./lib/settings').fetchSettings,
	command = require('./lib/command'),
	logger = require('./lib/logger'),
	version = require('./package.json').version;

program
	.version(version, '-v, --version')
	.arguments('[environment]', 'name of environment. Example: staging')
	.option('-c --config-file <config-file>', 'config file path', '.siteglide-config')
	.option('-p --port <port>', 'use PORT', '3333')
	.action((environment, params) => {
		process.env.CONFIG_FILE_PATH = params.configFile;
		const authData = fetchAuthData(environment, program);

		Object.assign(process.env, {
			SITEGLIDE_TOKEN: authData.token,
			SITEGLIDE_URL: authData.url,
			SITEGLIDE_EMAIL: authData.email,
			PORT: params.port
		});

		const server = spawn(command('siteglide-cli-server'), [], { stdio: 'inherit' });

		server.on('close', code => {
			if (code === 1) logger.Error('GraphQL failed. Please check that you have the correct permissions or that your site is not locked.', {
				exit: false
			});
		});

		server.on('error', logger.Error);
	});

program.parse(process.argv);