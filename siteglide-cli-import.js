#!/usr/bin/env node

const program = require('commander'),
	fs = require('fs'),
	ora = require('ora'),
	shell = require('shelljs'),
	Gateway = require('./lib/proxy'),
	logger = require('./lib/logger'),
	fetchAuthData = require('./lib/settings').fetchSettings,
	transform = require('./lib/data/uploadFiles'),
	isValidJSON = require('./lib/data/isValidJSON'),
	waitForStatus = require('./lib/data/waitForStatus'),
	Confirm = require('./lib/confirm'),
	version = require('./package.json').version;


let gateway;
const spinner = ora({ text: 'Sending data', stream: process.stdout });
const tmpFileName = './tmp/data-imported.json';
PARTNER_PORTAL_HOST = process.env.PARTNER_PORTAL_HOST || 'https://partners.platform-os.com';

const logInvalidFile = (filename) => {
	return logger.Error(
		`Invalid format of ${filename}. Must be a valid json file. You can check the file using a JSON validators online: https://jsonlint.com`
	);
};

const dataImport = async(filename) => {
	const data = fs.readFileSync(filename, 'utf8');
	if (!isValidJSON(data)) return logInvalidFile(filename);

	spinner.start();
	const transformedData = await transform(JSON.parse(data));
	shell.mkdir('-p', './tmp');
	fs.writeFileSync(tmpFileName, JSON.stringify(transformedData));
	const formData = { 'marketplace_builder_file_body': fs.createReadStream(tmpFileName) };
	gateway
		.importStart(formData)
		.then((importTask) => {
			spinner.stopAndPersist().succeed('Data sent').start('Importing data');
			waitForStatus(() => gateway.importStatus(importTask.id)).then(() => {
				spinner.stopAndPersist().succeed('Import done.');
			}).catch(error => {
				logger.Debug(error);
				spinner.fail('Import failed');
			});
		})
		.catch(e => {
			spinner.fail('Import failed');
			logger.Error(e.message);
		});
};

program
	.version(version)
	.arguments('[environment]', 'name of the environment. Example: staging')
	.option('-p --path <import-file-path>', 'path of import .json file', 'data.json')
	.option('-c --config-file <config-file>', 'config file path', '.siteglide-config')
	.action((environment, params) => {
		process.env.CONFIG_FILE_PATH = params.configFile;
		const filename = params.path;
		const authData = fetchAuthData(environment, program);
		Object.assign(process.env, {
			SITEGLIDE_EMAIL: authData.email,
			SITEGLIDE_TOKEN: authData.token,
			SITEGLIDE_URL: authData.url,
			SITEGLIDE_ENV: environment
		});

		Confirm('Are you sure you would like to import data? This will update all the data on your site immediately! (Y/n)\n').then(async function (response) {
			if (response === 'Y') {
				gateway = new Gateway(authData);
				dataImport(filename);
			}
		});
	});

program.parse(process.argv);

if (!program.args.length) program.help();
