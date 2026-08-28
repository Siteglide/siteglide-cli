#!/usr/bin/env node

const semver = require('semver');
const engines = require('../package.json').engines;
const logger = require('../lib/logger');
const version = engines.node;

if (!semver.satisfies(process.version, version)) {
	logger.Error(`Required node version ${version} not satisfied with current version ${process.version}.`);
}else{
	logger.Success('Successfully installed! Please see https://docs.siteglide.com/articles/1541403-introduction-to-the-command-line-interface-cli for more information on Siteglide CLI');
}