#!/usr/bin/env node

const program = require('commander'),
	spawn = require('child_process').spawn,
	command = require('./lib/command'),
	fetchAuthData = require('./lib/settings').fetchSettings,
	logger = require('./lib/logger'),
	version = require('./package.json').version;

program
	.version(version, '-v, --version')
	.name('siteglide-cli sync')
	.usage('<env> [options]')
	.description('This command will setup a watcher that will automatically sync up files when you hit save in your IDE.')
	.arguments('[environment]', 'Name of environment. Example: staging')
	.option('-c --config-file <config-file>', 'config file path', '.siteglide-config')
	.option('-l, --livereload', 'Turns on a livereload server')
	.action((environment, params) => {
		process.env.CONFIG_FILE_PATH = params.configFile;
		const authData = fetchAuthData(environment, program);
		const env = Object.assign(process.env, {
			SITEGLIDE_EMAIL: authData.email,
			SITEGLIDE_TOKEN: authData.token,
			SITEGLIDE_URL: authData.url
		});
		const options = [];
		if(params.livereload){
			options.push('-l');
		}
		const p = spawn(command('siteglide-cli-watch'), options, {
			stdio: 'inherit',
			env: env,
			directAssetsUpload: true,
			liveReload: params.livereload
		});
		p.on('error', logger.Error);
	});

program.parse(process.argv);
