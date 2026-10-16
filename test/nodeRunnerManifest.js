/**
 * Unit tests that use Node's built-in test runner (`node:test`).
 * Jest must not load these files (no `test()` registration).
 * `npm test` runs them via scripts/run-node-tests.js.
 */
module.exports = [
	'test/lib/agentGitignore.test.js',
	'test/lib/agentSkillsNamespaceLink.test.js',
	'test/lib/claudeFlatSkills.test.js',
	'test/lib/cliDebug.test.js',
	'test/lib/commandLock.test.js',
	'test/lib/finalizePullBaseline.test.js',
	'test/lib/listModulesWithRetry.test.js',
	'test/lib/maybeGitSetupHint.test.js',
	'test/lib/mergeFirst.test.js',
	'test/lib/normalizeSyncResponse.test.js',
	'test/lib/parseSelectivePullOptions.test.js',
	'test/lib/prompts.test.js',
	'test/lib/pullBaselineRemoteCheck.test.js',
	'test/lib/remoteConflictPrompt.test.js',
	'test/lib/remoteMtimeQuery.test.js',
	'test/lib/serializeRemoteFile.test.js',
	'test/lib/siteglideGitignore.test.js',
	'test/lib/siteglidePaths.test.js',
	'test/lib/skipRemoteCheckForPath.test.js',
	'test/lib/syncConflictGate.test.js',
	'test/lib/syncCurrentConflict.test.js',
	'test/lib/syncFileWatcher.test.js',
	'test/lib/syncMergeFirstWatcher.test.js',
	'test/lib/syncStatus.test.js',
	'test/lib/syncUploadWave.test.js',
	'test/lib/validatePullPath.test.js',
	'test/lib/waitForMergeResolution.test.js'
];
