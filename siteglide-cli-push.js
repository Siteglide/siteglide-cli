#!/usr/bin/env node

const program = require('commander'),
	fs = require('fs'),
	{ performance } = require('perf_hooks'),
	ora = require('ora'),
	validate = require('./lib/validators'),
	Gateway = require('./lib/proxy'),
	ServerError = require('./lib/ServerError'),
	logger = require('./lib/logger'),
	version = require('./package.json').version;

const checkParams = params => {
	validate.existence({ argumentValue: params.token, argumentName: 'token', fail: program.help.bind(program) });
	validate.existence({ argumentValue: params.url, argumentName: 'url', fail: program.help.bind(program) });

	if (params.url.slice(-1) != '/') {
		params.url = params.url + '/';
	}
};

program
	.version(version)
	.option('--email <email>', 'developer email', process.env.SITEGLIDE_EMAIL)
	.option('--token <token>', 'authentication token', process.env.SITEGLIDE_TOKEN)
	.option('--url <url>', 'site url', process.env.SITEGLIDE_URL);

program.parse(process.argv);

checkParams(program);

const formatMMSS = s => (s - (s %= 60)) / 60 + (9 < s ? ':' : ':0') + s;
const duration = (t0, t1) => {
	const duration = Math.round((t1 - t0) / 1000);
	return formatMMSS(duration);
};

const t0 = performance.now();

const spinner = ora({ text: `Deploying to: ${program.url}`, stream: process.stdout, spinner: 'clock' }).start();

const gateway = new Gateway(program);

const formData = {
	'marketplace_builder_file_body': fs.createReadStream('.tmp/marketplace-release.zip')
};

const getDeploymentStatus = ({ id }) => {
	return new Promise((resolve, reject) => {
		(getStatus = () => {
			gateway.getStatus(id).then(response => {
				if (response.status==='ready_for_import') {
					setTimeout(getStatus, 2000);
				} else if (response.status==='error') {
					ServerError.deploy(response.error);
					reject();
				} else {
					resolve();
				}
			});
		})();
	});
};

gateway
	.push(formData)
	.then(getDeploymentStatus)
	.then(() => {
		const t1 = performance.now();
		spinner.stopAndPersist().succeed(`Deploy succeeded after ${duration(t0, t1)}`);
	})
	.catch(() => {
		const t1 = performance.now();
		spinner.fail(`Deploy failed after ${duration(t0, t1)}`);
		process.exit(1);
	});