#!/usr/bin/env node

const program = require('commander'),
	spawn = require('child_process').spawn,
	command = require('./lib/command'),
	fetchAuthData = require('./lib/settings').fetchSettings,
	logger = require('./lib/logger'),
	validate = require('./lib/validators'),
	version = require('./package.json').version,
	Confirm = require('./lib/confirm'),
	Gateway = require('./lib/proxy'),
	glob = require('glob'),
	download = require('./lib/migration/commands/download'),
	assetURL = require('./lib/migration/commands/urls'),
	updateForms = require('./lib/migration/commands/forms'),
	optimizeJS = require('./lib/migration/commands/optimize/js'),
	optimizeCSS = require('./lib/migration/commands/optimize/css'),
	optimizeImages = require('./lib/migration/commands/optimize/images'),
	dir = require('./lib/directories'),
	fs = require('fs'),
	archiver = require('archiver');

const checkParams = params => {
	validate.existence({
		argumentValue: params.url,
		argumentName: 'url',
		fail: program.help.bind(program)
	});
	validate.url(params.url);
};

const uploadArchive = (env,) => {
	return new Promise((resolve, reject) => {
		const archive = spawn(command('siteglide-cli-archive'), ['--with-images'], {
			stdio: 'inherit',
			withImages: true,
			env: env
		});

		archive.on('close', code => {
			if (code === 1) {
				logger.Error('Deploy failed.');
				reject();
			}

			const push = spawn(command('siteglide-cli-push'), [], {
				stdio: 'inherit',
				env: env
			});

			push.on('close', exitCode => {
				if (exitCode === 1) {
					logger.Error('Deploy failed. Please check that you have the correct permissions and your site is not locked or creating.');
					reject(false);
				} else if (exitCode === 0) {
					resolve(true);
				}
			});
		});
	});
};

const deploy = async (env) => {
	await uploadArchive(env);
};

const makeArchive = (path, directory) => {
	return new Promise((resolve, reject) => {
		const releaseArchive = prepareArchive(path);
		if (path ==='./.tmp/assets.zip'){
			releaseArchive.glob('**/**', { cwd: `${directory}/assets` });
		}else{
			releaseArchive.glob('**/*', { cwd: directory, ignore: ['assets/**'] }, { prefix: directory });
		}

		releaseArchive.finalize();
		resolve(true);
	});
};


const prepareArchive = (path, verbose = true) => {
	const output = fs.createWriteStream(path);
	const archive = archiver('zip', { zlib: { level: 6 }, store: true });

	output.on('close', () => {
		if (verbose) {
			const sizeInMB = archive.pointer() / 1024 / 1024;
			if (path === './.tmp/assets.zip') {
				logger.Info(`Assets archive size: ${sizeInMB.toFixed(2)} MB`);
			} else {
				logger.Info(`Codebase archive size: ${sizeInMB.toFixed(2)} MB`);
			}
		}
	});
	archive.on('warning', err => {
		if (err.code === 'ENOENT') {
			logger.Error(err);
		} else throw err;
	});
	archive.on('error', err => {
		throw err;
	});
	archive.pipe(output);
	return archive;
};

program
	.version(version, '-v, --version')
	.name('siteglide-cli migrate')
	.usage('<env> [options]')
	.description('Download and migrate an existing site to Siteglide. This tool will scrape the existing site, download all of the publicly accessible pages and assets, compress CSS/JS/images and then deploy as a static site to Siteglide.')
	.arguments('[environment]', 'name of environment. Example: staging')
	.option('-c --config-file <config-file>', 'config file path', '.siteglide-config')
	.option('-u --url <url>', 'Existing sites URL')
	.option('-n --no-optimization', 'Do not automatically optimize assets')
	.option('-a --auto-deploy', 'Automatically deploy the site after downloading and optimizing', false)
	.option('-m --max-recursive-depth <maxRecursiveDepth>', 'Maximum allowed depth for hyperlinks', 5)
	.option('-i --ignore <ignore>', 'A pattern of urls to ignore during download', false)
	.option('--muse', 'Set if this is an Adobe Muse website')
	.action(async (environment, params) => {
		checkParams(params);
		process.env.CONFIG_FILE_PATH = params.configFile;
		const optimize = params.optimization;
		const autoDeploy = params.autoDeploy;
		const authData = fetchAuthData(environment, program);
		const gateway = new Gateway(authData);
		const env = Object.assign(process.env, {
			SITEGLIDE_EMAIL: authData.email,
			SITEGLIDE_TOKEN: authData.token,
			SITEGLIDE_URL: authData.url,
			SITEGLIDE_ENV: environment
		});

		Confirm('I certify that I own this domain or have the authority to import it from the owner. (Y/n)\n').then(async function (response) {
			if (response === 'Y') {
				await gateway.migrate({'existingSite': params.url}).then(async() => {
					if (optimize) {
						await download.run({ url: params.url, maxRecursiveDepth: params.maxRecursiveDepth, ignore: params.ignore, muse: params.muse })
							.then(async () => await assetURL.run(params))
							.then(async () => await updateForms.run(authData.email))
							.then(async () => await optimizeCSS.run())
							.then(async () => await optimizeJS.run())
							.then(async () => await optimizeImages.run()
							.then(async() => {
								if (autoDeploy) {
									logger.Info(`Starting deploy to ${authData.url}`);
									Promise.all([
										deploy(env, authData, params)
									])
										.then(() => process.exit(0))
										.catch(() => process.exit(1));
								} else {
									await makeArchive('./.tmp/assets.zip', dir.LEGACY_APP)
										.then(async () => await makeArchive('./.tmp/marketplace-release.zip', dir.LEGACY_APP))
								}
							})
						);
					} else {
						await download.run({url: params.url, maxRecursiveDepth: params.maxRecursiveDepth, ignore: params.ignore, muse: params.muse})
						.then(async () => await assetURL.run(params))
						.then(async () => await updateForms.run(authData.email)
							.then(async () => {
								if(autoDeploy){
									logger.Info(`Starting deploy to ${authData.url}`);
									Promise.all([
										deploy(env, authData, params)
									])
									.then(() => process.exit(0))
									.catch(() => process.exit(1));
								} else {
									await makeArchive('./.tmp/assets.zip', dir.LEGACY_APP)
										.then(async () => await makeArchive('./.tmp/marketplace-release.zip', dir.LEGACY_APP))
								}
							})
						);
					}
				})
			} else {
				logger.Error('[Cancelled] Migrate command not executed, please certify authority to continue.');
			}
		});
	});

program.parse(process.argv);
