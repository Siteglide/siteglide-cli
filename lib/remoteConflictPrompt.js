/**
 * Shared interactive prompts for remote-mtime conflicts (sync + deploy).
 */

const { selectChoice } = require('./prompts');
const logger = require('./logger');
const { applyCliColour } = require('./cliColour');
const { audiencePromptText } = require('./promptAudience');
const { getGitReadiness } = require('./git/readiness');
const { writeConflictLog, clearConflictLog } = require('./remoteCheckConflictLog');
const { readPullBaseline } = require('./pullBaseline');
const { formatLocalDateTime } = require('./formatLocalDateTime');
const { rel } = require('./siteglidePaths');

const CANCEL_SKIP_REMOTE_HINT = applyCliColour(
	'muted',
	'-s Skipping conflict checks'
);

/**
 * Human-readable remote updated_at for prompts (local timezone).
 * @param {string | null | undefined} iso
 * @returns {string}
 */
function formatRemoteUpdatedAt(iso) {
	return formatLocalDateTime(iso);
}

/**
 * Physical API path for sync conflict prompts (falls back to local path).
 * @param {{ path?: string | null, localPath?: string | null }} conflict
 * @returns {string}
 */
function formatSyncConflictFileLabel(conflict) {
	const physical = (conflict && conflict.path ? String(conflict.path) : '').replace(/\\/g, '/').trim();
	if (physical) {
		return physical;
	}
	const local = (conflict && conflict.localPath ? String(conflict.localPath) : '').replace(/\\/g, '/').trim();
	if (local) {
		return local;
	}
	return 'unknown file';
}

/**
 * @param {object} opts
 * @param {string} opts.environment
 * @param {'sync'} opts.command
 * @param {string} opts.reason
 * @param {object[]} [opts.conflicts]
 * @param {boolean} [opts.skipRemoteCheck]
 * @param {string} [opts.cwd]
 * @returns {Promise<'continue'|'pause'|'merge_first'|'cancel'|'abort'|'skip_remote_for_wave'>}
 */
async function promptRemoteConflict(opts) {
	const cwd = opts.cwd || process.cwd();
	const git = getGitReadiness({ cwd });
	const baseline = readPullBaseline(opts.environment, cwd);

	if (opts.command !== 'sync') {
		logger.Error('[remoteConflict] promptRemoteConflict supports sync only.');
		return 'abort';
	}

	const first = (opts.conflicts && opts.conflicts[0]) || {};
	const logPath = writeConflictLog(opts.environment, {
		command: opts.command,
		reason: opts.reason,
		status: 'awaiting_user_decision',
		awaitingUserDecision: true,
		conflicts: opts.conflicts || [],
		path: first.path || null,
		localPath: first.localPath || null,
		remoteUpdatedAt: first.remoteUpdatedAt || null,
		effectiveBaselineAt: first.effectiveBaselineAt || null,
		baseline: {
			lastPulledAt: baseline && baseline.lastPulledAt,
			lastDeployAt: baseline && baseline.lastDeploy && baseline.lastDeploy.deployedAt
		},
		gitInitialized: git.repoInitialized,
		consoleHint: opts.reason === 'missing_baseline'
			? 'No last-pull timestamp for this environment. Merge first or cancel.'
			: 'Remote files are newer than the local pull baseline.',
		agentGuidance: `Human must choose on the CLI sync prompt. Advise only; see also ${rel.syncCurrentConflict}.`
	}, cwd);

	logger.Debug(`Conflict details written for AI agents: ${logPath}`, { exit: false });

	if (opts.skipRemoteCheck) {
		clearConflictLog(opts.environment, cwd);
		return 'continue';
	}

	const interactive = process.stdin.isTTY && !process.env.CI;
	if (!interactive) {
		logger.Error(
			'Remote conflict detected and no TTY / CI mode — refusing. Use --skip-remote-check only if intentional.'
		);
		return 'abort';
	}

	if (opts.reason === 'missing_baseline') {
		logger.Warn(
			'No last-pull record for this environment. Sync/deploy may overwrite remote CMS edits.',
			{ exit: false }
		);
	}

	const conflictMeta = (opts.conflicts && opts.conflicts[0]) || {};
	const when = formatRemoteUpdatedAt(conflictMeta.remoteUpdatedAt);
	const fileLabel = formatSyncConflictFileLabel(conflictMeta);
	const choices = [];

	if (git.repoInitialized) {
		choices.push({
			name: audiencePromptText('Merge and sync', 'Merge and sync (recommended)', cwd),
			value: 'merge_first',
			description: audiencePromptText(
				'Commit => Pull to a temp branch => merge back to your branch => resolve conflicts => continue sync.',
				'You\'re likely seeing this if someone changed a file on the site.\nYou might want to update your code to include their work, without losing yours.\nWe\'ll commit your current work first, then this AI-assisted process can help you get the best of both changes.',
				cwd
			)
		});
	} else {
		choices.push({
			name: 'Sync',
			value: 'skip_remote_for_wave',
			description: applyCliColour(
				'warning',
				'Warning: we strongly recommend setting up as a git repo so we fully assist you.'
			)
		});
	}

	choices.push({
		name: 'Cancel sync',
		value: 'cancel',
		description: `Stop sync for now. Run pull when ready, or ${CANCEL_SKIP_REMOTE_HINT}`
	});

	const questionStandard =
		`Detected a possible newer version of ${fileLabel} on the site, updated ${when}. How shall we proceed?`;
	const questionExtra =
		`Detected a newer version of ${fileLabel} on the site from ${when}. We can help you figure out which changes to keep. How shall we proceed?`;

	const answer = await selectChoice(
		audiencePromptText(questionStandard, questionExtra, cwd),
		choices
	);
	if (!answer || answer === 'cancel') {
		return 'cancel';
	}
	if (answer === 'skip_remote_for_wave') {
		logger.Warn(
			'[Sync] Uploading without remote conflict check for this save (same risk as --skip-remote-check).',
			{ exit: false }
		);
		return 'skip_remote_for_wave';
	}
	if (answer === 'merge_first') {
		return 'merge_first';
	}
	return 'cancel';
}

/**
 * Print a short sample of conflict paths for the console.
 * @param {object[] | undefined} conflicts
 */
function logConflictSample(conflicts) {
	const sample = (conflicts || []).slice(0, 5);
	for (const c of sample) {
		logger.Debug(
			`  ${c.path || c.physicalPath} remote=${formatLocalDateTime(c.remoteUpdatedAt)}${c.effectiveBaselineAt ? ` baseline=${formatLocalDateTime(c.effectiveBaselineAt)}` : ''}`,
			{ exit: false }
		);
	}
	if ((conflicts || []).length > 5) {
		logger.Debug(`  …and ${(conflicts || []).length - 5} more (see conflict log)`, { exit: false });
	}
}

/**
 * @param {object} opts
 * @param {string} opts.environment
 * @param {string} [opts.url] target site URL (shown for context)
 * @param {{ ok: boolean, reason?: string, conflicts?: object[] }} opts.preCheck
 * @param {boolean} [opts.skipRemoteCheck]
 * @param {string} [opts.cwd]
 * @returns {Promise<'continue'|'pause'|'merge_first'|'abort'>}
 */
async function promptDeployConfirm(opts) {
	const cwd = opts.cwd || process.cwd();
	const git = getGitReadiness({ cwd });
	const baseline = readPullBaseline(opts.environment, cwd);
	const skipped = Boolean(opts.skipRemoteCheck);
	const hasRisk = !skipped && opts.preCheck && !opts.preCheck.ok;

	if (!hasRisk) {
		return 'continue';
	}

	const reason = (opts.preCheck && opts.preCheck.reason) || 'deploy_pre';
	const logPath = writeConflictLog(opts.environment, {
		command: 'deploy',
		reason,
		conflicts: (opts.preCheck && opts.preCheck.conflicts) || [],
		baseline: {
			lastPulledAt: baseline && baseline.lastPulledAt,
			lastDeployAt: baseline && baseline.lastDeploy && baseline.lastDeploy.deployedAt
		},
		gitInitialized: git.repoInitialized,
		consoleHint: reason === 'missing_baseline'
			? 'No last-pull timestamp for this environment. Merge first or cancel deploy.'
			: 'Remote files are newer than the local pull baseline.'
	}, cwd);
	logger.Debug(`Conflict details written for AI agents: ${logPath}`, { exit: false });
	if (reason === 'missing_baseline') {
		logger.Warn(
			'No last-pull record for this environment. Deploy may overwrite remote CMS edits.',
			{ exit: false }
		);
	} else {
		logConflictSample(opts.preCheck.conflicts);
	}

	const interactive = process.stdin.isTTY && !process.env.CI;
	if (!interactive) {
		logger.Error(
			'Remote conflict detected and no TTY / CI mode — refusing. Use --skip-remote-check only if intentional.'
		);
		return 'abort';
	}

	const envLabel = opts.environment || 'this environment';
	const message =
		'It\'s been a while since you last pulled. Happy to check the site for changes before we deploy?';

	const choices = [];
	if (git.repoInitialized) {
		choices.push({
			name: audiencePromptText('Merge and deploy (recommended)', 'Merge and deploy (recommended)', cwd),
			value: 'merge_first',
			description: audiencePromptText(
				'We\'ll pull to a temporary branch and merge. Deploy will be continued once any merge conflicts are resolved and staged.',
				'We\'ll check the remote site for recent changes.\n\nIf any are found, we\'ll give you a prompt for your AI to help you decide what to keep.',
				cwd
			)
		});
	} else {
		choices.push({
			name: 'Deploy',
			value: 'continue',
			description: applyCliColour(
				'warning',
				'Deploy without checking the site for newer files (same risk as `-s` / `--skip-remote-check`). Recommend git for merge-first next time.'
			)
		});
	}
	choices.push({
		name: 'Cancel deploy',
		value: 'pause',
		description: `Stop deploy for now. Run pull when ready, or ${CANCEL_SKIP_REMOTE_HINT}`
	});

	const answer = await selectChoice(message, choices);
	if (!answer || answer === 'pause') {
		return 'pause';
	}
	if (answer === 'continue') {
		logger.Warn(
			'[deploy] Deploying without remote conflict check (same risk as --skip-remote-check).',
			{ exit: false }
		);
		return 'continue';
	}
	if (answer === 'merge_first') {
		return 'merge_first';
	}
	return 'pause';
}

module.exports = {
	promptRemoteConflict,
	promptDeployConfirm,
	formatRemoteUpdatedAt,
	formatSyncConflictFileLabel,
	CANCEL_SKIP_REMOTE_HINT
};
