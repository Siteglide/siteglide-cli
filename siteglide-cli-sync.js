#!/usr/bin/env node

const program = require('commander'),
	spawn = require('child_process').spawn,
	command = require('./lib/command'),
	fetchAuthData = require('./lib/settings').fetchSettings,
	logger = require('./lib/logger'),
	version = require('./package.json').version;

program
	.version(version, '-v, --version')
	.arguments('[environment]', 'Name of environment. Example: staging')
	.option('-c --config-file <config-file>', 'config file path', '.siteglide-config')
	.action((environment, params) => {
		process.env.CONFIG_FILE_PATH = params.configFile;
		const authData = fetchAuthData(environment, program);
		const env = Object.assign(process.env, {
			SITEGLIDE_EMAIL: authData.email,
			SITEGLIDE_TOKEN: authData.token,
			SITEGLIDE_URL: authData.url
		});
		const p = spawn(command('siteglide-cli-watch'), [], {
			stdio: 'inherit',
			env: env
		});

		p.on('close', code => {
			if (code === 1) logger.Error('Sync failed. Please check that you have the correct permissions or that your site is not locked.', {
				exit: false
			});
		});

		p.on('error', logger.Error);
	});

program.parse(process.argv);
