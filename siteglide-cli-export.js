#!/usr/bin/env node

const program = require('commander'),
	fs = require('fs'),
	ora = require('ora'),
	shell = require('shelljs'),
	Gateway = require('./lib/proxy'),
	logger = require('./lib/logger'),
	fetchAuthData = require('./lib/settings').fetchSettings,
	fetchFiles = require('./lib/data/fetchFiles'),
	waitForStatus = require('./lib/data/waitForStatus'),
	getAsset = require('./lib/assets/getAsset'),
	getBinary = require('./lib/assets/getBinary'),
	downloadFile = require('./lib/downloadFile'),
	dir = require('./lib/directories'),
	Confirm = require('./lib/confirm'),
	unzip = require('./lib/unzip'),
	version = require('./package.json').version;

let gateway;
const spinner = ora({ text: 'Exporting data', stream: process.stdout, spinner: 'clock' });
const exportSpinner = ora({ text: 'Downloading files', stream: process.stdout, spinner: 'clock' });

const transform = ({ users = { results: [] }, transactables = { results: [] }, models = { results: [] } }) => {
	return {
		users: users.results,
		transactables: transactables.results,
		models: models.results
	};
};

const fetchFilesForData = async(data) => {
	data.users = await Promise.all(data.users.map(async(user) => {
		user.profiles = await Promise.all(user.profiles.map(profile => fetchFiles(profile)));
		return user;
	}));
	data.transactables = await Promise.all(data.transactables.map(model => fetchFiles(model)));
	data.models = await Promise.all(data.models.map(model => fetchFiles(model)));

	return data;
};

program
	.version(version)
	.arguments('[environment]', 'name of the environment. Example: staging')
	.option('-p --path <export-file-path>', 'output for exported data', 'data.json')
	.option('-e --export-internal-ids <export-internal-ids>', 'use normal object `id` instead of `external_id` in exported json data',
		'false')
	.option('-c --config-file <config-file>', 'config file path', '.siteglide-config')
  .option('-w --with-assets', 'With assets, also pulls the assets/images and PDFs in assets/documents folder', false)
	.action(async (environment, params) => {
		process.env.CONFIG_FILE_PATH = params.configFile;
		process.env.WITH_ASSETS = params.withAssets;
		const filename = params.path;
		const exportInternalIds = params.exportInternalIds;
		const authData = fetchAuthData(environment, program, program);
		const zipFileName = `${dir.LEGACY_APP}.zip`;
		gateway = new Gateway(authData);

		Confirm('Are you sure you would like to export? This will overwrite your local files immediately! (Y/n)\n').then(async function (response) {
			if (response === 'Y') {
				await gateway.pullZip().then(pullTask => {
					waitForStatus(() => gateway.pullZipStatus(pullTask.id))
						.then(pullTask => downloadFile(pullTask.zip_file.url, zipFileName))
						.then(() => unzip(zipFileName, dir.LEGACY_APP))
						.then(() => shell.mv(`./${dir.LEGACY_APP}/app/*`, `./${dir.LEGACY_APP}`))
						.then(() => shell.rm(`./${zipFileName}`))
						.then(() => shell.rm('-r',`./${dir.LEGACY_APP}/app`))
						.then(() => {
							var list = fs.readdirSync(`./${dir.LEGACY_APP}`).filter(folder => fs.statSync(path.join(`./${dir.LEGACY_APP}`, folder)).isDirectory());
							for(var i = 0; i < list.length; i++) {
								var folder = path.join(`./${dir.LEGACY_APP}`, list[i]);
								try {
									fs.rmdirSync(folder);
								} catch(e) {
									if(e.code!=="ENOTEMPTY"){
										logger.Error(e);
									}
								}
							}
						})
						.catch(error => {
							logger.Debug(error);
							exportSpinner.fail('Export fail');
						});
				})
				.catch({ statusCode: 404 }, (e) => {
					exportSpinner.fail('Export failed');
				})
				.catch(e => {
					logger.Error(e.message);
					exportSpinner.fail('Export failed');
				});

				await gateway
					.pull().then(async(response) => {
						exportSpinner.start();
						if(params.withAssets){
							exportSpinner.text = 'Downloading all images and videos as well, this may take a while...';
						}
						var assets = response.asset;
						if(!params.withAssets){
							assets = assets.filter(file => (file.data.physical_file_path.indexOf('assets/images/')===-1||file.data.physical_file_path.indexOf('assets/documents/')===-1)).filter(file => !file.data.physical_file_path.match(/.(jpg|jpeg|png|gif|svg|pdf|mp3|mp4|mov|ogg|otf|ttf|webm|webp|woff|woff2|ico|ppt|pptx|doc|docx|xls|xlsx|pages|numbers|key|zip|csv)$/i));
						}
						assets = assets.filter(file => !file.data.physical_file_path.includes('/.keep')).filter(file => !file.data.physical_file_path.includes('_sgthumb'));
						var count = 0;
						var asset_files = [];
						var time = '?updated='+new Date().getTime();
						for(let i = 0; i < assets.length; i++) {
							var file = assets[i];
							var urlToTest = file.data.remote_url.toLowerCase();
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
									await getBinary(file.data.remote_url,time).then(async response => {
										if(response!=='error_missing_file'){
											if(
												(file.data.physical_file_path.indexOf('.json')>-1)||
												(file.data.physical_file_path.indexOf('.map')>-1)
											){
												file.data.body = JSON.stringify(response)
											}else{
												file.data.body = response;
											}
											asset_files.push(file);
											count++;
											if(params.withAssets){
												exportSpinner.text = `Downloaded ${count} assets out of ${assets.length}, this may take a while...`;
											}
										}
									}).catch(() => exportSpinner.fail('Asset download failed'));
								}else if(
									(urlToTest.indexOf('.jpg')>-1)||
									(urlToTest.indexOf('.jpeg')>-1)||
									(urlToTest.indexOf('.png')>-1)||
									(urlToTest.indexOf('.gif')>-1)||
									(urlToTest.indexOf('.pdf')>-1)||
									(urlToTest.indexOf('.mp3')>-1)||
									(urlToTest.indexOf('.mp4')>-1)||
									(urlToTest.indexOf('.mov')>-1)||
									(urlToTest.indexOf('.ogg')>-1)||
									(urlToTest.indexOf('.otf')>-1)||
									(urlToTest.indexOf('.ttf')>-1)||
									(urlToTest.indexOf('.webm')>-1)||
									(urlToTest.indexOf('.webp')>-1)||
									(urlToTest.indexOf('.woff')>-1)||
									(urlToTest.indexOf('.woff2')>-1)||
									(urlToTest.indexOf('.ico')>-1)||
									(urlToTest.indexOf('.ppt')>-1)||
									(urlToTest.indexOf('.pptx')>-1)||
									(urlToTest.indexOf('.doc')>-1)||
									(urlToTest.indexOf('.docx')>-1)||
									(urlToTest.indexOf('.xls')>-1)||
									(urlToTest.indexOf('.xlsx')>-1)||
									(urlToTest.indexOf('.pages')>-1)||
									(urlToTest.indexOf('.numbers')>-1)||
									(urlToTest.indexOf('.key')>-1)||
									(urlToTest.indexOf('.zip')>-1)||
									(urlToTest.indexOf('.csv')>-1)
								){
									var folderPath = file.data.physical_file_path.split('/');
									folderPath = dir.LEGACY_APP+'/'+folderPath.slice(0, folderPath.length-1).join('/');
									fs.mkdirSync(folderPath, { recursive: true });
									await getAsset(file.data.remote_url,time).then(async response => {
										if(response!=='error_missing_file'){
											response.body.pipe(fs.createWriteStream(dir.LEGACY_APP+'/'+file.data.physical_file_path))
											count++;
											if(params.withAssets){
												exportSpinner.text = `Downloaded ${count} assets out of ${assets.length}, this may take a while...`;
											}
										}
									}).catch(() => exportSpinner.fail('Asset download failed'));
								}else{
									logger.Error(`Cannot download asset ${file.data.remote_url}`, {exit: false})
								}
						};

						asset_files.forEach(file => {
							var folderPath = file.data.physical_file_path.split('/');
							folderPath = dir.LEGACY_APP+'/'+folderPath.slice(0, folderPath.length-1).join('/');
							fs.mkdirSync(folderPath, { recursive: true });
							fs.writeFileSync(dir.LEGACY_APP+'/'+file.data.physical_file_path, file.data.body, logger.Error);
						});

						exportSpinner.stopAndPersist().succeed(`Files downloaded into ${dir.LEGACY_APP} folder`);
					}, logger.Error);
				} else {
					logger.Error('[Cancelled] Export command not excecuted, your files have been left untouched.');
				};
				await gateway
				.export(exportInternalIds)
				.then(exportTask => {
					spinner.start();
					waitForStatus(() => gateway.exportStatus(exportTask.id)).then(exportTask => {
						shell.mkdir('-p', '.tmp');
						fs.writeFileSync('.tmp/exported.json', JSON.stringify(exportTask.data));
						let data = transform(exportTask.data);
						fetchFilesForData(data).then(data => {
							fs.writeFileSync(filename, JSON.stringify(data));
							spinner.stopAndPersist().succeed(`Exported data to ${filename}`);
						}).catch(e => {
							logger.Warn('export error');
						});
					}).catch(error => {
						logger.Debug(error);
						spinner.fail('Export failed');
					});
				})
				.catch(
					{ statusCode: 404 },
					() => {
						spinner.fail('Export failed');
						logger.Error('[404] Data export is not supported by the server');
					}
				);
		});
	});

program.parse(process.argv);