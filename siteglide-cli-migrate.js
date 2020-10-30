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
	download = require('./lib/migration/commands/download'),
	assetURL = require('./lib/migration/commands/urls'),
	updateForms = require('./lib/migration/commands/forms'),
	optimizeJS = require('./lib/migration/commands/optimize/js'),
	optimizeCSS = require('./lib/migration/commands/optimize/css'),
	optimizeImages = require('./lib/migration/commands/optimize/images');

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

const deploy = async (env) => {
	await uploadArchive(env);
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
	.action(async (environment, params) => {
		checkParams(params);
		process.env.CONFIG_FILE_PATH = params.configFile;
		const optimize = params.optimization;
		const authData = fetchAuthData(environment,program);
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
					if(optimize){
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
							);
					}else{
						await download.run({url: params.url})
						.then(async() => await assetURL.run())
						.then(async() => await updateForms.run(authData.email))
						.then(() => {
							Promise.all([
								deploy(env, authData, params)
							])
								.then(() => process.exit(0))
								.catch(() => process.exit(1));
						})
					}
				});
			} else {
				logger.Error('[Cancelled] Migrate command not executed, please certify authority to continue.');
			}
		});
	});

program.parse(process.argv);
