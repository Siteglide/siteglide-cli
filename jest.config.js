const nodeRunnerTests = require('./test/nodeRunnerManifest.js');

/** @type {import('jest').Config} */
module.exports = {
	testMatch: ['<rootDir>/test/**/*.test.js'],
	testPathIgnorePatterns: [
		'<rootDir>/test/integration/',
		...nodeRunnerTests.map((rel) => `<rootDir>/${rel.replace(/\\/g, '/')}`)
	],
	testTimeout: 30000,
	setupFiles: ['<rootDir>/test/setup.js']
};
