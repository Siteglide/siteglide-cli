#!/usr/bin/env node

const program = require('commander'),
	fetchAuthData = require('./lib/settings').fetchSettings,
	logger = require('./lib/logger'),
	server = require('./siteglide-cli-server'),
	{ openInSystemBrowser } = require('./lib/openInSystemBrowser'),
	version = require('./package.json').version;

program
	.version(version, '-v, --version')
	.name('siteglide-cli gui')
	.usage('<env> [options]')
	.description('Open the local Admin GUI (Logs, Database, Constants, GraphiQL, Liquid Evaluator).')
	.arguments('[environment]', 'name of environment. Example: staging')
	.option('-c --config-file <config-file>', 'config file path', '.siteglide-config')
	.option('-p --port <port>', 'port number', '3333')
	.option(
		'-o, --open',
		'open the homepage in your system default browser (preferred over IDE in-editor browsers)'
	)
	.action(async (environment, params) => {
		process.env.CONFIG_FILE_PATH = params.configFile;
		const authData = fetchAuthData(environment, program);

		Object.assign(process.env, {
			SITEGLIDE_TOKEN: authData.token,
			SITEGLIDE_URL: authData.url,
			SITEGLIDE_EMAIL: authData.email,
			PORT: params.port,
			SITEGLIDE_GUI_OPEN: params.open ? '1' : ''
		});

		try {
			await server.start(process.env, 'gui');
			if (params.open) {
				setTimeout(async function () {
					const result = await openInSystemBrowser(`http://localhost:${params.port}/`);
					if (!result.ok) {
						logger.Warn(
							`[gui] Could not open system browser automatically: ${result.error}. Open http://localhost:${params.port}/ manually.`,
							{ exit: false }
						);
					}
				}, 1000);
			}
		} catch (e) {
			logger.Error('GUI failed. Please check that you have the correct permissions and your site is not locked or creating.');
		}
	});

program.parse(process.argv);
