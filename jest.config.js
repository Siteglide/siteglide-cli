/** @type {import('jest').Config} */
module.exports = {
	testMatch: ['<rootDir>/test/**/*.test.js'],
	testPathIgnorePatterns: ['<rootDir>/test/integration/'],
	testTimeout: 30000,
	setupFiles: ['<rootDir>/test/setup.js']
};
