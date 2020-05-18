const { spawn } = require("child_process");
const ora = require("ora");

const run = () => {
	return new Promise((resolve, reject) => {
		if (process.platform !== 'darwin') {
			console.error('Non-macOS platforms not supported.');
			resolve();
			process.exit(1);
		}

		const spinner = ora('Optimizing images').start();

		const cmd = spawn("npx", [
			"imageoptim",
			'.',
			'--quality 70-85',
			'-S'
		]);

		cmd.on("exit", (code) => {
			if (code !== 0) {
				spinner.fail("Something went wrong. Use ImageOptim app directly: https://imageoptim.com/mac");
				resolve();
			}

			spinner.succeed('Images optimized');
			resolve();
		});
	});
}


module.exports = {
	run
};
