/** @type {import('jest').Config} */
module.exports = {
	testMatch: ['<rootDir>/test/**/*.test.js'],
	testTimeout: 30000,
	setupFiles: ['<rootDir>/test/setup.js']
};
