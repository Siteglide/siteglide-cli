#!/usr/bin/env node

const program = require('commander'),
	fetchAuthData = require('./lib/settings').fetchSettings,
	logger = require('./lib/logger'),
	open = require('open'),
	server = require('./siteglide-cli-server'),
	version = require('./package.json').version;

program
	.version(version, '-v, --version')
	.name('siteglide-cli gui')
	.usage('<env> [options]')
	.description('This command will open up the GraphiQL editor and/or Liquid Evaluator locally.')
	.arguments('[environment]', 'name of environment. Example: staging')
	.option('-c --config-file <config-file>', 'config file path', '.siteglide-config')
	.option('-p --port <port>', 'port number', '3333')
	.option('-o, --open', 'automatically opens your default browser')
	.action(async (environment, params) => {
		process.env.CONFIG_FILE_PATH = params.configFile;
		const authData = fetchAuthData(environment, program);

		Object.assign(process.env, {
			SITEGLIDE_TOKEN: authData.token,
			SITEGLIDE_URL: authData.url,
			SITEGLIDE_EMAIL: authData.email,
			PORT: params.port
		});

		try {
			await server.start(process.env, 'gui');
			if(params.open){
				setTimeout(async function(){
					await open(`http://localhost:${params.port}/gui/graphql`);
				},1000);
			}
		} catch (e) {
			logger.Error('GUI failed. Please check that you have the correct permissions and your site is not locked or creating.');
		}
	});

program.parse(process.argv);