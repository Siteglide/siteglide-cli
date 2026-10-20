#!/usr/bin/env node
process.noDeprecation = true;

const program = require('commander'),
	fs = require('fs'),
	ora = require('ora'),
	validate = require('./lib/validators'),
	Gateway = require('./lib/proxy'),
	ServerError = require('./lib/ServerError'),
	{ deployDebug } = require('./lib/deployDebug'),
	{ addDebugOption, applyDebugFromProgram } = require('./lib/cliDebug'),
	{ waitForReleaseStatus } = require('./lib/deploy/waitForReleaseStatus'),
	version = require('./package.json').version;

const ZIP_PATH = '.tmp/marketplace-release.zip';

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

addDebugOption(program);
program.parse(process.argv);
applyDebugFromProgram(program);

checkParams(program.opts());

const spinner = ora({ text: `Deploying codebase to: ${program.opts().url}`, stream: process.stdout }).start();

const gateway = new Gateway(program.opts());

const formData = {
	'marketplace_builder_file_body': fs.createReadStream(ZIP_PATH)
};

if (fs.existsSync(ZIP_PATH)) {
	const zipStats = fs.statSync(ZIP_PATH);
	deployDebug('zip', `${ZIP_PATH}, ${zipStats.size} bytes`);
} else {
	deployDebug('zip missing', `${ZIP_PATH} (cwd: ${process.cwd()})`);
}

const isPushError = (res) => {
	return res && typeof res === 'object' && res.error && !res.id;
};

const getDeploymentStatus = ({ id }) => {
	if (id === undefined) {
		deployDebug('push rejected', 'response had no deployment id');
		return Promise.reject(new Error('Deploy response missing id'));
	}

	return waitForReleaseStatus(
		(releaseId) => gateway.getStatus(releaseId),
		id,
		{
			onWaiting: (_response, text) => {
				if (text) {
					spinner.text = text;
				}
			},
			onTerminal: (response) => {
				if (response.status === 'error') {
					deployDebug('deployment failed', response);
				} else {
					deployDebug('deployment succeeded', response);
				}
			}
		}
	).then((response) => {
		if (process.env.SITEGLIDE_ENV) {
			spinner.stop();
		} else {
			spinner.stopAndPersist().succeed('Deploying codebase succeeded');
		}
		return response;
	}).catch((err) => {
		if (err.response) {
			spinner.fail('Deploy failed');
			ServerError.deploy(err.response);
		}
		throw err;
	});
};

gateway
	.push(formData)
	.then((res) => {
		if (res==='LIMIT_FILE_SIZE') {
			throw res;
		}

		if (isPushError(res)) {
			deployDebug('push failed', res);
			spinner.fail('Deploy failed');
			ServerError.deploy(res);
			process.exit(3);
			return;
		}

		deployDebug('push accepted', { id: res.id, status: res.status });

		getDeploymentStatus(res)
			.catch(() => {
				process.exit(3);
			});
	})
	.catch((err) => {
		deployDebug('push request failed', `${err.name}: ${err.message}`);
		spinner.fail(`Deploy failed`);
		if (err==='LIMIT_FILE_SIZE') {
			process.exit(2);
		} else {
			process.exit(1);
		}
	});
