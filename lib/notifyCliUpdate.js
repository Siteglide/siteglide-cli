const updateNotifier = require('update-notifier');
const chalk = require('chalk');
const pkg = require('../package.json');

const notifyCliUpdate = () => {
	updateNotifier({
		pkg
	}).notify({
		isGlobal: true,
		defer: false,
		message: 'Update available ' +
			chalk.dim('{currentVersion}') +
			chalk.reset(' → ') +
			chalk.green('{latestVersion}') +
			' \nRun ' + chalk.cyan('{updateCommand}') + ' to update' +
			' \nChangelog: https://docs.siteglide.com/articles/4471977-cli-changelog'
	});
};

module.exports = notifyCliUpdate;
