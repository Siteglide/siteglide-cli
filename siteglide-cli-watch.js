#!/usr/bin/env node

const program = require('commander'),
	Gateway = require('./lib/proxy'),
	fs = require('fs'),
	path = require('path'),
	Queue = require('async/queue'),
	logger = require('./lib/logger'),
	validate = require('./lib/validators'),
	watchFilesExtensions = require('./lib/watch-files-extensions'),
	templates = require('./lib/templates'),
	settings = require('./lib/settings'),
	livereload = require('livereload'),
	dir = require('./lib/directories'),
	{ assertExclusiveSiteAppRoot } = require('./lib/migrateAppDirectory'),
	presignDirectory = require('./lib/presignUrl').presignDirectory,
	manifestGenerateForAssets = require('./lib/assets/generateManifest').manifestGenerateForAssets,
	uploadFileFormData = require('./lib/s3UploadFile').uploadFileFormData,
	{ claimSyncStatus, clearSyncStatus, registerSyncStatusCleanup } = require('./lib/syncStatus'),
	{ logCommandLockRefusal } = require('./lib/commandLock'),
	version = require('./package.json').version,
	{ cloneDeep, debounce } = require('lodash'),
	{ checkFile, fetchRemoteFileMtime, toPhysicalApiPath } = require('./lib/remoteMtimeCheck'),
	{ promptRemoteConflict } = require('./lib/remoteConflictPrompt'),
	{ hasOpenGitConflicts } = require('./lib/git/conflictMarkers'),
	{ mergeFirstSyncPull, isSafeAfterMergeFirst } = require('./lib/git/mergeFirst'),
	{ spawnNestedPull } = require('./lib/pull/spawnNestedPull'),
	syncFileWatcher = require('./lib/sync/syncFileWatcher'),
	{ createSyncUploadWave, checkAllowsUpload, checkHasGitBlock } = require('./lib/sync/syncUploadWave'),
	{ writeConflictLog } = require('./lib/remoteCheckConflictLog'),
	{
		writeSyncCurrentConflict,
		clearSyncCurrentConflict,
		resolveSyncCurrentConflict,
		updateSyncCurrentConflictStatus
	} = require('./lib/syncCurrentConflict'),
	{ createSyncConflictGate } = require('./lib/syncConflictGate'),
	{ offerMergeConflictAiHelp, offerMergeFirstFailureHelp } = require('./lib/aiPrompts'),
	{ recordSyncPath, syncedAtFromAssetFileMtime } = require('./lib/pullBaseline');

const ext = filePath => filePath.split('.').pop();
const filename = filePath => filePath.split(path.sep).pop();
const filePathUnixified = filePath =>
	filePath
		.replace(/\\/g, '/')
		.replace(new RegExp(`^${dir.SITE_ROOT}/`), '')
		.replace(new RegExp(`^${dir.APP}/`), '');
let counter = 0;
let siteRoot = null;

const noteSyncUploadSuccess = (syncedFilePath, syncedAt) => {
	if (!siteRoot || !process.env.SITEGLIDE_ENV) {
		return;
	}
	recordSyncPath(
		process.env.SITEGLIDE_ENV,
		toPhysicalApiPath(syncedFilePath, siteRoot),
		{ syncedAt }
	);
};

const isEmpty = filePath => {
	let isEmpty;
	try {
		isEmpty = fs
			.readFileSync(filePath)
			.toString()
			.trim().length === 0;
	} catch (err) {
		// Ignore missing files, no need to check if they are empty.
		// This can happen on sync if the file got deleted.
		if (err.code === 'ENOENT') {
			return false;
		}
		logger.Error(err);
	}

	return isEmpty;
};
const shouldBeSynced = (filePath) => {
	return extensionAllowed(filePath) && isNotHidden(filePath) && isNotEmptyYML(filePath) && isNotInNodeModules(filePath);
};
const isAssetsPath = (filePath) => {
	const normalized = filePath.replace(/\\/g, '/');
	return siteRoot && normalized.startsWith(`${siteRoot}/assets`);
};
let manifestFilesToAdd = [];

const displayPath = (filePath) => {
	const normalized = filePath.replace(/\\/g, '/');
	if (siteRoot && normalized.startsWith(`${siteRoot}/`)) {
		return normalized.slice(siteRoot.length + 1);
	}
	return normalized;
};

const extensionAllowed = filePath => {
	var allowed = watchFilesExtensions.includes(ext(filePath).toLowerCase());
	if (!allowed) {
		if(filename(filePath)!=='.DS_Store'){
			logger.Warn(`[Sync] Ignored: ${displayPath(filePath)} - File extension is not allowed`, {
				exit: false
			});
		}
	}
	return allowed;
};

const isNotHidden = filePath => {
	const isHidden = filename(filePath).startsWith('.');

	if (isHidden) {
		if(filename(filePath)!=='.DS_Store'){
			logger.Warn(`[Sync] Ignored: ${displayPath(filePath)} - Hidden file`);
		}
	}
	return !isHidden;
};

const isNotEmptyYML = filePath => {
	if (ext(filePath) === 'yml' && isEmpty(filePath)) {
		logger.Warn(`[Sync] Ignored: ${displayPath(filePath)} - Empty YML file`);
		return false;
	}

	return true;
};

const isNotInNodeModules = filePath => {
	return !filePath.includes(`${path.sep}node_modules${path.sep}`);
};

CONCURRENCY = 3;

const skipRemoteCheck = process.env.SITEGLIDE_SKIP_REMOTE_CHECK === '1';

/** Once true, stop accepting work and exit the watch process. */
let syncStopping = false;

/** Offer merge-conflict AI prompt at most once while markers remain open. */
let mergeConflictAiHelpOffered = false;

/** Pause/resume gate — initialized after queue is created. */
let conflictGate;

/** Check/upload wave coordinator — one in-flight wave at a time. */
let syncUploadWave = createSyncUploadWave();

/**
 * Cancel sync watch: drop remaining queue work and exit the process.
 * Sync status cleanup runs via registerSyncStatusCleanup on exit.
 * @param {string} message
 */
const stopSyncWatch = (message) => {
	if (syncStopping) {
		return;
	}
	syncStopping = true;
	clearSyncCurrentConflict();
	logger.Warn(message, { exit: false });
	try {
		queue.kill();
	} catch (err) {
		logger.Debug(err);
	}
	process.exit(0);
};

/**
 * Remote/git check only — no prompt, no upload.
 * @param {string} syncedFilePath
 * @returns {Promise<object>}
 */
const beforeSyncOpCheck = async (syncedFilePath) => {
	if (syncStopping) {
		return { proceed: false, stopping: true };
	}

	const environment = process.env.SITEGLIDE_ENV;
	const open = hasOpenGitConflicts();
	if (!open.open) {
		mergeConflictAiHelpOffered = false;
	}
	if (open.open) {
		writeConflictLog(environment || 'unknown', {
			command: 'sync',
			reason: open.reason,
			conflicts: (open.paths || []).map((p) => ({ path: p })),
			consoleHint: 'Resolve conflict markers with AI + MCP before syncing.'
		});
		return { proceed: false, gitBlocked: true, gitOpen: open };
	}

	if (skipRemoteCheck || !environment) {
		return { proceed: true };
	}

	const physicalPath = toPhysicalApiPath(syncedFilePath, siteRoot);
	const remoteMeta = await fetchRemoteFileMtime(gateway, physicalPath);
	if (remoteMeta.found && isSafeAfterMergeFirst(environment, physicalPath, remoteMeta.updatedAt)) {
		return { proceed: true };
	}

	const result = await checkFile({
		gateway,
		environment,
		filePath: syncedFilePath,
		siteRoot,
		remoteMeta
	});
	if (result.ok) {
		clearSyncCurrentConflict();
		return { proceed: true };
	}

	if (syncStopping) {
		return { proceed: false, stopping: true };
	}

	const localPathUnix = syncedFilePath.replace(/\\/g, '/');
	return {
		proceed: false,
		remoteConflict: true,
		reason: result.reason,
		meta: {
			path: result.physicalPath,
			localPath: localPathUnix,
			type: result.kind,
			remoteUpdatedAt: result.remoteUpdatedAt || remoteMeta.updatedAt || null,
			effectiveBaselineAt: result.effectiveBaselineAt,
			baselineSource: result.baselineSource
		}
	};
};

/**
 * @param {object[]} entries
 * @returns {string[]}
 */
const collectWavePaths = (entries) => {
	return entries
		.map((entry) => {
			const meta = entry.checkResult && entry.checkResult.meta;
			return (meta && meta.path) || entry.path.replace(/\\/g, '/');
		})
		.filter(Boolean);
};

/**
 * Leader-only: prompt and handle merge-first for a blocked wave.
 * @param {object} primaryConflict
 * @param {object[]} waveEntries
 * @returns {Promise<object>}
 */
const resolveSyncRemoteConflict = async (primaryConflict, waveEntries) => {
	const environment = process.env.SITEGLIDE_ENV;
	const checkResult = primaryConflict.checkResult;
	const conflictMeta = checkResult.meta;
	const wavePaths = collectWavePaths(waveEntries);

	writeSyncCurrentConflict({
		environment,
		reason: checkResult.reason,
		path: conflictMeta.path,
		localPath: conflictMeta.localPath,
		kind: conflictMeta.type,
		remoteUpdatedAt: conflictMeta.remoteUpdatedAt,
		effectiveBaselineAt: conflictMeta.effectiveBaselineAt,
		baselineSource: conflictMeta.baselineSource,
		wavePaths,
		syncPaused: true
	});

	if (syncStopping) {
		clearSyncCurrentConflict();
		return { action: 'abort' };
	}

	const decision = await promptRemoteConflict({
		environment,
		command: 'sync',
		reason: checkResult.reason,
		conflicts: [conflictMeta]
	});

	if (decision === 'continue') {
		resolveSyncCurrentConflict('continue');
		clearSyncCurrentConflict();
		return { action: 'continue', forcePath: primaryConflict.path };
	}
	if (decision === 'skip') {
		resolveSyncCurrentConflict('skip');
		const chalk = require('chalk');
		const shown = (conflictMeta.path || primaryConflict.path || '').replace(/\\/g, '/');
		logger.Error(`[Sync] Skipped file: ${shown}`, { exit: false });
		logger.Print(`${chalk.red.bold(shown)}\n`);
		clearSyncCurrentConflict();
		return { action: 'skip', skipPath: primaryConflict.path };
	}
	if (decision === 'merge_first') {
		resolveSyncCurrentConflict('merge_first');
		syncFileWatcher.pause();
		try {
			const conflictPath = (conflictMeta.path || '').replace(/\\/g, '/');
			const mf = await mergeFirstSyncPull({
				environment,
				wipMessage: `siteglide: WIP before merge-first sync (${conflictPath})`,
				pullFn: async () => {
					await spawnNestedPull({
						environment,
						configFile: process.env.CONFIG_FILE_PATH || '.siteglide-config',
						mergeFirstSync: true,
						skipCommitBaseline: true
					});
				}
			});
			if (!mf.ok) {
				logger.Error(`[Sync] Merge first failed: ${mf.error}`, { exit: false });
				await offerMergeFirstFailureHelp(mf, {
					environment,
					command: 'sync'
				});
				clearSyncCurrentConflict();
				return { action: 'merge_first_failed' };
			}
			const conflicts = hasOpenGitConflicts();
			if (conflicts.open) {
				mergeConflictAiHelpOffered = true;
				await offerMergeConflictAiHelp({
					environment,
					command: 'sync',
					warnMessage:
						'[Sync] Merge left conflict markers in your working tree. This file was not synced.'
				});
				logger.Warn(
					'[Sync] When you are ready: resolve all conflicts, finish the merge commit, then save the file again to sync.',
					{ exit: false }
				);
				await conflictGate.waitForGitClean();
			} else {
				logger.Success('[Sync] Merge completed with no conflict markers. Save the file again to sync.');
			}
			clearSyncCurrentConflict();
			return { action: 'merge_first' };
		} finally {
			syncFileWatcher.resume();
		}
	}
	if (decision === 'cancel' || decision === 'abort' || decision === 'pause') {
		resolveSyncCurrentConflict(decision === 'pause' ? 'pause' : 'cancel');
		return { action: decision === 'pause' ? 'pause' : 'cancel' };
	}
	clearSyncCurrentConflict();
	return { action: 'unknown' };
};

/**
 * @param {object} gitOpen
 * @returns {Promise<void>}
 */
const handleGitBlockAsLeader = async (gitOpen) => {
	const environment = process.env.SITEGLIDE_ENV;
	if (syncStopping || !hasOpenGitConflicts().open) {
		return;
	}
	if (!mergeConflictAiHelpOffered) {
		mergeConflictAiHelpOffered = true;
		await offerMergeConflictAiHelp({
			environment: environment || 'unknown',
			command: 'sync',
			warnMessage:
				`[Sync] Refusing while ${gitOpen.reason}. Sync is paused until conflict markers are resolved.`
		});
		logger.Warn(
			'[Sync] When you are ready: resolve all conflicts, finish the merge commit, then save the file again to sync.',
			{ exit: false }
		);
	}
	await conflictGate.waitForGitClean();
};

/**
 * @param {object[]} entries
 * @param {object} [resolution]
 * @returns {Promise<{ proceed: boolean, entries: object[] }>}
 */
const recheckWaveEntries = async (entries, resolution = {}) => {
	const rechecked = await Promise.all(entries.map(async (entry) => {
		if (resolution.forcePath && entry.path === resolution.forcePath) {
			return { ...entry, checkResult: { proceed: true } };
		}
		if (resolution.skipPath && entry.path === resolution.skipPath) {
			return { ...entry, checkResult: { proceed: false, skipUpload: true } };
		}
		const nextCheck = await beforeSyncOpCheck(entry.path);
		return { ...entry, checkResult: nextCheck };
	}));

	const stillBlocked = rechecked.some((entry) => {
		const check = entry.checkResult;
		if (check.proceed) {
			return false;
		}
		if (check.skipUpload || check.stopping) {
			return false;
		}
		return true;
	});

	return { proceed: !stillBlocked, entries: rechecked };
};

/**
 * @param {{ path: string, op: string }} task
 * @returns {Promise<void>}
 */
const performSyncOp = async (task) => {
	conflictGate.assertUploadAllowed();
	if (task.op === 'push') {
		await pushFileDirectAssets(gateway, task.path);
	} else {
		await deleteFile(gateway, task.path);
	}
};

/**
 * @param {object[]} entries
 * @returns {Promise<void>}
 */
const uploadWaveEntriesAsLeader = async (entries) => {
	const uploads = entries
		.filter((entry) => checkAllowsUpload(entry.checkResult))
		.map((entry) => performSyncOp({ path: entry.path, op: entry.op }));
	await Promise.all(uploads);
};

/**
 * Check → wave barrier → upload (or leader conflict resolution).
 * @param {{ path: string, op: string }} task
 * @param {Function} callback
 */
const processSyncTask = async (task, callback) => {
	if (syncStopping) {
		callback();
		return;
	}

	try {
		if (skipRemoteCheck) {
			await performSyncOp(task);
			callback();
			return;
		}

		while (syncUploadWave.isBlocked()) {
			await conflictGate.waitForLeader();
			await syncUploadWave.waitForWaveClosed();
			if (syncStopping) {
				callback();
				return;
			}
		}

		if (conflictGate.isPaused() && !conflictGate.isActiveLeader()) {
			await conflictGate.waitForLeader();
			if (syncStopping) {
				callback();
				return;
			}
		}

		syncUploadWave.joinWave();
		const checkResult = await beforeSyncOpCheck(task.path);
		syncUploadWave.reportCheck(task.path, task.op, checkResult);
		const decision = await syncUploadWave.awaitWaveDecision();

		if (decision.proceed) {
			const entry = syncUploadWave.getEntry(task.path, task.op);
			if (entry && checkAllowsUpload(entry.checkResult)) {
				await performSyncOp(task);
			}
			syncUploadWave.finishWave();
			callback();
			return;
		}

		conflictGate.blockUploads();
		syncUploadWave.markConflictResolving();
		const { isLeader } = conflictGate.enterConflictMode();

		try {
			if (decision.gitBlocked) {
				if (isLeader) {
					const gitEntry = decision.entries.find((entry) => checkHasGitBlock(entry.checkResult)) || decision.entries[0];
					await handleGitBlockAsLeader(gitEntry.checkResult.gitOpen);
				} else {
					await conflictGate.waitForLeader();
				}
			} else if (isLeader) {
				const resolution = await resolveSyncRemoteConflict(
					decision.primaryConflict,
					decision.entries
				);
				if (resolution.action === 'cancel' || resolution.action === 'abort' || resolution.action === 'pause') {
					stopSyncWatch('[Sync] Cancelling sync.');
				} else if (resolution.action === 'continue' || resolution.action === 'skip') {
					const rechecked = await recheckWaveEntries(decision.entries, resolution);
					if (rechecked.proceed) {
						await uploadWaveEntriesAsLeader(rechecked.entries);
					}
				}
			} else {
				await conflictGate.waitForLeader();
			}
		} finally {
			syncUploadWave.finishWave();
			conflictGate.allowUploads();
			if (!syncStopping) {
				conflictGate.exitConflictMode();
			}
		}

		callback();
	} catch (err) {
		logger.Debug(err);
		callback();
	}
};

const queue = Queue((task, callback) => {
	processSyncTask(task, callback);
}, CONCURRENCY);

conflictGate = createSyncConflictGate({
	queue,
	logger,
	hasOpenGitConflicts,
	pollIntervalMs: 3000,
	isSyncStopping: () => syncStopping,
	onUpdateConflictStatus: (payload) => {
		updateSyncCurrentConflictStatus({
			status: payload.status,
			syncPaused: payload.syncPaused
		}, payload.cwd);
	}
});

const enqueue = filePath => queue.push({ path: filePath, op: 'push' }, () => { });
const enqueueDelete = (filePath) => queue.push({ path: filePath, op: 'delete' }, () => { });

const getBody = (filePath, processTemplate) => {
	if (processTemplate) {
		const templatePath = `modules/${filePath.split(path.sep)[1]}/template-values.json`;
		const moduleTemplateData = templateData(templatePath);
		return templates.fillInTemplateValues(filePath, moduleTemplateData);
	} else {
		return fs.createReadStream(filePath);
	}
};

const templateData = (path) => {
	return settings.loadSettingsFile(path);
};

const fetchDirectUploadData = async (gateway) => {
	const instanceId = (await gateway.getInstance());
	const remoteAssetsDir = `instances/${instanceId}/assets`;
	const data = await presignDirectory(remoteAssetsDir,gateway);
	directUploadData = data;
};

const deleteFile = (gateway, syncedFilePath) => {
	let filePath = filePathUnixified(syncedFilePath); // need path with / separators
	const formData = {
		path: filePath,
		primary_key: filePath,
	};

	return gateway.delete(formData).then(body => {
		if (body) {
			logger.Info(`[Sync] Deleted: ${filePath}`);
		}
	});
};

const pushFile = (gateway, syncedFilePath) => {
	let filePath = filePathUnixified(syncedFilePath); // need path with / separators

	const formData = {
		path: filePath,
		marketplace_builder_file_body: getBody(syncedFilePath, filePath.startsWith('modules'))
	};

	return gateway.sync(formData).then(body => {
		if(!body){
			logger.Error(`[Sync] Error: unhandled.`, { exit: false });
			return false;
		}

		if(body.error){
			logger.Error(`[Sync] Error: ${filePath}\n${body.error}`, { exit: false });
		}else if(
			(body.reason)||
			(body.message)
		){
			let error_msg = `[Sync] Error: ${filePath}`;
			let error_name = body.name? body.name : 'Error';
			error_msg += body.mark? `\nLocation: ${error_name} on line ${body.mark.line}, column ${body.mark.column}.` : '';
			error_msg += `\nGuide: ${body.message || body.reason}`;

			logger.Error(error_msg, { exit: false });
		}else{
			logger.Success(`[Sync] Uploaded: ${filePath}`);
			noteSyncUploadSuccess(syncedFilePath);

			if(body.refresh_index){
				logger.Warn('WARNING: Data schema was updated. It may take a little while for the change to be applied.');
			}
		}

	});
};

const isModule19CustomCss = (syncedFilePath) => {
	const normalized = syncedFilePath.replace(/\\/g, '/');
	const legacyCustom =
		normalized === `${dir.SITE_ROOT}/assets/css/modules/module_19/_custom-variables.scss` ||
		normalized === `${dir.SITE_ROOT}/assets/css/modules/module_19/_custom.scss`;
	const appCustom =
		normalized === `${dir.APP}/assets/css/modules/module_19/_custom-variables.scss` ||
		normalized === `${dir.APP}/assets/css/modules/module_19/_custom.scss`;
	return legacyCustom || appCustom;
};

const pushFileDirectAssets = (gateway, syncedFilePath) => {
	if (isAssetsPath(syncedFilePath) && !isModule19CustomCss(syncedFilePath)) {
		syncedFilePath = syncedFilePath.replace(/\\/g, '/');
		sendAsset(gateway, syncedFilePath);
		return Promise.resolve(true);
	} else {
		return pushFile(gateway, syncedFilePath);
	}
};

const manifestSend = debounce(
	(gateway) => {
		const manifest = manifestGenerateForAssets(manifestFilesToAdd.slice());
		logger.Debug(manifest);
		gateway.sendManifest(manifest);
		manifestFilesToAdd = [];
	},
	1000,
	{ maxWait: 1000 * 10 }
);

const manifestAddAsset = (path) => manifestFilesToAdd.push(path);

const sendAsset = async (gateway, filePath) => {
	try {
		const data = cloneDeep(directUploadData);
		const normalized = filePath.replace(/\\/g, '/');
		const fileSubdir = normalized.startsWith(`${siteRoot}/assets`)
			? path.dirname(normalized).replace(`${siteRoot}/assets`, '')
			: '/' + path.dirname(normalized).replace('/public/assets', '');
		const key = data.fields.key.replace('assets/${filename}', `assets${fileSubdir}/\${filename}`);
		data.fields.key = key;
		logger.Debug(data);
		await uploadFileFormData(filePath, data);
		manifestAddAsset(filePath);
		manifestSend(gateway);
		logger.Success(`[Sync] Uploaded: ${displayPath(filePath)}`);
		noteSyncUploadSuccess(filePath, syncedAtFromAssetFileMtime(filePath));
		counter = 0;
	} catch (e) {
		logger.Debug(e);
		logger.Debug(e.message);
		logger.Debug(e.stack);
		if(e=='403'&&counter<3){
			counter++;
			await fetchDirectUploadData(gateway)
			.then(() => {
				cloneDeep(directUploadData);
				sendAsset(gateway,filePath);
			})
		}else{
			logger.Error(`[Sync] Error: ${displayPath(filePath)} - Failed to sync`);
		}
	}
};

const checkParams = params => {
	validate.existence({ argumentValue: params.opts().token, argumentName: 'token', fail: program.help.bind(program) });
	validate.existence({ argumentValue: params.opts().url, argumentName: 'URL', fail: program.help.bind(program) });
};

const reload = () => liveReload && liveReloadServer.refresh(program.opts().url);

program
	.version(version)
	.option('--email <email>', 'authentication token', process.env.SITEGLIDE_EMAIL)
	.option('--token <token>', 'authentication token', process.env.SITEGLIDE_TOKEN)
	.option('--url <url>', 'site url', process.env.SITEGLIDE_URL)
	.option('-l, --livereload', 'Turns on a livereload server', process.env.LIVE_RELOAD)
	.parse(process.argv);

checkParams(program);

const syncEnvironment = process.env.SITEGLIDE_ENV;
if (syncEnvironment) {
	const claim = claimSyncStatus({ environment: syncEnvironment });
	if (!claim.ok) {
		if (claim.headline || claim.helper) {
			logCommandLockRefusal(claim);
		}
		logger.Error(
			`Sync for environment "${syncEnvironment}" is already running (pid ${claim.existingPid}) in this directory. Stop that sync before starting another.`
		);
	}
	registerSyncStatusCleanup();
} else {
	logger.Warn('[Sync] SITEGLIDE_ENV not set; sync status registration skipped.');
}

const gateway = new Gateway(program.opts());

gateway.ping().then(async () => {
	siteRoot = assertExclusiveSiteAppRoot();
	const watchDirectories = [];
	if (siteRoot) {
		watchDirectories.push(siteRoot);
	}
	if (fs.existsSync(dir.MODULES)) {
		watchDirectories.push(dir.MODULES);
	}

	if (watchDirectories.length === 0) {
		logger.Error(
			`${dir.SITE_ROOT}/ or ${dir.APP}/ has to exist! Please make sure you have the correct folder structure.`
		);
	}

	await fetchDirectUploadData(gateway);

	logger.Info(`Enabled sync to: ${program.opts().url}`);
	logger.Info(`[Sync] Watching: ${watchDirectories.join(', ')}`);

	let liveReloadServer;
  if (program.opts().livereload) {
    liveReloadServer = livereload.createServer({
      exts: watchFilesExtensions,
      delay: 2000
    });

    let liveReloadDirectories = [process.cwd()];
    if (siteRoot) {
      liveReloadDirectories.push(siteRoot);
    }
    if (fs.existsSync(dir.MODULES)) {
      liveReloadDirectories.push(dir.MODULES);
    }

    liveReloadServer.watch(liveReloadDirectories);

    logger.Info('LiveReload Enabled');
  }

	syncFileWatcher.attach({
		directories: watchDirectories,
		options: {
			awaitWriteFinish: {
				stabilityThreshold: 100,
				pollInterval: 25
			},
			ignoreInitial: true
		},
		onChange: (fp) => {
			if (shouldBeSynced(fp)) {
				enqueue(fp);
			}
		},
		onAdd: (fp) => {
			if (shouldBeSynced(fp)) {
				enqueue(fp);
			}
		},
		onUnlink: (fp) => {
			if (shouldBeSynced(fp)) {
				enqueueDelete(fp);
			}
		}
	});

}).catch((error) => {
	try {
		clearSyncStatus();
	} catch {
		// ignore
	}
	logger.Error(error);
});
