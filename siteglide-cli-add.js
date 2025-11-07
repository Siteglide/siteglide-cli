#!/usr/bin/env node

const program = require('commander'),
	fs = require('fs'),
	rl = require('readline'),
	logger = require('./lib/logger'),
	validate = require('./lib/validators'),
	version = require('./package.json').version,
	os = require('os'),
	Portal = require('./lib/portal');

const checkParams = params => {
	validate.existence({
		argumentValue: params.email,
		argumentName: 'email',
		fail: program.help.bind(program)
	});
	validate.existence({
		argumentValue: params.url,
		argumentName: 'URL',
		fail: program.help.bind(program)
	});
	validate.email(params.email);

	if (params.url.slice(-1) != '/') {
		params.url = params.url + '/';
	}

	validate.url(params.url);
};

const getPassword = () => {
	return new Promise((resolve) => {
		const reader = rl.createInterface({
			input: process.stdin,
			output: process.stdout
		});
		reader.stdoutMuted = true;
		reader.question('Password: ', password => {
			reader.close();
			resolve(password);
		});

		reader._writeToOutput = stringToWrite => {
			(reader.stdoutMuted && reader.output.write('*')) || reader.output.write(stringToWrite);
		};
	});
};

const storeEnvironment = settings => {
	const environmentSettings = {
		[settings.endpoint]: {
			url: settings.url,
			token: settings.token.api_key,
			email: settings.email
		}
	};
	saveFile(Object.assign({}, existingSettings(process.env.CONFIG_FILE_PATH), environmentSettings));
};

const saveFile = settings => {
	fs.writeFileSync(process.env.CONFIG_FILE_PATH, JSON.stringify(settings, null, 2), err => {
		if (err) throw err;
	});
};

const existingSettings = configFilePath => {
	let settings = {};

	try {
		settings = JSON.parse(fs.readFileSync(configFilePath));
	} catch (e) {
		//nothing
	}

	return settings;
};

PARTNER_PORTAL_HOST = process.env.PARTNER_PORTAL_HOST || 'https://api.siteglide.co.uk';

program
	.version(version, '-v, --version')
	.name('siteglide-cli add')
	.usage('<env> [options]')
	.description('The first time you use the CLI with a project on your device, you will need to create an environment.')
	.arguments('[environment]', 'name of environment. Example: staging')
	.option('--email <email>', 'Admin account email. Example: admin@example.com')
	.option('--url <url>', 'Site URL. Example: https://example.com')
	.option('-c --config-file <config-file>', 'config file path', '.siteglide-config')
	.action((environment, params) => {

		if(process.cwd()===os.homedir()){
			logger.Error('Error - You cannot run Siteglide CLI from your home folder.  Please make a folder such as "siteglide/site_name" and try again.')
			throw Error;
		}

		process.env.CONFIG_FILE_PATH = params.configFile;
		checkParams(params);
		const settings = {
			url: params.url,
			endpoint: environment,
			email: params.email
		};

		if(
			(!params.url.includes('platform-os.com'))&&
			(!params.url.includes('platformos.com'))&&
			(!params.url.includes('au-siteglide.com'))&&
			(!params.url.includes('uk-siteglide.com'))&&
			(!params.url.includes('us-siteglide.com'))&&
			(!params.url.includes('staging-siteglide.com'))
		){
			logger.Error('Please use the platform URL to add the environment, not the vanity URL. For example: https://my-great-site.us-siteglide.com/');
		}

		getPassword().then(password => {
			logger.Info(`\nAsking ${PARTNER_PORTAL_HOST} for access token...`);

			Portal.login(params.email, password, params.url)
				.then(response => {
					const token = response;

					if (token!==undefined) {
						storeEnvironment(Object.assign(settings, {
							token
						}));
						logger.Success(`Environment ${environment} has been added successfully for the site ${params.url}`);
					}else{
						logger.Error('Credentials correct but API Key has not been generated within Siteglide Admin.  Please visit your site in within portal to generate an API key');
					}
				})
				.catch((err) => err.statusCode==422 ? logger.Error('Authentication Failed: Your Email Address or Password are incorrect') : logger.Error('Authentication Failed: Please check that you have the correct permissions and your site is not locked or creating.'));
		});
	});

program.parse(process.argv);

validate.existence({
	argumentValue: program.args[0],
	argumentName: 'environment',
	fail: program.help.bind(program)
});
