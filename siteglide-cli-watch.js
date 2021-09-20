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
	directories = require('./lib/directories'),
	presignDirectory = require('./lib/presignUrl').presignDirectory,
	manifestGenerateForAssets = require('./lib/assets/generateManifest').manifestGenerateForAssets,
	uploadFileFormData = require('./lib/s3UploadFile').uploadFileFormData,
	version = require('./package.json').version,
	{ cloneDeep, debounce } = require('lodash');

const WATCH_DIRECTORIES = ['marketplace_builder','modules'];
const getWatchDirectories = () => WATCH_DIRECTORIES.filter(fs.existsSync);
const ext = filePath => filePath.split('.').pop();
const filename = filePath => filePath.split(path.sep).pop();
const filePathUnixified = filePath => filePath.replace(/\\/g, '/').replace('marketplace_builder/', '');
let counter = 0;
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
	return extensionAllowed(filePath) && isNotHidden(filePath) && isNotEmptyYML(filePath);
};
const isAssetsPath = (path) => path.startsWith('marketplace_builder/assets') || path.startsWith('marketplace_builder\\assets');
let manifestFilesToAdd = [];

const extensionAllowed = filePath => {
	var allowed = watchFilesExtensions.includes(ext(filePath).toLowerCase());
	if (!allowed) {
		if(filename(filePath)!=='.DS_Store'){
			logger.Warn(`[Sync] Ignored: ${filePath.slice(20)} - File extension is not allowed`, {
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
			logger.Warn(`[Sync] Ignored: ${filePath.slice(20)} - Hidden file`);
		}
	}
	return !isHidden;
};

const isNotEmptyYML = filePath => {
	if (ext(filePath) === 'yml' && isEmpty(filePath)) {
		logger.Warn(`[Sync] Ignored: ${filePath.slice(20)} - Empty YML file`);
		return false;
	}

	return true;
};

CONCURRENCY = 3;

const queue = Queue((task, callback) => {
	let push = pushFileDirectAssets
	switch (task.op) {
		case 'push':
			push(gateway, task.path).then(callback);
			break;
		case 'delete':
			deleteFile(gateway, task.path).then(callback);
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
		if (body && body.refresh_index) {
			logger.Warn('WARNING: Data schema was updated. It may take a little while for the change to be applied.');
			logger.Success(`[Sync] Uploaded: ${filePath}`);
		}

		if (body && body.error){
			logger.Error(`[Sync] Error: ${body.error}`, {
				exit: false
			});
		} else {
			logger.Success(`[Sync] Uploaded: ${filePath}`);
		}

	});
};

const pushFileDirectAssets = (gateway, syncedFilePath) => {
	if (
		(isAssetsPath(syncedFilePath))&&
		(
			(syncedFilePath!=='marketplace_builder/assets/css/modules/module_19/_custom-variables.scss')&&
			(syncedFilePath!=='marketplace_builder/assets/css/modules/module_19/_custom.scss')
		)
	){
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
		const fileSubdir = filePath.startsWith('marketplace_builder/assets')
			? path.dirname(filePath).replace('marketplace_builder/assets','')
			: '/' + path.dirname(filePath).replace('/public/assets', '');
		const key = data.fields.key.replace('assets/${filename}', `assets${fileSubdir}/\${filename}`);
		data.fields.key = key;
		logger.Debug(data);
		await uploadFileFormData(filePath, data);
		manifestAddAsset(filePath);
		manifestSend(gateway);
		logger.Success(`[Sync] Uploaded: ${filePath.slice(20)}`);
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
			logger.Error(`[Sync] Error: ${filePath.slice(20)} - Failed to sync`);
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

const gateway = new Gateway(program.opts());

gateway.ping().then(async () => {
	await fetchDirectUploadData(gateway);
	const directories = getWatchDirectories();

	if (directories.length === 0) {
		logger.Error('marketplace_builder has to exist! Please make sure you have the correct folder structure.');
	}

	logger.Info(`Enabled sync to: ${program.opts().url}`);

	let liveReloadServer;
  if (program.opts().livereload) {
    liveReloadServer = livereload.createServer({
      exts: watchFilesExtensions,
      delay: 2000
    });

    let liveReloadDirectories = [];
    liveReloadDirectories.push(process.cwd(), 'marketplace_builder');
    liveReloadDirectories.push(process.cwd(), 'app');
    liveReloadDirectories.push(process.cwd(), 'modules');

    liveReloadServer.watch(liveReloadDirectories);

    logger.Info('LiveReload Enabled');
  }

	chokidar.watch(directories, {
		awaitWriteFinish: {
			stabilityThreshold: 100,
			pollInterval: 25
		},
		ignoreInitial: true
	})
		.on('change', fp => shouldBeSynced(fp) && enqueue(fp))
		.on('add', fp => shouldBeSynced(fp) && enqueue(fp))
		.on('unlink', fp => shouldBeSynced(fp) && enqueueDelete(fp));

});