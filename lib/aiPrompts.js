/**
 * Ready-made prompts users can paste into Cursor / Claude chat.
 */

const { rel } = require('./siteglidePaths');
const {
	MERGE_CONFLICT_AGENT_GUIDANCE,
	MERGE_CONFLICT_CLI_WAIT_HINT,
	buildMergeConflictAiPrompt
} = require('./mergeConflictGuidance');

/**
 * Prompt when CLI suggests setting up git (e.g. before pull without a repo).
 * @returns {string}
 */
function buildGitSetupAiPrompt() {
	return [
		'I want to set up Git for this Siteglide project so Siteglide CLI pull/deploy safeguards work.',
		'I am already interested in doing this — please help me through it.',
		'',
		'First, explain to me how to enable the Siteglide MCP in my current AI agent tool (you).',
		'',
		'Call the Siteglide MCP audience tool before git setup so you know my git experience and can match how much technical language to use.',
		'Then call the Siteglide MCP tool `git_status` on this project (do not guess from the shell alone).',
		'Follow its guidance to install Git if needed, run git init, and configure user.name / user.email.',
		'Do not read or expose `.siteglide-config` secrets.'
	].join('\n');
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
	const manifestPath = ctx.mergeManifestPath || `./${rel.mergeManifest(environment)}`;
	const baselinePath = `./${rel.pullBaseline(environment)}`;
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
		'6. If merge conflict markers appear, resolve with MCP validate_code; get my approval before git add.',
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
 * Only when `.siteglide/user/about-me.json` has target_audience.git
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
			confirmMessage = 'Copy AI prompt to clipboard? (resolve merge conflicts with MCP validate_code)';
		}
		await offerCopyAiPrompt(buildMergeConflictAiPrompt({
			environment: opts.environment,
			command
		}), { confirmMessage });
	}
}

module.exports = {
	MERGE_CONFLICT_AGENT_GUIDANCE,
	MERGE_CONFLICT_CLI_WAIT_HINT,
	buildGitSetupAiPrompt,
	buildMergeConflictAiPrompt,
	buildGitLockRecoveryAiPrompt,
	offerMergeConflictAiHelp,
	offerGitLockRecoveryAiHelp,
	offerMergeFirstFailureHelp
};
