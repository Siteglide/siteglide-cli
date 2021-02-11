const request = require('request-promise');
packAssets = require('./packAssets'),
ora = require('ora'),
manifestGenerate = require('./generateManifest').manifestGenerate,
logger = require('../logger'),
uploadFile = require('../s3UploadFile').uploadFile,
presignUrl = require('../presignUrl').presignUrl;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const waitForUnpack = async fileUrl => {
	logger.Debug('Waiting for assets to be propagated to CDN');

	let fileExists = false;
	let counter = 0;
	do {
		logger.Debug(`Waiting for: ${fileUrl} to be deleted.`);
		counter += 1;
		if (fileExists) await sleep(1000);
		fileExists = await request
			.head(fileUrl)
			.then(() => true)
			.catch({ statusCode: 403 }, () => false)
			.catch(error => logger.Error(error));
	} while (fileExists && counter < 90);
};

const deployAssets = async gateway => {
	logger.Debug('Generating and uploading new assets manifest...');
	const assetsArchiveName = './.tmp/assets.zip';
	const instanceId = await gateway.getInstance();
	const now = Math.floor(new Date() / 1000);
	const remoteAssetsArchiveName = `instances/${instanceId}/assets/${now}.assets_deploy.zip`;
	logger.Debug(remoteAssetsArchiveName);
	try {
		await packAssets(assetsArchiveName);
		const data = await presignUrl(remoteAssetsArchiveName, assetsArchiveName, gateway);
		const spinner = ora({ text: `Deploying assets to: ${gateway.url}`, stream: process.stdout, spinner: 'clock' }).start();
		logger.Debug(data);
		logger.Debug(assetsArchiveName);
		await uploadFile(assetsArchiveName, data.uploadUrl);
		logger.Debug('Assets uploaded to S3.');
		await waitForUnpack(data.accessUrl);
		const manifest = await manifestGenerate();
		logger.Debug(manifest);
		await gateway.sendManifest(manifest);
		logger.Debug('Uploading assets');
		spinner.stopAndPersist().succeed(`Deploying assets succeeded`);
	} catch (e) {
		logger.Debug(e);
		logger.Debug(e.message);
		logger.Debug(e.stack);
		logger.Error('Deploying assets failed.');
	}
};

module.exports = {
	deployAssets: deployAssets
};
