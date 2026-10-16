#!/usr/bin/env node
process.noDeprecation = true;

require('./lib/fatalError').installFatalErrorHandlers('[Sync] Sync stopped because of an unexpected error');

const program = require('commander'),
	spawn = require('child_process').spawn,
	command = require('./lib/command'),
	fetchAuthData = require('./lib/settings').fetchSettings,
	logger = require('./lib/logger'),
	{ addDebugOption, applyDebugFlag, shouldPassDebugToChild, DEBUG_CLI_FLAG } = require('./lib/cliDebug'),
	{ assertNotOnTemporaryBranch } = require('./lib/git/homeBranch'),
	{ unreportedChildExitMessage } = require('./lib/fatalError'),
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
	.option(
		'-fast, --fast',
		'Merge-first sync: selective pull for conflict paths only (not full site zip)'
	)
	.option(
		'-compare, --compare',
		'Merge-first sync: full pull then selective for one path; write format compare report under .siteglide/user/selective-pull-compare/'
	);

addDebugOption(program);

program
	.action(async (environment, params) => {
		applyDebugFlag(params);
		assertNotOnTemporaryBranch({ command: 'sync' });
		process.env.CONFIG_FILE_PATH = params.configFile;
		const authData = fetchAuthData(environment, program);
		const { readSourceOfTruthMode, resolveSkipRemoteCheck, MODE_VERSION_CONTROL } = require('./lib/sourceOfTruth');
		const sourceOfTruthMode = await readSourceOfTruthMode(process.cwd());
		const skipRemoteCheck = resolveSkipRemoteCheck({
			cliFlag: Boolean(params.skipRemoteCheck),
			mode: sourceOfTruthMode
		});
		if (
			sourceOfTruthMode === MODE_VERSION_CONTROL
			&& skipRemoteCheck
			&& !params.skipRemoteCheck
		) {
			logger.Quiet('[sync] sourceOfTruth is versionControl — remote conflict checks are skipped (same as -s / --skip-remote-check).');
		}
		const { buildSyncWatchEnv } = require('./lib/syncWatchEnv');
		// Commander 8 maps bare `-compare` to `Compare`; long form + `-compare, --compare` → `compare`.
		const mergeFirstFast = Boolean(params.fast || params.Fast);
		const mergeFirstCompare = Boolean(params.compare || params.Compare);
		if (mergeFirstFast && mergeFirstCompare) {
			logger.Error('[sync] Use only one of -fast or -compare.');
			process.exit(1);
		}
		if (mergeFirstFast) {
			logger.Quiet('[sync] -fast: merge-first will use selective pull for conflict paths only.');
		}
		if (mergeFirstCompare) {
			logger.Quiet('[sync] -compare: merge-first will compare full vs selective pull (one path); see .siteglide/user/selective-pull-compare/.');
		}
		const env = buildSyncWatchEnv({
			processEnv: process.env,
			environment,
			authData,
			skipRemoteCheck,
			mergeFirstFast,
			mergeFirstCompare
		});
		const options = [];
		if(params.livereload){
			options.push('-l');
		}
		if (shouldPassDebugToChild()) {
			options.push(DEBUG_CLI_FLAG);
		}
		const p = spawn(command('siteglide-cli-watch'), options, {
			stdio: 'inherit',
			env,
			directAssetsUpload: true,
			liveReload: params.livereload,
			shell: true
		});
		p.on('error', (err) => {
			logger.Error(`[Sync] Could not start the sync watcher: ${logger.describeError(err)}`);
		});
		p.on('exit', (code, signal) => {
			const unreported = unreportedChildExitMessage('[Sync] Sync', code, signal);
			if (unreported) {
				const rerun = ['siteglide-cli sync', environment, '-debug'].filter(Boolean).join(' ');
				logger.Error(`${unreported} Run ${rerun} for details.`, { exit: false });
			}
			process.exitCode = code === null ? 1 : code;
		});
	});

program.parse(process.argv);
