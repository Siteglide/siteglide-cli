#!/usr/bin/env node
const program = require('commander'),
	degit = require('degit'),
	logger = require('./lib/logger');

program
	.action(async () => {
		degit('Siteglide/directory-structure#master', { force: false, cache: false, verbose: false })
			.clone('.')
			.then(() => {
				logger.Success('Directory structure sucessfully created.');
			})
			.catch(error => {
				if(error.code==='DEST_NOT_EMPTY'){
					logger.Error(`Init failed: Directory structure already exists. Command cancelled and your files have been left untouched.'`);
				};
			});
	});

program.parse(process.argv);