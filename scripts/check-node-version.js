#!/usr/bin/env node

const semver = require('semver');
const engines = require('../package.json').engines;
const logger = require('../lib/logger');
const version = engines.node;

if (!semver.satisfies(process.version, version)) {
	logger.Error([
		`Siteglide CLI requires Node ${version} but you are running ${process.version}.`,
		'Upgrade Node, then re-run the install:',
		'  nvm install 22 && nvm use 22   (or install the current LTS from https://nodejs.org)',
		'  npm install -g @siteglide/siteglide-cli'
	].join('\n'));
}else{
	logger.Success('Successfully installed! Please see https://docs.siteglide.com/articles/1541403-introduction-to-the-command-line-interface-cli for more information on Siteglide CLI');
}