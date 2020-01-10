#!/usr/bin/env node

const program = require('commander'),
	fs = require('fs'),
	prepareArchive = require('./lib/prepareArchive'),
	logger = require('./lib/logger'),
	version = require('./package.json').version,
	dir = require('./lib/directories');

const availableDirectories = () => dir.ALLOWED.filter(fs.existsSync);

const makeArchive = (path, directory, withImages) => {
	if (availableDirectories().length === 0) {
		logger.Error(`At least one of ${dir.ALLOWED} directories is needed to deploy`, { hideTimestamp: true });
	}

	const releaseArchive = prepareArchive(path);
	let options = { cwd: directory };
	if (withImages!==true) options.ignore = ['assets/**/*(*.gif|*.jpeg|*.jpg|*.png|*.svg|*.mp4|*.mov)'];
	releaseArchive.glob('**/*', options, { prefix: directory });

	releaseArchive.finalize();
};

program
	.version(version)
	// .option('--with-images', 'With images, also deploys the assets/images folder')
	.option('--target <target>', 'path to archive', process.env.TARGET || '.tmp/marketplace-release.zip')
	.parse(process.argv);

makeArchive(program.target, dir.LEGACY_APP, program.withImages);
