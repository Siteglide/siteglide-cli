const chalk = require('chalk');
const pkg = require('../package.json');

const notifyCliUpdate = () => {
	void (async () => {
		try {
			const { default: updateNotifier } = await import('update-notifier');
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
		} catch {
			// Non-fatal: version check is optional when update-notifier fails to load.
		}
	})();
};

module.exports = notifyCliUpdate;
