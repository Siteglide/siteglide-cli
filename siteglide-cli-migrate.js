#!/usr/bin/env node

const program = require('commander'),
	spawn = require('child_process').spawn,
	command = require('./lib/command'),
	fetchAuthData = require('./lib/settings').fetchSettings,
	logger = require('./lib/logger'),
	validate = require('./lib/validators'),
	version = require('./package.json').version,
	download = require('./lib/migration/commands/download'),
	assetURL = require('./lib/migration/commands/urls'),
	updateForms = require('./lib/migration/commands/forms'),
	optimizeJS = require('./lib/migration/commands/optimize/js'),
	optimizeCSS = require('./lib/migration/commands/optimize/css'),
	optimizeImages = require('./lib/migration/commands/optimize/Images');

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
			engv: env
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
				if (exitCode === 1)  {
					logger.Error('Deploy failed. Please check that you have the correct permissions or that your site is not locked.');
					reject(false);
				} else if (exitCode === 0) {
					resolve(true);
				}
			});
		});
	});
};

const deploy = async (env, authData, params) => {
	await uploadArchive(env);
};

program
	.version(version, '-v, --version')
	.arguments('[environment]', 'name of environment. Example: staging')
	.option('-c --config-file <config-file>', 'config file path', '.siteglide-config')
	.option('-u --url <url>', 'Existing sites URL')
	.action(async (environment, params) => {
		checkParams(params);
		process.env.CONFIG_FILE_PATH = params.configFile;
		const authData = fetchAuthData(environment,program);
		const env = Object.assign(process.env, {
			SITEGLIDE_EMAIL: authData.email,
			SITEGLIDE_TOKEN: authData.token,
			SITEGLIDE_URL: authData.url,
			SITEGLIDE_ENV: environment
		});

		await download.run({url: params.url})
		.then(async() => await assetURL.run())
		.then(async() => await updateForms.run(authData.email))
		.then(async() => await optimizeCSS.run())
		.then(async() => await optimizeJS.run())
		.then(async() => await optimizeImages.run()
			.then(() => {
				Promise.all([
					deploy(env, authData, params)
				])
				.then(() => process.exit(0))
				.catch(() => process.exit(1));
			})
		)
	});

program.parse(process.argv);
