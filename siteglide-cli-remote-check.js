#!/usr/bin/env node

/**
 * Standalone / deploy-subprocess entry for remote mtime checks.
 * Prefer requiring lib/remoteMtimeCheck from sync (in-process) for performance.
 */

const program = require('commander');
const Gateway = require('./lib/proxy');
const fetchAuthData = require('./lib/settings').fetchSettings;
const version = require('./package.json').version;
const logger = require('./lib/logger');
const {
	checkFile,
	collectDeployPreConflicts,
	collectDeployPostLeftovers
} = require('./lib/remoteMtimeCheck');
const { promptRemoteConflict } = require('./lib/remoteConflictPrompt');
const dir = require('./lib/directories');

program
	.version(version)
	.name('siteglide-cli-remote-check')
	.usage('<environment> [options]')
	.arguments('<environment>')
	.option('-c --config-file <config-file>', 'config file path', '.siteglide-config')
	.option('--mode <mode>', 'file | deploy-pre | deploy-post', 'deploy-pre')
	.option('--path <path>', 'local file path (mode=file)')
	.option('--deployed-at <iso>', 'deploy timestamp (mode=deploy-post)')
	.option('-s, --skip-remote-check', 'Treat as continue')
	.action(async (environment, params) => {
		process.env.CONFIG_FILE_PATH = params.configFile;
		const authData = fetchAuthData(environment, program);
		const gateway = new Gateway(authData);
		const siteRoot = dir.currentApp();

		if (params.mode === 'file') {
			if (!params.path) {
				logger.Error('--path is required for mode=file');
			}
			const result = await checkFile({
				gateway,
				environment,
				filePath: params.path,
				siteRoot
			});
			if (result.ok) {
				process.exit(0);
			}
			const decision = await promptRemoteConflict({
				environment,
				command: 'sync',
				reason: result.reason,
				conflicts: [result],
				skipRemoteCheck: params.skipRemoteCheck
			});
			process.exit(decision === 'continue' ? 0 : decision === 'pause' ? 2 : 1);
		}

		if (params.mode === 'deploy-post') {
			const post = await collectDeployPostLeftovers(
				gateway,
				environment,
				params.deployedAt || new Date().toISOString()
			);
			process.stdout.write(JSON.stringify(post, null, 2) + '\n');
			process.exit(post.leftovers.length ? 1 : 0);
		}

		const pre = await collectDeployPreConflicts(gateway, environment);
		if (pre.ok) {
			process.exit(0);
		}
		const decision = await promptRemoteConflict({
			environment,
			command: 'deploy',
			reason: pre.reason || 'deploy_pre',
			conflicts: pre.conflicts,
			skipRemoteCheck: params.skipRemoteCheck
		});
		process.exit(decision === 'continue' ? 0 : decision === 'pause' || decision === 'merge_first' ? 2 : 1);
	});

program.parse(process.argv);
