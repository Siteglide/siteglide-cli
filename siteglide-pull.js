#!/usr/bin/env node

const program = require('commander'),
	fs = require('fs'),
	logger = require('./lib/logger'),
	fetchAuthData = require('./lib/settings').fetchSettings,
	yaml = require('js-yaml'),
	version = require('./package.json').version,
	Gateway = require('./lib/proxy'),
	axios = require('axios'),
	Confirm = require('./lib/confirm');

program
	.version(version)
	.arguments('[environment]', 'Name of environment. Example: staging')
	.option('-c --config-file <config-file>', 'config file path', '.siteglide-config')
	.action((environment, params) => {
		process.env.CONFIG_FILE_PATH = params.configFile;
		const authData = fetchAuthData(environment, program);
		const gateway = new Gateway(authData);

		Confirm('Are you sure you would like to pull? This will overwrite ALL local files immediately! (Y/n)\n').then(function (response) {
			if (response === 'Y') {
				gateway.pull().then(async(response) => {
					const marketplace_builder_files = response.marketplace_builder_files;

					const assets = response.asset;
					await Promise.all(assets.map(async function(file){
						return new Promise(async function(resolve, reject) {
							if(
								(file.data.remote_url.indexOf('.css')>-1)||
								(file.data.remote_url.indexOf('.js')>-1)
							){
								await getAsset(file.data.remote_url).then(response => {
									if(response!=="error_missing_file"){
										file.data.body = response.data;
										marketplace_builder_files.push(file);
										resolve();
									}
								});
							}else{
								resolve();
							}
						});
					}));

					marketplace_builder_files.forEach(file => {
						logger.Info(`File: ${file.data.physical_file_path}`);
						const source = new Liquid(file.data);
						var folderPath = source.path.split('/');
						folderPath = folderPath.slice(0, folderPath.length-1).join("/");
						fs.mkdirSync(folderPath, { recursive: true });
						fs.writeFileSync(source.path, source.output, logger.Error);
					});
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
			(this.source.physical_file_path.indexOf('/partials/')>-1)||
			(this.source.physical_file_path.indexOf('assets/')===0)
		){
			return LIQUID_TEMPLATE.replace('---\nMETADATA---\n', '').replace('CONTENT', this.content)
		}else{
			return LIQUID_TEMPLATE.replace('METADATA', this.serialize(this.metadata)).replace('CONTENT', this.content);
		}
	}

	serialize(obj) {
		return yaml.safeDump(obj);
	}
}

function getAsset(path){
	return new Promise(function (resolve) {
		axios({
			method: 'GET',
			url: path+'?v='+new Date().getTime(),
		}).then(function (data) {
			resolve(data);
		}).catch(function () {
			resolve('error_missing_file');
		});
	});
}

program.parse(process.argv);