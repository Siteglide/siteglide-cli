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
	presignDirectory = require('./lib/presignUrl').presignDirectory,
	manifestGenerateForAssets = require('./lib/assets/generateManifest').manifestGenerateForAssets,
	uploadFileFormData = require('./lib/s3UploadFile').uploadFileFormData,
	version = require('./package.json').version,
	{ cloneDeep, debounce } = require('lodash');

const WATCH_DIRECTORIES = ['marketplace_builder'];
const getWatchDirectories = () => WATCH_DIRECTORIES.filter(fs.existsSync);
const ext = filePath => filePath.split('.').pop();
const filename = filePath => filePath.split(path.sep).pop();
const filePathUnixified = filePath => filePath.replace(/\\/g, '/').replace('marketplace_builder/', '');
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
const isAssetsPath = (path) => {
	console.log(path);
	return path.startsWith('marketplace_builder/assets') || path.startsWith('marketplace_builder\\assets');
};
let manifestFilesToAdd = [];

const extensionAllowed = filePath => {
	const allowed = watchFilesExtensions.includes(ext(filePath));
	if (!allowed) {
		logger.Debug(`[Sync] Not syncing, not allowed file extension: ${filePath}`);
	}
	return allowed;
};

const isNotHidden = filePath => {
	const isHidden = filename(filePath).startsWith('.');

	if (isHidden) {
		logger.Warn(`[Sync] Not syncing hidden file: ${filePath}`);
	}
	return !isHidden;
};

const isNotEmptyYML = filePath => {
	if (ext(filePath) === 'yml' && isEmpty(filePath)) {
		logger.Warn(`[Sync] Not syncing empty YML file: ${filePath}`);
		return false;
	}

	return true;
};

CONCURRENCY = 3;

const queue = Queue((task, callback) => {
	let push = program.directAssetsUpload ? pushFileDirectAssets : pushFile;
	switch (task.op) {
		case "push":
			push(gateway, task.path).then(callback);
			break;
		case "delete":
			deleteFile(gateway, task.path).then(callback);
			break;
	}
}, CONCURRENCY);

const enqueue = filePath => queue.push({ path: filePath, op: "push" }, () => { });
const enqueueDelete = (filePath) => queue.push({ path: filePath, op: "delete" }, () => { });

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
	const data = await presignDirectory(remoteAssetsDir);
	directUploadData = data;
}

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
			logger.Success(`[Sync] ${filePath} - done`);
		}

		if (body && body.error){
			logger.Error(`[Sync Error] ${body.error}`, {
				exit: false
			});
		} else {
			logger.Success(`[Sync] ${filePath} - done`);
		}

	});
};

const pushFileDirectAssets = (gateway, syncedFilePath) => {
	if (isAssetsPath(syncedFilePath)){
		sendAsset(gateway, syncedFilePath)
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
		const key = data.fields.key.replace('assets/${filename}', `assets${fileSubdir}/\${filename}`)
		data.fields.key = key;
		logger.Debug(data);
		await uploadFileFormData(filePath, data);
		manifestAddAsset(filePath);
		manifestSend(gateway);
		logger.Success(`[Sync] Synced asset: ${filePath}`);
	} catch (e) {
		logger.Debug(e.message);
		logger.Debug(e.stack);
		logger.Error(`[Sync] Failed to sync: ${filePath}`);
	}
}

const checkParams = params => {
	validate.existence({ argumentValue: params.token, argumentName: 'token', fail: program.help.bind(program) });
	validate.existence({ argumentValue: params.url, argumentName: 'URL', fail: program.help.bind(program) });
};

program
	.version(version)
	.option('--email <email>', 'authentication token', process.env.SITEGLIDE_EMAIL)
	.option('--token <token>', 'authentication token', process.env.SITEGLIDE_TOKEN)
	.option('--url <url>', 'site url', process.env.SITEGLIDE_URL)
  .option('-d, --direct-assets-upload', 'Uploads assets straight to S3 servers. [Beta]', process.env.DIRECT_ASSETS_UPLOAD)
	// .option('--files <files>', 'watch files', process.env.FILES || watchFilesExtensions)
	.parse(process.argv);

checkParams(program);

const gateway = new Gateway(program);

gateway.ping().then(async () => {
	if (program.directAssetsUpload) await fetchDirectUploadData(gateway);
	const directories = getWatchDirectories();

	if (directories.length === 0) {
		logger.Error('marketplace_builder has to exist! Please make sure you have the correct folder structure.');
	}

	logger.Info(`Enabling sync mode to: ${program.url}`);

	chokidar.watch(directories, {
		ignoreInitial: true
	})
	.on('change', fp => shouldBeSynced(fp) && enqueue(fp))
	.on('add', fp => shouldBeSynced(fp) && enqueue(fp))
	.on('unlink', fp => shouldBeSynced(fp) && enqueueDelete(fp));

});