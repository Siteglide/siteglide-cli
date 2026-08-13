#!/usr/bin/env node

/**
 * Deploy: optional prod commit → remote-mtime pre-check (Merge first / continue) →
 * homepage pre-sync → archive/push → deploy path manifest → post-check clean/dirty.
 */

const program = require('commander'),
	Gateway = require('./lib/proxy'),
	fetchAuthData = require('./lib/settings').fetchSettings,
	spawn = require('child_process').spawn,
	command = require('./lib/command'),
	logger = require('./lib/logger'),
	Confirm = require('./lib/confirm'),
	glob = require('globby'),
	fs = require('fs'),
	path = require('path'),
	getFile = require('./lib/migration/lib/utils/get-file'),
	dir = require('./lib/directories'),
	{ assertExclusiveSiteAppRoot } = require('./lib/migrateAppDirectory'),
	version = require('./package.json').version,
	{ classifyEnvironment } = require('./lib/envClassification'),
	{ collectDeployPreConflicts, collectDeployPostLeftovers } = require('./lib/remoteMtimeCheck'),
	{ promptDeployConfirm } = require('./lib/remoteConflictPrompt'),
	{ replaceDeployManifest, advancePullBaseline, writePullBaseline } = require('./lib/pullBaseline'),
	{ collectDeployManifestPaths } = require('./lib/deployManifestPaths'),
	{ clearConflictLog, writeConflictLog } = require('./lib/remoteCheckConflictLog'),
	{ getGitReadiness } = require('./lib/git/readiness'),
	{ commitAllSafe } = require('./lib/git/commit'),
	{ hasOpenGitConflicts } = require('./lib/git/conflictMarkers'),
	{ mergeFirstDeploy, readMergeManifest } = require('./lib/git/mergeFirst'),
	{ offerMergeConflictAiHelp, offerMergeFirstFailureHelp } = require('./lib/aiPrompts'),
	{ claimCommandLock, registerCommandLockCleanup, nestedCliEnv, logCommandLockRefusal } = require('./lib/commandLock');

const filePathUnixified = filePath => filePath.replace(/\\/g, '/');

const uploadArchive = (env, withImages) => {
	return new Promise((resolve, reject) => {
		const options = withImages ? ['--with-images'] : [];
		const archive = spawn(command('siteglide-cli-archive'), options, {
			stdio: 'inherit',
			shell: true
		});

		archive.on('close', code => {
			if (code === 1) {
				logger.Error('Deploy failed.');
				reject();
			}

			const push = spawn(command('siteglide-cli-push'), [], {
				stdio: 'inherit',
				env,
				shell: true
			});

			push.on('close', exitCode => {
				if (exitCode === 1) {
					logger.Error('Deploy failed. Please check that you have the correct permissions and your site is not locked or creating.');
					reject(false);
				} else if (exitCode === 2) {
					logger.Error('Deploy failed. Your sites codebase is more than 50mb, please check that all asset files are in the assets folder and not in the codebase.');
					reject(false);
				} else if (exitCode === 3) {
					logger.Error('Deploy failed. Your site contains invalid syntax, please check the error report above');
					reject(false);
				} else if (exitCode === 0) {
					resolve(true);
				}
			});
		});
	});
};

const getBody = (filePath, processTemplate) => {
	if (processTemplate) {
		return fs.createReadStream(filePath);
	}
	return fs.createReadStream(filePath);
};

const deploy = async (env, authData, params) => {
	const gateway = new Gateway(authData);
		const siteRoot = dir.getSiteRoot() || null;

	if (siteRoot) {
		let files = await glob(`${siteRoot}/views/pages/**/*.liquid`);

		try {
			for (var i = 0; i < files.length; i++) {
				await getFile.run(files[i], i, params)
					.then(async (file) => {
						if (file.fileContent.includes('is_homepage: true')) {
							let filePath = filePathUnixified(file.filePath);
							const apiPath = filePath.replace(new RegExp(`^${siteRoot}/`), '');
							const formData = {
								path: apiPath,
								marketplace_builder_file_body: getBody(file.filePath, false)
							};
							return gateway.sync(formData);
						}
					})
					.catch((err) => console.log(err));
			}
		} catch (error) {
			console.log(`Error: ${error}`);
		}
	}

	await uploadArchive(env, params.withAssets);
};

program
	.version(version)
	.name('siteglide-cli deploy')
	.usage('<env> [options]')
	.description('If you have made a lot of changes in your codebase, then you can use deploy to re-send all files to your site at once.  Deploy is a single command that will create a .zip  file of your site and then upload that to your website.')
	.arguments('[environment]', 'name of environment. Example: staging')
	.option('-c --config-file <config-file>', 'config file path', '.siteglide-config')
	.option('-w --with-assets', 'With assets, deploys your "assets" folder')
	.option('--skip-remote-check', 'Skip remote mtime conflict checks (CI / intentional overwrite)')
	.action(async (environment, params) => {
		process.env.CONFIG_FILE_PATH = params.configFile;
		process.env.WITH_IMAGES = params.withAssets;

		const lock = claimCommandLock('deploy', { environment });
		if (!lock.ok) {
			logCommandLockRefusal(lock);
		}
		if (!lock.nested) {
			registerCommandLockCleanup();
		}

		if (!params.withAssets) {
			const chalk = require('chalk');
			const { localTimeZoneLabel } = require('./lib/formatLocalDateTime');
			const now = new Date();
			const HHMMSS = now.toTimeString().split(' ')[0];
			const tz = localTimeZoneLabel(now);
			logger.Print(
				chalk.blue(
					`[${HHMMSS} ${tz}] [deploy] Assets like JS and CSS will not be deployed unless you use the -w / --with-assets flag.\n`
				)
			);
		}

		const authData = fetchAuthData(environment, program);
		assertExclusiveSiteAppRoot();

		const open = hasOpenGitConflicts();
		if (open.open) {
			writeConflictLog(environment, {
				command: 'deploy',
				reason: open.reason,
				conflicts: (open.paths || []).map((p) => ({ path: p })),
				consoleHint: 'Resolve conflict markers with AI + MCP before deploy.'
			});
			logger.Error(`[deploy] Refusing deploy while ${open.reason}. Ask AI + MCP to help resolve conflicts first.`);
			process.exit(1);
		}

		// If a prior deploy merge-first finished, promote pull baseline from snapshot.
		const mergeMan = readMergeManifest(environment);
		if (mergeMan && mergeMan.mode === 'deploy_full_pull' && mergeMan.remoteSnapshotAt && !hasOpenGitConflicts().open) {
			writePullBaseline(environment, { lastPulledAt: mergeMan.remoteSnapshotAt });
		}

		const classification = classifyEnvironment(authData);
		const git = getGitReadiness();
		if (classification === 'production' && git.repoInitialized && process.stdin.isTTY && !process.env.CI) {
			const commitFirst = await Confirm('Production deploy: commit your working tree first? (Y/n)\n');
			if (commitFirst === 'Y') {
				const msg = await Confirm('Commit message:\n');
				const committed = commitAllSafe(msg.trim() || `siteglide deploy ${environment} ${new Date().toISOString()}`);
				if (!committed.ok && !/nothing to commit/i.test(committed.stdout + committed.stderr)) {
					logger.Warn(`[deploy] Commit failed: ${committed.stderr || committed.stdout}`, { exit: false });
				}
			}
		}

		const gateway = new Gateway(authData);
		let pre = { ok: true, conflicts: [] };
		if (!params.skipRemoteCheck) {
			pre = await collectDeployPreConflicts(gateway, environment);
		}

		let decision = await promptDeployConfirm({
			environment,
			url: authData.url,
			preCheck: pre,
			skipRemoteCheck: Boolean(params.skipRemoteCheck)
		});

		if (decision === 'merge_first') {
			logger.Info('[deploy] Merge first: full pull on a temporary branch, then merge (AI can resolve conflicts).');
			const result = await mergeFirstDeploy({
				environment,
				pullFn: async () => {
					await new Promise((resolve, reject) => {
						const child = spawn(command('siteglide-cli-pull'), [environment, '-c', params.configFile], {
							stdio: 'inherit',
							shell: true,
							env: Object.assign({}, process.env, nestedCliEnv(), { SITEGLIDE_PULL_ASSUME_YES: '1' })
						});
						child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`pull exit ${code}`))));
					});
				}
			});
			if (!result.ok) {
				logger.Error(`[deploy] Merge first failed: ${result.error}`);
				await offerMergeFirstFailureHelp(result, {
					environment,
					command: 'deploy'
				});
				process.exit(1);
			}
			const conflicts = hasOpenGitConflicts();
			if (conflicts.open) {
				await offerMergeConflictAiHelp({
					environment,
					command: 'deploy',
					warnMessage:
						'[deploy] Merge left conflict markers in your working tree. Deploy was not started.'
				});
				logger.Warn(
					'[deploy] When you are ready: resolve all conflicts, finish the merge commit, then re-run deploy yourself. Nothing will deploy until you do.',
					{ exit: false }
				);
				process.exit(0);
			}
			logger.Success('[deploy] Merge completed with no conflict markers. Continuing deploy…');
			decision = 'continue';
		}

		if (decision !== 'continue') {
			logger.Error('[Cancelled] Deploy command not executed, no files have been updated.');
			process.exit(1);
		}

		const env = Object.assign(process.env, {
			SITEGLIDE_EMAIL: authData.email,
			SITEGLIDE_TOKEN: authData.token,
			SITEGLIDE_URL: authData.url,
			SITEGLIDE_ENV: environment
		});

		try {
			await Promise.all([deploy(env, authData, params)]);
			const deployedAt = new Date().toISOString();
			const paths = collectDeployManifestPaths({ withAssets: params.withAssets });
			replaceDeployManifest(environment, { deployedAt, paths });
			clearConflictLog(environment);

			const post = await collectDeployPostLeftovers(gateway, environment, deployedAt);
			if (!post.leftovers.length) {
				advancePullBaseline(environment, deployedAt);
				logger.Info('[deploy] No untracked remote leftovers — advanced last-pull baseline.');
			} else if (process.stdin.isTTY && !process.env.CI) {
				writeConflictLog(environment, {
					command: 'deploy_post',
					reason: 'deploy_post_untracked',
					conflicts: post.leftovers,
					consoleHint: 'Remote files exist that were not in this deploy.'
				});
				const pullNow = await Confirm(
					'After your latest deploy there are still a few files on the site which are not tracked locally, pull now to track them? (Y/n)\n'
				);
				if (pullNow === 'Y') {
					await new Promise((resolve) => {
						const child = spawn(command('siteglide-cli-pull'), [environment, '-c', params.configFile], {
							stdio: 'inherit',
							shell: true,
							env: Object.assign({}, process.env, nestedCliEnv())
						});
						child.on('close', () => resolve());
					});
				}
			}
			process.exit(0);
		} catch {
			process.exit(1);
		}
	});

program.parse(process.argv);
