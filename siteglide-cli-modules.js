#!/usr/bin/env node

const program = require('commander'),
	Gateway = require('./lib/proxy'),
	logger = require('./lib/logger'),
	fetchAuthData = require('./lib/settings').fetchSettings,
	version = require('./package.json').version;

program
	.version(version, '-v, --version')
	.name('siteglide-cli modules')
	.usage('<env>')
	.description('View a list of modules installed on the site.')
	.arguments('[environment]', 'name of the environment. Example: staging')
	.option('-c --config-file <config-file>', 'config file path', '.siteglide-config')
	.action(async (environment, params) => {

		process.env.CONFIG_FILE_PATH = params.configFile;
		process.env.WITH_IMAGES = params.withAssets;
		const authData = fetchAuthData(environment, program);
		const gateway = new Gateway(authData);

		gateway.listModules().then(response => {
			if (!response.data || response.data.length === 0) {
				logger.Info('There are no installed modules');
			} else {
				logger.Info('Installed modules:');
				response.data.map(module => {
					logger.Info(`\t- ${module}`, { hideTimestamp: true });
				});
			}
		}).catch(logger.Debug);
	});

program.parse(process.argv);