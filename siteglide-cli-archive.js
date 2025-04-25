#!/usr/bin/env node

const program = require('commander'),
	fs = require('fs'),
	prepareArchive = require('./lib/prepareArchive'),
	logger = require('./lib/logger'),
	assets = require('./lib/assets/deploy'),
	glob = require('glob'),
  settings = require('./lib/settings'),
  templates = require('./lib/templates'),
	version = require('./package.json').version,
	dir = require('./lib/directories'),
	files = require('./lib/assets/files'),
	Gateway = require('./lib/proxy');

const availableDirectories = () => dir.ALLOWED.filter(fs.existsSync);

const addModulesToArchive = (archive, withImages) => {
	if (!fs.existsSync(dir.MODULES)) return Promise.resolve(true);

	return Promise.all(
		glob.sync('*/', { cwd: dir.MODULES }).map(
			module => ( addModuleToArchive(module, archive, withImages))
		)
	);
};

const addModuleToArchive = (module, archive, withImages, pattern = '?(public|private)/**') => {
	module = module.replace('/','');
	return new Promise((resolve, reject) => {
		glob(pattern, { cwd: `${dir.MODULES}/${module}` }, (err, files) => {
			if (err) throw reject(err);
			const moduleTemplateData = templateData();

			return Promise.all(
				files
				.filter(file => {
					return !withImages || !(file.startsWith('public/assets/') || file.startsWith('private/assets'));
				})
				.map(f => {
					const path = `${dir.MODULES}/${module}/${f}`;
					return new Promise((resolve, reject) => {
						fs.lstat(path, (err, stat) => {
							if (!stat.isDirectory()) {
								archive.append(templates.fillInTemplateValues(path, moduleTemplateData), {
									name: path
								});
							}
							resolve();
						});
					});
				})
			).then(r => {
				resolve();
			})
		});
	});
};

const makeArchive = (path, directory, program) => {
	if (availableDirectories().length === 0) {
		logger.Error(`At least one of ${dir.ALLOWED} directories is needed to deploy`, { hideTimestamp: true });
	}

	const releaseArchive = prepareArchive(path);
	releaseArchive.glob('**/*', { cwd: directory, ignore: ['assets/**', '**/node_modules/**']}, { prefix: directory });

	addModulesToArchive(releaseArchive).then(r => {
		releaseArchive.finalize();
	});

	if(program.opts().withImages===true){
		deployAssets(program.opts());
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

const templateData = (module) => {
	return settings.loadSettingsFileForModule(module);
};

program
	.version(version)
	.option('--with-images', 'With images, also deploys the assets/images folder')
	.option('--target <target>', 'path to archive', process.env.TARGET || '.tmp/marketplace-release.zip')
	.option('--email <email>', 'developer email', process.env.SITEGLIDE_EMAIL)
	.option('--token <token>', 'authentication token', process.env.SITEGLIDE_TOKEN)
	.option('--url <url>', 'site url', process.env.SITEGLIDE_URL)
	.parse(process.argv);

makeArchive(program.opts().target, dir.LEGACY_APP, program);
