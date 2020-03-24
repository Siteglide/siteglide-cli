#!/usr/bin/env node

const program = require('commander'),
	ora = require('ora'),
	fs = require('fs'),
	logger = require('./lib/logger'),
	fetchAuthData = require('./lib/settings').fetchSettings,
	version = require('./package.json').version,
	downloadFile = require('./lib/downloadFile'),
	waitForStatus = require('./lib/data/waitForStatus'),
	Gateway = require('./lib/proxy'),
	Confirm = require('./lib/confirm'),
	getAsset = require('./lib/assets/getAsset'),
	unzip = require('./lib/unzip'),
	shell = require('shelljs'),
	dir = require('./lib/directories');

const pullSpinner = ora({ text: 'Pulling files', stream: process.stdout, spinner: 'clock' });

program
	.version(version, '-v, --version')
	.arguments('[environment]', 'Name of environment. Example: staging')
	.option('-c --config-file <config-file>', 'config file path', '.siteglide-config')
	.action((environment, params) => {
		process.env.CONFIG_FILE_PATH = params.configFile;
		const authData = fetchAuthData(environment, program);
		const gateway = new Gateway(authData);
		const filename = `${dir.LEGACY_APP}.zip`;

		Confirm('Are you sure you would like to pull? This will overwrite your local files immediately! (Y/n)\n').then(async function (response) {
			if (response === 'Y') {
				pullSpinner.start();

				// await gateway.pullZip().then(pullTask => {
					await waitForStatus(() => gateway.pullZipStatus('13535'))
						.then(pullTask => downloadFile(pullTask.zip_file.url, filename))
						.then(() => unzip(filename, dir.LEGACY_APP))
						.then(() => shell.rm('-r',`./${dir.LEGACY_APP}/marketplace_builder`))
						.then(() => fs.rename(`./${dir.LEGACY_APP}/app`, `./${dir.LEGACY_APP}/marketplace_builder`, function(err) {
							if ( err ) console.log('ERROR: ' + err);
						}))
						.then(() => shell.rm(`./${filename}`))
						.then(() => pullSpinner.succeed('Downloading files'))
						.catch(error => {
							logger.Debug(error);
							pullSpinner.fail('Export failed');
						});
				// })
				// .catch({ statusCode: 404 }, (e) => {
				// 	console.log(e);
				// 	pullSpinner.fail('Export failed');
				// 	logger.Error('[404] Data export is not supported by the server');
				// })
				// .catch(e => {
				// 	pullSpinner.fail('Export failed');
				// 	logger.Error(e.message);
				// });

				await gateway.pull().then(async(response) => {
					var asset_files = [];
					const assets = response.asset;
					await Promise.all(assets.map(async function(file){
						return new Promise(async function(resolve) {
							if(
								(file.data.remote_url.indexOf('.css')>-1)||
								(file.data.remote_url.indexOf('.js')>-1)||
								(file.data.remote_url.indexOf('.scss')>-1)||
								(file.data.remote_url.indexOf('.sass')>-1)||
								(file.data.remote_url.indexOf('.less')>-1)
							){
								await getAsset(file.data.remote_url).then(response => {
									if(response!=='error_missing_file'){
										file.data.body = response.data;
										asset_files.push(file);
										resolve();
									}
								});
							}else{
								resolve();
							}
						});
					}));
					asset_files.forEach(file => {
						var folderPath = file.data.physical_file_path.split('/');
						folderPath = dir.LEGACY_APP+'/'+folderPath.slice(0, folderPath.length-1).join('/');
						fs.mkdirSync(folderPath, { recursive: true });
						var body = file.body;
						fs.writeFileSync(dir.LEGACY_APP+'/'+file.data.physical_file_path, body, logger.Error);
					});
				});

			} else {
				logger.Error('[Cancelled] Pull command not excecuted, your files have been left untouched.');
			}
		});
	});

program.parse(process.argv);