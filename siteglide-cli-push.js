#!/usr/bin/env node

const program = require('commander'),
	fs = require('fs'),
	ora = require('ora'),
	validate = require('./lib/validators'),
	Gateway = require('./lib/proxy'),
	ServerError = require('./lib/ServerError'),
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

const spinner = ora({ text: `Deploying codebase to: ${program.url}`, stream: process.stdout }).start();

const gateway = new Gateway(program);

const formData = {
	'marketplace_builder_file_body': fs.createReadStream('.tmp/marketplace-release.zip')
};

const getDeploymentStatus = ({ id }) => {
	return new Promise((resolve, reject) => {
		if(id===undefined){
			reject();
		}
		(getStatus = () => {
			gateway.getStatus(id).then(response => {
				if (response.status==='ready_for_import') {
					setTimeout(getStatus, 2000);
				} else if (response.status==='error') {
					ServerError.deploy(response.error);
					reject();
				} else {
					spinner.stopAndPersist().succeed(`Deploying codebase succeeded`);
					resolve();
				}
			});
		})();
	});
};

gateway
	.push(formData)
	.then((res) => {
		if(res==='LIMIT_FILE_SIZE'){
			throw res;
		}
		getDeploymentStatus(res)
		.catch(() => {
			process.exit(3);
		});
	})
	.catch((err) => {
		spinner.fail(`Deploy failed`);
		if(err==='LIMIT_FILE_SIZE'){
			process.exit(2);
		}else{
			process.exit(1);
		}
	});
