#!/usr/bin/env node

const program = require('commander'),
	ora = require('ora'),
	fs = require('fs-extra'),
	logger = require('./lib/logger'),
	fetchAuthData = require('./lib/settings').fetchSettings,
	version = require('./package.json').version,
	downloadFile = require('./lib/downloadFile'),
	waitForStatus = require('./lib/data/waitForStatus'),
	Gateway = require('./lib/proxy'),
	Confirm = require('./lib/confirm'),
	getBinary = require('./lib/assets/getBinary'),
	unzip = require('./lib/unzip'),
	shell = require('shelljs'),
	path = require('path'),
	dir = require('./lib/directories');

const pullSpinner = ora({ text: 'Pulling files', stream: process.stdout, spinner: 'clock' });

program
	.version(version, '-v, --version')
	.name('siteglide-cli pull')
	.usage('<env>')
	.description('This will pull down all files from the site in to a folder named marketplace_builder within your current directory. During this process it will also overwrite any local versions of files if they already exist. If you have made any changes locally that you have not synced they WILL be overwritten.')
	.arguments('[environment]', 'Name of environment. Example: staging')
	.option('-c --config-file <config-file>', 'config file path', '.siteglide-config')
	.option('-i --ignore-assets', 'Do not download assets such as images, CSS, JS etc', false)
	.action((environment, params) => {
		process.env.CONFIG_FILE_PATH = params.configFile;
		const ignoreAssets = params.ignoreAssets;
		const authData = fetchAuthData(environment, program);
		const gateway = new Gateway(authData);
		const filename = `${dir.LEGACY_APP}.zip`;

		Confirm('Are you sure you would like to pull? This will overwrite your local files immediately! (Y/n)\n').then(async function (response) {
			if (response === 'Y') {
				pullSpinner.start();

				await gateway.pullZip().then(pullTask => {
					waitForStatus(() => gateway.pullZipStatus(pullTask.id))
						.then(pullTask => downloadFile(pullTask.zip_file.url, filename))
						.then(() => unzip(filename, dir.LEGACY_APP))
						.then(() => shell.cp('-R', `./${dir.LEGACY_APP}/app/*`, `./${dir.LEGACY_APP}`))
						.then(() => shell.rm(`./${filename}`))
						.then(() => {
							if (fs.existsSync(`./${dir.LEGACY_APP}/modules`)) {
								shell.cp('-R', `./${dir.LEGACY_APP}/modules`, `./`)
								shell.rm('-r', `./${dir.LEGACY_APP}/modules`)
							}
						})
						.then(() => shell.rm(`./${dir.LEGACY_APP}/asset_manifest.json`))
						.then(() => shell.rm('-r',`./${dir.LEGACY_APP}/app`))
						.then(() => {
							var list = fs.readdirSync(`./${dir.LEGACY_APP}`).filter(folder => fs.statSync(path.join(`./${dir.LEGACY_APP}`, folder)).isDirectory());
							for(var i = 0; i < list.length; i++) {
								var folder = path.join(`./${dir.LEGACY_APP}`, list[i]);
								try {
									fs.rmdirSync(folder);
								} catch(e) {
									if(e.code!=='ENOTEMPTY'){
										logger.Error(e);
									}
								}
							}
						})
						.then(() => {
							if(ignoreAssets){
								pullSpinner.succeed('Pulled files');
							}
						})
						.catch(error => {
							logger.Debug(error);
							pullSpinner.fail('Pull failed');
							process.exit(1);
						});
				})
					.catch(e => {
						pullSpinner.fail('Pull failed');
						logger.Error(e.message);
						process.exit(1);
					});

				if(!ignoreAssets){
					await gateway.pull().then(async(response) => {
						var asset_files = [];
						const assets = response.asset;
						var time = '?updated='+new Date().getTime();
						await Promise.all(assets.map(async function(file){
							var urlToTest = file.data.remote_url.toLowerCase();
							return new Promise(async function(resolve) {
								if(
									(urlToTest.indexOf('.css')>-1)||
									(urlToTest.indexOf('.js')>-1)||
									(urlToTest.indexOf('.scss')>-1)||
									(urlToTest.indexOf('.sass')>-1)||
									(urlToTest.indexOf('.less')>-1)||
									(urlToTest.indexOf('.txt')>-1)||
									(urlToTest.indexOf('.html')>-1)||
									(urlToTest.indexOf('.svg')>-1)||
									(urlToTest.indexOf('.map')>-1)||
									(urlToTest.indexOf('.json')>-1)||
									(urlToTest.indexOf('.htm')>-1)
								){
									await getBinary(file.data.remote_url,time).then(response => {
										if(response!=='error_missing_file'){
											file.data.body = response;
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
							fs.writeFileSync(dir.LEGACY_APP+'/'+file.data.physical_file_path, file.data.body, logger.Error);
						});
						pullSpinner.succeed('Pulled files');
					});
				}

			} else {
				logger.Error('[Cancelled] Pull command not executed, your files have been left untouched.');
			}
		});
	});

program.parse(process.argv);