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
	dir = require('./lib/directories'),
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
  // .option('--with-images', 'With images, also pulls the assets/images folder', false)
	.action(async (environment, params) => {
		process.env.CONFIG_FILE_PATH = params.configFile;
		process.env.WITH_IMAGES = params.withImages;
		const filename = params.path;
		const exportInternalIds = params.exportInternalIds;
		const authData = fetchAuthData(environment, program, program);
		gateway = new Gateway(authData);
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
						logger.Warn(e.message);
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
			)
			.catch(e => {
				spinner.fail('Export failed');
				logger.Error(e.message);
			});
		await gateway
			.pull().then(async(response) => {
				pullSpinner.start();
				if(params.withImages){
					pullSpinner.text = 'Downloading all images and videos as well, this may take a while...';
				}
				const marketplace_builder_files = response.marketplace_builder_files;
				var assets = response.asset;
				if(!params.withImages){
					assets = assets.filter(file => file.data.physical_file_path.indexOf('assets/images/')===-1).filter(file => !file.data.physical_file_path.match(/.(jpg|jpeg|png|gif|svg)$/i));
				}
				await Promise.all(assets.map(function(file){
					return new Promise(async function(resolve) {
						getAsset(file.data.remote_url).then(response => {
							if(response!=='error_missing_file'){
								file.data.body = response.data;
								marketplace_builder_files.push(file);
							}
							resolve();
						});
					});
				}));

				marketplace_builder_files.forEach(file => {
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
							body = file.data.content;
						}else{
							body = file.data.body;
						}
						fs.writeFileSync(dir.LEGACY_APP+'/'+file.data.physical_file_path, body, logger.Error);
					}
				});

				pullSpinner.stopAndPersist().succeed(`Files downloaded into ${dir.LEGACY_APP} folder`);
			}, logger.Error);
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