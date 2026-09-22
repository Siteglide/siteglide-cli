#!/usr/bin/env node
process.noDeprecation = true;

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
	.option('-s, --skip-remote-check', 'Skip remote mtime checks before each upload')
	.action((environment, params) => {
		process.env.CONFIG_FILE_PATH = params.configFile;
		const authData = fetchAuthData(environment, program);
		const { buildSyncWatchEnv } = require('./lib/syncWatchEnv');
		const env = buildSyncWatchEnv({
			processEnv: process.env,
			authData,
			environment,
			skipRemoteCheck: Boolean(params.skipRemoteCheck)
		});
		const options = [];
		if(params.livereload){
			options.push('-l');
		}
		const p = spawn(command('siteglide-cli-watch'), options, {
			stdio: 'inherit',
			env,
			directAssetsUpload: true,
			liveReload: params.livereload,
			shell: true
		});
		p.on('error', logger.Error);
	});

program.parse(process.argv);
