#!/usr/bin/env node
const program = require('commander'),
	degit = require('degit'),
	version = require('./package.json').version,
	logger = require('./lib/logger');

program
	.version(version, '-v, --version')
	.name('siteglide-cli init')
	.description('This will create a blank folder structure within the folder you run the command, which includes all folders that are automatically created for you when making a new website on Siteglide. If these folders already exist, you will receive an error and so it will not overwrite existing files.')
	.action(async () => {
		degit('Siteglide/directory-structure#master', { force: false, cache: false, verbose: false })
			.clone('.')
			.then(() => {
				logger.Success('Directory structure sucessfully created.');
			})
			.catch(error => {
				if(error.code==='DEST_NOT_EMPTY'){
					logger.Error('Init failed: Directory structure already exists. Command cancelled and your files have been left untouched.\'');
				}
			});
	});

program.parse(process.argv);