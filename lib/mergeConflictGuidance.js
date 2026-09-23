/**
 * Shared guidance for merge conflict resolution (CLI messages, AI clipboard prompt, sync logs).
 *
 * Neither the CLI nor the AI should git add until the user verbally approves the resolution.
 * The CLI polls git and auto-commits the merge once files are staged; it never stages for the user.
 */

/** For MCP remote_check_status / agent rules (keep in sync with Siteglide-MCP). */
const MERGE_CONFLICT_AGENT_GUIDANCE =
	'Resolve conflict markers and explain the result. Do not git add or git commit until the user verbally approves. ' +
	'After approval, git add each resolved file; Siteglide CLI auto-commits the merge when everything is staged. ' +
	'On sync, upload resumes automatically after merge complete — no need to re-save the file.';

/** Short line appended to CLI Warn when merge-first leaves conflicts open. */
const MERGE_CONFLICT_CLI_WAIT_HINT =
	'Resolve markers with AI help, approve the result, then git add each file — CLI finishes the merge commit when staged.';

/**
 * Clipboard prompt for merge-first pull / deploy / sync conflicts.
 * @param {{ environment?: string, command?: string }} [opts]
 * @returns {string}
 */
function buildMergeConflictAiPrompt(opts = {}) {
	const command = opts.command || 'pull';
	const environment = opts.environment || 'ENV';

	const lines = [
		`Siteglide CLI (${command}) started a merge and left conflict markers in my files.`,
		'',
		'Help me resolve the conflicts. Use MCP validate_code on Liquid/platformOS files after edits.',
		'Timestamp-only differences (e.g. updated_at) are not important — pick either side.',
		'',
		'1. Remove conflict markers and summarize what you kept.',
		'2. Ask for my explicit approval before any git add or git commit.',
		'3. Only after I approve: git add each resolved file (do not commit — CLI auto-commits when staged).'
	];

	if (command === 'sync') {
		lines.push('4. After CLI reports merge complete, sync should upload automatically.');
	} else if (command === 'deploy') {
		lines.push(`4. After merge complete, re-run deploy for ${environment}.`);
	} else {
		lines.push('4. CLI updates the pull baseline after the merge commit.');
	}

	lines.push('', 'Do not force-push or discard my work without asking.');
	return lines.join('\n');
}

module.exports = {
	MERGE_CONFLICT_AGENT_GUIDANCE,
	MERGE_CONFLICT_CLI_WAIT_HINT,
	buildMergeConflictAiPrompt
};
