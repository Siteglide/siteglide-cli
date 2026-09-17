const fs = require('fs');
const os = require('os');
const path = require('path');

test('listEnvironments formats registered envs from config file', () => {
	const configPath = path.join(os.tmpdir(), `sg-env-${Date.now()}.json`);
	fs.writeFileSync(configPath, JSON.stringify({
		staging: {
			url: 'https://example.staging.siteglide.com/',
			email: 'admin@example.com',
			token: 'secret'
		}
	}));

	const previousConfigPath = process.env.CONFIG_FILE_PATH;
	process.env.CONFIG_FILE_PATH = configPath;

	try {
		jest.resetModules();
		const { listEnvironments } = require('../../lib/settings');
		expect(listEnvironments()).toEqual([
			'staging \thttps://example.staging.siteglide.com/'
		]);
	} finally {
		if (previousConfigPath === undefined) {
			delete process.env.CONFIG_FILE_PATH;
		} else {
			process.env.CONFIG_FILE_PATH = previousConfigPath;
		}
		fs.unlinkSync(configPath);
	}
});
