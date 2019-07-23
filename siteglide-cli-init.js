#!/usr/bin/env node
const APP_DIR = 'marketplace_builder';

const program = require('commander');
const request = require('request');
const fs = require('fs');
const path = require('path');
const { mkdir, mv, rm, pwd } = require('shelljs');
const extract = require('extract-zip');
const logger = require('./lib/logger');
const validate = require('./lib/validators');
const version = require('./package.json').version;

const DEFAULT_REPO = 'https://github.com/Siteglide/directory-structure';
const DEFAULT_BRANCH = 'master';

const TMP_DIR = path.normalize(path.resolve(process.cwd(), '.tmp'));
const TMP_PATH = path.normalize(path.resolve(TMP_DIR, 'directory-structure.zip'));

const emptyTemp = () => rm('-rf', `${TMP_DIR}/*`);
const createTemp = () => mkdir('-p', TMP_DIR);
const removeTemp = () => rm('-rf', TMP_DIR);
const repoNameFrom = () => program.url.split('/').pop();
const dirExists = dir => fs.existsSync(path.join(process.cwd(), dir));
const moveStructureToDestination = branch => {
	const EXTRACTED_STRUCTURE = path.normalize(path.resolve(TMP_DIR, `${repoNameFrom()}-${branch}`, '*'));
	return mv('-f', EXTRACTED_STRUCTURE, pwd());
};

const downloadZip = ({ url, branch }) => {
	logger.Info(`Downloading folder structure...`);
	const zipfileUrl = `${url}/archive/${branch}.zip`;
	return request(zipfileUrl).pipe(fs.createWriteStream(TMP_PATH));
};

const extractZip = ({ branch }) => {
	extract(TMP_PATH, { dir: TMP_DIR }, error => {
		if (error) {
			logger.Error('Zip extraction failed. ', error);
		}

		moveStructureToDestination(branch);

		logger.Info('Siteglide Admin directory structure (marketplace_builder) created in your current folder.');

		removeTemp();
	});
};

const init = () => {
	validate.url(program.url);
	createTemp();
	emptyTemp();

	if (dirExists(APP_DIR)) {
		logger.Error('Directory structure already exists. Command cancelled, your files have been left untouched.');
	}

	downloadZip(program).on('close', () => extractZip(program));
};

program
	.version(version)
	.option('--url <url>', 'theme github repository url', DEFAULT_REPO)
	.option('--branch <branch>', 'branch where the theme is located', DEFAULT_BRANCH);

program.parse(process.argv);

init();