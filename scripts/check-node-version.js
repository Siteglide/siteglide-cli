#!/usr/bin/env node

const semver = require('semver');
const engines = require('../package.json').engines;
const logger = require('../lib/logger');
const version = engines.node;

if (!semver.satisfies(process.version, version)) {
	logger.Error(`Required node version ${version} not satisfied with current version ${process.version}.`);
}else{
	logger.Success(`Successfully installed! Please see https://siteglide.support/en/articles/3499853-introducing-siteglide-cli for more information on Siteglide CLI`)
}