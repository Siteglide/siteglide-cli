#!/usr/bin/env node

const program = require('commander'),
	fetchAuthData = require('./lib/settings').fetchSettings,
	logger = require('./lib/logger'),
	open = require('open'),
	server = require('./siteglide-cli-server'),
	version = require('./package.json').version;

program
	.version(version, '-v, --version')
	.arguments('[environment]', 'name of environment. Example: staging')
	.option('-c --config-file <config-file>', 'config file path', '.siteglide-config')
	.option('-p --port <port>', 'use PORT', '3333')
	.option('-o, --open', 'when ready, open default browser')
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
			await server.start(process.env);
			if(params.open){
				await open(`http://localhost:${params.port}/gui/graphql`);
			}
		} catch (e) {
			logger.Error('GraphQL failed. Please check that you have the correct permissions or that your site is not locked.');
		}
	});

program.parse(process.argv);