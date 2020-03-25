#!/usr/bin/env node

const program = require('commander'),
	fs = require('fs'),
	ora = require('ora'),
	logger = require('./lib/logger'),
	fetchAuthData = require('./lib/settings').fetchSettings,
	yaml = require('js-yaml'),
	version = require('./package.json').version,
	Gateway = require('./lib/proxy'),
	Confirm = require('./lib/confirm'),
	dir = require('./lib/directories'),
	getBinary = require('./lib/assets/getBinary');

const pullSpinner = ora({ text: 'Pulling files', stream: process.stdout, spinner: 'clock' });

program
	.version(version, '-v, --version')
	.arguments('[environment]', 'Name of environment. Example: staging')
	.option('-c --config-file <config-file>', 'config file path', '.siteglide-config')
	.action((environment, params) => {
		process.env.CONFIG_FILE_PATH = params.configFile;
		const authData = fetchAuthData(environment, program);
		const gateway = new Gateway(authData);

		Confirm('Are you sure you would like to pull? This will overwrite your local files immediately! (Y/n)\n').then(function (response) {
			if (response === 'Y') {
				pullSpinner.start();
				gateway.pull().then(async(response) => {
					const marketplace_builder_files = response.marketplace_builder_files;

					const assets = response.asset;
					var time = '?updated='+new Date().getTime();
					await Promise.all(assets.map(async function(file){
						return new Promise(async function(resolve) {
							if(
								(file.data.remote_url.indexOf('.css')>-1)||
								(file.data.remote_url.indexOf('.js')>-1)||
								(file.data.remote_url.indexOf('.scss')>-1)||
								(file.data.remote_url.indexOf('.sass')>-1)||
								(file.data.remote_url.indexOf('.less')>-1)
							){
								await getBinary(file.data.remote_url,time).then(response => {
									if(response!=='error_missing_file'){
										file.data.body = response;
										marketplace_builder_files.push(file);
										resolve();
									}
								});
							}else{
								resolve();
							}
						});
					}));

					pullSpinner.succeed();

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

					pullSpinner.stopAndPersist().succeed(`Done. Files downloaded successfully`);
				}, logger.Error);
			} else {
				logger.Error('[Cancelled] Pull command not excecuted, your files have been left untouched.');
			}
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