#!/usr/bin/env node

const program = require('commander'),
	Gateway = require('./lib/proxy'),
	fs = require('fs'),
	path = require('path'),
	chokidar = require('chokidar'),
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
	version = require('./package.json').version,
	{ cloneDeep, debounce } = require('lodash'),
	{ checkFile, fetchRemoteFileMtime, toPhysicalApiPath } = require('./lib/remoteMtimeCheck'),
	{ promptRemoteConflict } = require('./lib/remoteConflictPrompt'),
	{ hasOpenGitConflicts } = require('./lib/git/conflictMarkers'),
	{ mergeFirstSyncFile, isSafeAfterMergeFirst } = require('./lib/git/mergeFirst'),
	{ writeConflictLog } = require('./lib/remoteCheckConflictLog');

const ext = filePath => filePath.split('.').pop();
const filename = filePath => filePath.split(path.sep).pop();
const filePathUnixified = filePath =>
	filePath
		.replace(/\\/g, '/')
		.replace(new RegExp(`^${dir.SITE_ROOT}/`), '')
		.replace(new RegExp(`^${dir.APP}/`), '');
let counter = 0;
let siteRoot = null;

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

/** Serialize conflict prompts so other uploads can continue. */
let confirmChain = Promise.resolve();
const withConfirmLock = (fn) => {
	const run = confirmChain.then(fn, fn);
	confirmChain = run.catch(() => {});
	return run;
};

const skipRemoteCheck = process.env.SITEGLIDE_SKIP_REMOTE_CHECK === '1';

/**
 * Before push/delete: refuse open git conflicts; check remote mtime unless skipped.
 * Merge first stops sync for that file (and pauses further prompts via pause exit).
 */
const beforeSyncOp = async (syncedFilePath) => {
	const environment = process.env.SITEGLIDE_ENV;
	const open = hasOpenGitConflicts();
	if (open.open) {
		writeConflictLog(environment || 'unknown', {
			command: 'sync',
			reason: open.reason,
			conflicts: (open.paths || []).map((p) => ({ path: p })),
			consoleHint: 'Resolve conflict markers with AI + MCP before syncing.'
		});
		logger.Error(`[Sync] Refusing while ${open.reason}. Ask AI + MCP to help resolve conflicts.`, { exit: false });
		return false;
	}

	if (skipRemoteCheck || !environment) {
		return true;
	}

	const physicalPath = toPhysicalApiPath(syncedFilePath, siteRoot);
	const remoteMeta = await fetchRemoteFileMtime(gateway, physicalPath);
	if (remoteMeta.found && isSafeAfterMergeFirst(environment, physicalPath, remoteMeta.updatedAt)) {
		return true;
	}

	const result = await checkFile({
		gateway,
		environment,
		filePath: syncedFilePath,
		siteRoot
	});
	if (result.ok) {
		return true;
	}

	return withConfirmLock(async () => {
		const decision = await promptRemoteConflict({
			environment,
			command: 'sync',
			reason: result.reason,
			conflicts: [{
				path: result.physicalPath,
				type: result.kind,
				remoteUpdatedAt: result.remoteUpdatedAt,
				effectiveBaselineAt: result.effectiveBaselineAt,
				baselineSource: result.baselineSource
			}]
		});
		if (decision === 'continue') {
			return true;
		}
		if (decision === 'merge_first') {
			const localPath = syncedFilePath.replace(/\\/g, '/');
			const mf = await mergeFirstSyncFile({
				gateway,
				environment,
				physicalPath: result.physicalPath,
				localFilePath: localPath,
				fetchRemoteContent: async (p) => {
					const r = await fetchRemoteFileMtime(gateway, p);
					if (!r.found || r.body == null) {
						return null;
					}
					return { body: r.body, updatedAt: r.updatedAt };
				}
			});
			if (!mf.ok) {
				logger.Error(`[Sync] Merge first failed: ${mf.error}`, { exit: false });
				return false;
			}
			logger.Warn(
				'[Sync] Merge first started. Ask AI + MCP to resolve markers, finish the merge, then save again to sync.',
				{ exit: false }
			);
			return false;
		}
		logger.Warn('[Sync] Paused due to remote conflict. Commit, pull, or Merge first, then save again.', { exit: false });
		return false;
	});
};

const queue = Queue((task, callback) => {
	let push = pushFileDirectAssets;
	switch (task.op) {
		case 'push':
			beforeSyncOp(task.path)
				.then((ok) => {
					if (!ok) {
						callback();
						return;
					}
					return push(gateway, task.path).then(callback);
				})
				.catch((err) => {
					logger.Debug(err);
					callback();
				});
			break;
		case 'delete':
			beforeSyncOp(task.path)
				.then((ok) => {
					if (!ok) {
						callback();
						return;
					}
					return deleteFile(gateway, task.path).then(callback);
				})
				.catch((err) => {
					logger.Debug(err);
					callback();
				});
			break;
	}
}, CONCURRENCY);

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

	chokidar.watch(watchDirectories, {
		awaitWriteFinish: {
			stabilityThreshold: 100,
			pollInterval: 25
		},
		ignoreInitial: true
	})
		.on('change', fp => shouldBeSynced(fp) && enqueue(fp))
		.on('add', fp => shouldBeSynced(fp) && enqueue(fp))
		.on('unlink', fp => shouldBeSynced(fp) && enqueueDelete(fp));

}).catch((error) => {
	try {
		clearSyncStatus();
	} catch {
		// ignore
	}
	logger.Error(error);
});
