#!/usr/bin/env node

const program = require('commander'),
	fetchAuthData = require('./lib/settings').fetchSettings,
	spawn = require('child_process').spawn,
	command = require('./lib/command'),
	logger = require('./lib/logger'),
	Confirm = require('./lib/confirm'),
	version = require('./package.json').version;

const uploadArchive = (env, withImages) => {
	return new Promise((resolve, reject) => {
		const options = withImages ? ['--with-images'] : [];
		const archive = spawn(command('siteglide-cli-archive'), options, {
			stdio: 'inherit'
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
					logger.Error('Deploy failed. Please check that you have the correct permissions or that your site is not locked.');
					reject(false);
				} else if (exitCode === 2){
					logger.Error('Deploy failed. Your sites codebase is more than 50mb, please check that all asset files are in the assets folder and not in the codebase.');
					reject(false);
				}else if (exitCode === 3) {
					logger.Error('Deploy failed. Your site contains invalid syntax, please check the error report above');
					reject(false);
				} else if (exitCode === 0) {
					resolve(true);
				}
			});
		});
	});
};

const deploy = async (env, authData, params) => {
	await uploadArchive(env, params.withAssets);
};

program
	.version(version)
	.name('siteglide-cli deploy')
	.usage('<env> [options]')
	.description('If you have made a lot of changes in your codebase, then you can use deploy to re-send all files to your site at once.  Deploy is a single command that will create a .zip  file of your site and then upload that to your website.')
	.arguments('[environment]', 'name of environment. Example: staging')
	.option('-c --config-file <config-file>', 'config file path', '.siteglide-config')
	.option('-w --with-assets', 'With assets, deploys your "assets" folder')
	.action(async (environment, params) => {
		process.env.CONFIG_FILE_PATH = params.configFile;
		process.env.WITH_IMAGES = params.withAssets;

		const authData = fetchAuthData(environment, program);

		Confirm(`Are you sure you would like to deploy to ${authData.url}? (Y/n)\n`).then(function (response) {
			if (response === 'Y') {

				const env = Object.assign(process.env, {
					SITEGLIDE_EMAIL: authData.email,
					SITEGLIDE_TOKEN: authData.token,
					SITEGLIDE_URL: authData.url,
					SITEGLIDE_ENV: environment
				});

				Promise.all([
					deploy(env, authData, params)
				])
					.then(() => process.exit(0))
					.catch(() => process.exit(1));
			} else {
				logger.Error('[Cancelled] Deploy command not executed, no files have been updated.');
			}
		});
	});

program.parse(process.argv);
