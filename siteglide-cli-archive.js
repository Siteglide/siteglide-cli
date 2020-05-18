#!/usr/bin/env node

const program = require('commander'),
	fs = require('fs'),
	prepareArchive = require('./lib/prepareArchive'),
	logger = require('./lib/logger'),
	assets = require('./lib/assets/deploy'),
	version = require('./package.json').version,
	dir = require('./lib/directories'),
	files = require('./lib/assets/files'),
	Gateway = require('./lib/proxy');

const availableDirectories = () => dir.ALLOWED.filter(fs.existsSync);

const makeArchive = (path, directory, program) => {
	if (availableDirectories().length === 0) {
		logger.Error(`At least one of ${dir.ALLOWED} directories is needed to deploy`, { hideTimestamp: true });
	}

	const releaseArchive = prepareArchive(path);
	releaseArchive.glob('**/*', { cwd: directory, ignore: ['assets/**'], prefix: directory });

	releaseArchive.finalize();

	if(program.withImages===true){
		deployAssets(program);
	}
};

const deployAssets = async(env) => {
	const assetsToDeploy = await files.getAssets();
	if (assetsToDeploy.length === 0) {
		logger.Warn('There are no assets to deploy, skipping.');
		return;
	}
	await assets.deployAssets(new Gateway(env));
};

program
	.version(version)
	.option('--with-images', 'With images, also deploys the assets/images folder')
	.option('--target <target>', 'path to archive', process.env.TARGET || '.tmp/marketplace-release.zip')
	.option('--email <email>', 'developer email', process.env.SITEGLIDE_EMAIL)
	.option('--token <token>', 'authentication token', process.env.SITEGLIDE_TOKEN)
	.option('--url <url>', 'site url', process.env.SITEGLIDE_URL)
	.parse(process.argv);

makeArchive(program.target, dir.LEGACY_APP, program);
