/**
 * Detect open merge / conflict markers so sync and deploy can refuse safely.
 * Prefer hasOpenGitConflicts from workingTree (shared implementation).
 */

const { hasOpenGitConflicts, detectConflictMarkerPaths } = require('./workingTree');

module.exports = {
	hasOpenGitConflicts,
	detectConflictMarkerPaths
};
