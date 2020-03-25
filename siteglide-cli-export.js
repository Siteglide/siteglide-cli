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
	dir = require('./lib/directories'),
	Confirm = require('./lib/confirm'),
	yaml = require('js-yaml'),
	version = require('./package.json').version;

let gateway;
const spinner = ora({ text: 'Exporting data', stream: process.stdout, spinner: 'clock' });
const pullSpinner = ora({ text: 'Downloading files', stream: process.stdout, spinner: 'clock' });

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
  .option('--with-assets', 'With assets, also pulls the assets/images and PDFs in assets/documents folder', false)
	.action(async (environment, params) => {
		process.env.CONFIG_FILE_PATH = params.configFile;
		process.env.WITH_ASSETS = params.withAssets;
		const filename = params.path;
		const exportInternalIds = params.exportInternalIds;
		const authData = fetchAuthData(environment, program, program);
		gateway = new Gateway(authData);

		Confirm('Are you sure you would like to export? This will overwrite your local files immediately! (Y/n)\n').then(async function (response) {
			if (response === 'Y') {
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
				await gateway
					.pull().then(async(response) => {
						pullSpinner.start();
						if(params.withAssets){
							pullSpinner.text = 'Downloading all images and videos as well, this may take a while...';
						}
						const marketplace_builder_files = response.marketplace_builder_files;
						var assets = response.asset;
						if(!params.withAssets){
							assets = assets.filter(file => (file.data.physical_file_path.indexOf('assets/images/')===-1||file.data.physical_file_path.indexOf('assets/documents/')===-1)).filter(file => !file.data.physical_file_path.match(/.(jpg|jpeg|png|gif|svg|pdf|mp3|mp4|mov|ogg|otf|ttf|webm|webp|woff|woff2|ico|ppt|pptx|doc|docx|xls|xlsx|pages|numbers|key|zip|csv)$/i));
						}
						assets = assets.filter(file => !file.data.physical_file_path.includes('/.keep'));
						if(assets.length>999){
							pullSpinner.fail('Error: More than 1,000 assets.  Currently export is limited to 1,000 assets per site. For this site please use `siteglide-cli pull`');
							logger.Error('[Cancelled] Export command not excecuted, your files have been left untouched.');
						}
						var count = 0;
						var time = '?updated='+new Date().getTime();
						await Promise.all(assets.map(function(file){
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
									(urlToTest.indexOf('.json')>-1)
								){
									getBinary(file.data.remote_url,time).then(async response => {
										if(response!=='error_missing_file'){
											if(
												(file.data.physical_file_path.indexOf('.json')>-1)||
												(file.data.physical_file_path.indexOf('.map')>-1)
											){
												file.body = JSON.stringify(response.body)
											}else{
												file.body = response.body;
											}
											marketplace_builder_files.push(file);
											count++;
											if(params.withAssets){
												pullSpinner.text = `Downloaded ${count} assets out of ${assets.length}, this may take a while...`;
											}
										}
										resolve();
									}).catch(() => pullSpinner.fail('Asset download failed'));
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
												pullSpinner.text = `Downloaded ${count} assets out of ${assets.length}, this may take a while...`;
											}
										}
										resolve();
									}).catch(() => pullSpinner.fail('Asset download failed'));
								}else{
									logger.Error(`Cannot download asset ${file.data.remote_url}`, {exit: false})
									resolve();
								}
							});
						}));

						marketplace_builder_files.filter(file => file.data.physical_file_path!==undefined).forEach(file => {
							if(
								(file.data.physical_file_path.indexOf('.yml')>-1)||
								(file.data.physical_file_path.indexOf('.liquid')>-1)
							){
								const source = new Liquid(file.data);
								var folderPath = source.path.split('/');
								folderPath = folderPath.slice(0, folderPath.length-1).join('/');
								fs.mkdirSync(folderPath, { recursive: true });
								fs.writeFileSync(source.path, source.output, logger.Error);
							}else{
								var folderPath = file.data.physical_file_path.split('/');
								folderPath = dir.LEGACY_APP+'/'+folderPath.slice(0, folderPath.length-1).join('/');
								fs.mkdirSync(folderPath, { recursive: true });
								var body;
								if(file.data.physical_file_path.indexOf('.graphql')>-1){
									body = file.content;
								}else{
									body = file.body;
								}
								fs.writeFileSync(dir.LEGACY_APP+'/'+file.data.physical_file_path, body, logger.Error);
							}
						});

						pullSpinner.stopAndPersist().succeed(`Files downloaded into ${dir.LEGACY_APP} folder`);
					}, logger.Error);
				} else {
					logger.Error('[Cancelled] Export command not excecuted, your files have been left untouched.');
				};
		});
	});

const LIQUID_TEMPLATE = '---\nMETADATA---\nCONTENT';

class Liquid {
	constructor(source) {
		this.source = source;
		this.content = source.content || source.body || '';
	}

	get path() {
		return `marketplace_builder/${this.source.physical_file_path}`;
	}

	get metadata() {
		const metadata = Object.assign(this.source);
		delete metadata.content;
		delete metadata.body;
		return metadata;
	}

	get output() {
		if(
			(this.source.physical_file_path.indexOf('/partials/layouts')>-1)||
			(this.source.physical_file_path.indexOf('assets/')===0)
		){
			return LIQUID_TEMPLATE.replace('---\nMETADATA---\n', '').replace('CONTENT', this.content);
		}else{
			return LIQUID_TEMPLATE.replace('METADATA', this.serialize(this.metadata)).replace('CONTENT', this.content);
		}
	}

	serialize(obj) {
		return yaml.safeDump(obj);
	}
}

program.parse(process.argv);