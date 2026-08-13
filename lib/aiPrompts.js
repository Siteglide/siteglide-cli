/**
 * Ready-made prompts users can paste into Cursor / Claude chat.
 */

/**
 * Prompt when CLI suggests setting up git (e.g. before pull without a repo).
 * @returns {string}
 */
function buildGitSetupAiPrompt() {
	return [
		'I want to set up Git for this Siteglide project so Siteglide CLI pull/deploy safeguards work.',
		'I am already interested in doing this — please help me through it.',
		'',
		'Start by calling the Siteglide MCP tool `git_status` on this project (do not guess from the shell alone).',
		'Follow its guidance to install Git if needed, run git init, and configure user.name / user.email.',
		'Do not read or expose `.siteglide-config` secrets.'
	].join('\n');
}

/**
 * Prompt when CLI leave merge conflict markers after a merge-first pull/deploy/sync.
 * @param {{ environment: string, command?: string }} opts
 * @returns {string}
 */
function buildMergeConflictAiPrompt(opts) {
	const environment = opts.environment || 'ENV';
	const command = opts.command || 'pull';
	const baselinePath = `./.siteglide/pull/${environment}.json`;

	const lines = [
		`I used Siteglide CLI (${command}) to pull remote site files and merge them with my local code. Git merge conflict markers are left in the files.`,
		'',
		'Please help me resolve those conflicts carefully.',
		'Use the MCP `validate_code` tool to check Liquid/platformOS code after edits.',
		'',
		'Note: differences in `updated_at` (or similar last-updated timestamps) are trivial for the file\'s functionality — that date will soon be updated to a future timestamp anyway. Still, the timestamps can help with context when deciding what to keep.',
		'',
		'When — and only when — I am happy with the resolutions:',
		'1. Finish the merge and create a git commit.',
		`2. Store that commit SHA in ${baselinePath} as \`lastPullCommit\` (keep other fields in that JSON file intact).`,
		'   Reason: that SHA is the shared base for the next pull/merge, which makes future merges simpler and quieter.'
	];

	if (command === 'deploy') {
		lines.push(
			`3. Re-run Siteglide CLI deploy for environment \`${environment}\` — deploy was paused because of these conflicts; only deploy once I am happy with all resolutions.`
		);
	} else if (command === 'sync') {
		lines.push(
			'3. After the merge is finished, save the file again (or touch it) so Siteglide CLI sync can upload it — sync skipped this file while conflict markers were present.'
		);
	}

	lines.push('', 'Do not force-push or discard my local work without asking.');
	return lines.join('\n');
}

/**
 * Prompt when merge-first pull/deploy/sync stops because git index.lock stayed busy.
 * @param {{
 *   environment: string,
 *   command?: string,
 *   cwd?: string,
 *   recoveryContext?: object
 * }} opts
 * @returns {string}
 */
function buildGitLockRecoveryAiPrompt(opts) {
	const environment = opts.environment || 'ENV';
	const command = opts.command || 'pull';
	const cwd = opts.cwd || process.cwd();
	const ctx = opts.recoveryContext || {};
	const manifestPath = ctx.mergeManifestPath || `./.siteglide/merge/${environment}.json`;
	const baselinePath = `./.siteglide/pull/${environment}.json`;
	const originalBranch = ctx.originalBranch || '(see merge manifest originalBranch)';
	const tempBranch = ctx.tempBranch || '(see merge manifest tempBranch)';
	const phase = ctx.phase || 'unknown';

	const lines = [
		`Siteglide CLI ${command} used merge-first git steps, but git stayed busy (index.lock / another git process) and the CLI gave up waiting.`,
		'',
		`Project folder: ${cwd}`,
		`Environment: ${environment}`,
		`Stopped during step: ${phase}`,
		`Expected working branch: ${originalBranch}`,
		`Temporary branch (may still exist): ${tempBranch}`,
		`Merge state file: ${manifestPath}`,
		`Pull baseline file: ${baselinePath}`,
		'',
		'Please help me recover safely — I may be on the wrong branch or mid-merge.',
		'',
		'1. Call Siteglide MCP `git_status` on this project first (do not guess from shell alone).',
		'2. Check no other git process is running (IDE source control, another terminal, crashed git).',
		'3. If `.git/index.lock` exists and nothing is using git, remove that lock file only when it is stale.',
		'4. Read the merge manifest JSON above if present — it records originalBranch, tempBranch, and mergeStrategy.',
		'5. If I am on the temporary branch with remote files already pulled:',
		'   - Commit any uncommitted remote snapshot if needed.',
		'   - Checkout the original working branch.',
		'   - Merge the temporary branch (use --allow-unrelated-histories only if the manifest says orphan strategy).',
		'   - Delete the temporary branch when the merge is finished.',
		'6. If merge conflict markers appear, use MCP `validate_code` while resolving.',
		'7. When the merge is complete and I am happy with the tree, update lastPullCommit in the pull baseline JSON if appropriate.',
		'8. Re-run Siteglide CLI pull (or deploy/sync) for this environment only after git is healthy again.'
	];

	if (command === 'deploy') {
		lines.push('9. Deploy was not started — run deploy again after recovery.');
	} else if (command === 'sync') {
		lines.push('9. Sync skipped the file — save it again after recovery.');
	}

	lines.push('', 'Do not force-push or discard my local work without asking.');
	return lines.join('\n');
}

/**
 * Offer clipboard recovery prompt after merge-first stops on a busy git lock.
 *
 * @param {{
 *   environment: string,
 *   command?: string,
 *   cwd?: string,
 *   recoveryContext?: object,
 *   warnMessage?: string
 * }} opts
 * @returns {Promise<void>}
 */
async function offerGitLockRecoveryAiHelp(opts) {
	const logger = require('./logger');
	const { offerCopyAiPrompt } = require('./prompts');

	logger.Warn(
		opts.warnMessage
			|| '[git] Merge-first stopped because git stayed busy. You may be on a temporary branch — ask AI for help finishing the steps.',
		{ exit: false }
	);

	if (process.stdin.isTTY && !process.env.CI) {
		const command = opts.command || 'pull';
		await offerCopyAiPrompt(buildGitLockRecoveryAiPrompt({
			environment: opts.environment,
			command,
			cwd: opts.cwd,
			recoveryContext: opts.recoveryContext
		}), {
			confirmMessage: 'Copy AI recovery prompt to clipboard? (finish merge-first steps safely)'
		});
	}
}

/**
 * Handle merge-first failure — lock recovery vs ordinary error logging is caller-side;
 * this only adds AI recovery help when gitLockBusy is set.
 *
 * @param {{ ok?: boolean, gitLockBusy?: boolean, recoveryContext?: object }} result
 * @param {{ environment: string, command?: string, cwd?: string }} opts
 * @returns {Promise<void>}
 */
async function offerMergeFirstFailureHelp(result, opts) {
	if (result && result.gitLockBusy) {
		await offerGitLockRecoveryAiHelp(Object.assign({}, opts, {
			recoveryContext: result.recoveryContext
		}));
	}
}

/**
 * Warn about merge conflicts and optionally offer a clipboard AI prompt (TTY).
 * Only when `.siteglide/project-preferences.json` has target_audience.git
 * set to `beginner`. Skipped for `advanced` (and when unset) to avoid noise.
 *
 * @param {{ environment: string, command?: string, warnMessage: string, cwd?: string }} opts
 * @returns {Promise<void>}
 */
async function offerMergeConflictAiHelp(opts) {
	const logger = require('./logger');
	const { offerCopyAiPrompt } = require('./prompts');
	const { readProjectPreferences } = require('./projectPreferences');

	logger.Warn(opts.warnMessage, { exit: false });

	const cwd = opts.cwd || process.cwd();
	const prefs = readProjectPreferences(cwd);
	const gitLevel = prefs && prefs.target_audience && prefs.target_audience.git;
	if (gitLevel !== 'beginner') {
		return;
	}

	if (process.stdin.isTTY && !process.env.CI) {
		const command = opts.command || 'pull';
		let confirmMessage = 'Copy AI prompt to clipboard? (resolve merge conflicts with MCP validate_code)';
		if (command === 'deploy') {
			confirmMessage = 'Copy AI prompt to clipboard? (resolve merge conflicts, then re-run deploy)';
		} else if (command === 'sync') {
			confirmMessage = 'Copy AI prompt to clipboard? (resolve merge conflicts, then save again to sync)';
		}
		await offerCopyAiPrompt(buildMergeConflictAiPrompt({
			environment: opts.environment,
			command
		}), { confirmMessage });
	}
}

module.exports = {
	buildGitSetupAiPrompt,
	buildMergeConflictAiPrompt,
	buildGitLockRecoveryAiPrompt,
	offerMergeConflictAiHelp,
	offerGitLockRecoveryAiHelp,
	offerMergeFirstFailureHelp
};
