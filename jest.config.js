/** @type {import('jest').Config} */
module.exports = {
	testMatch: ['<rootDir>/test/**/*.test.js'],
	testPathIgnorePatterns: [
		'<rootDir>/test/integration/',
		'<rootDir>/test/lib/siteglidePaths.test.js',
		'<rootDir>/test/lib/syncStatus.test.js',
		'<rootDir>/test/lib/commandLock.test.js'
	],
	testTimeout: 30000,
	setupFiles: ['<rootDir>/test/setup.js']
};
