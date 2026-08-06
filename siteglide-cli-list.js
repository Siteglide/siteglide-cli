#!/usr/bin/env node

const program = require('commander'),
	logger = require('./lib/logger'),
	files = require('./lib/assets/files'),
	{ listEnvironments } = require('./lib/envClassification'),
	version = require('./package.json').version;

program
	.version(version, '-v, --version')
	.name('siteglide-cli list')
	.usage('[options]')
	.description('List environments from .siteglide-config. Use --details for host and staging/production classification (same rules as MCP envs_list).')
	.option('-d --details', 'include host and classification (staging|production)')
	.option('-c --config-file <config-file>', 'config file path', '.siteglide-config')
	.action((params) => {
		process.env.CONFIG_FILE_PATH = params.configFile;
		const settings = Object(files.getConfig());
		const environments = listEnvironments(settings, { details: params.details });

		if (!environments.length) {
			logger.Error('No environments registered yet, please see siteglide-cli add', { exit: false });
			return;
		}

		logger.Info('Available environments: ');
		for (const env of environments) {
			if (params.details) {
				logger.Info(
					`- [${env.name}] ${env.url}  host=${env.host}  classification=${env.classification}`,
					{ hideTimestamp: true }
				);
			} else {
				logger.Info(`- [${env.name}] ${env.url}`, { hideTimestamp: true });
			}
		}
	});

program.parse(process.argv);
