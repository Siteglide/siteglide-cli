/** @type {import('jest').Config} */
module.exports = {
	testMatch: ['<rootDir>/test/integration/**/*.test.js'],
	testTimeout: 300000,
	setupFiles: ['<rootDir>/test/setup.js']
};
