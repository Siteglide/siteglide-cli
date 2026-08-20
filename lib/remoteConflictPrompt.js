/**
 * Shared interactive prompts for remote-mtime conflicts (sync + deploy).
 */

const { selectChoice } = require('./prompts');
const logger = require('./logger');
const { getGitReadiness } = require('./git/readiness');
const { writeConflictLog, clearConflictLog } = require('./remoteCheckConflictLog');
const { readPullBaseline } = require('./pullBaseline');
const { formatLocalDateTime } = require('./formatLocalDateTime');
const { rel } = require('./siteglidePaths');

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
 * @param {'sync'|'deploy'|'deploy_post'} opts.command
 * @param {string} opts.reason
 * @param {object[]} [opts.conflicts]
 * @param {boolean} [opts.skipRemoteCheck]
 * @param {string} [opts.cwd]
 * @returns {Promise<'continue'|'pause'|'merge_first'|'cancel'|'abort'|'skip'>}
 */
async function promptRemoteConflict(opts) {
	const cwd = opts.cwd || process.cwd();
	const git = getGitReadiness({ cwd });
	const baseline = readPullBaseline(opts.environment, cwd);
	const { readProjectPreferences } = require('./projectPreferences');
	const prefs = readProjectPreferences(cwd);
	const audience = (prefs && prefs.target_audience) || {};
	const allowForceSync = audience.git === 'advanced' && audience.siteglideCli === 'advanced';

	const first = (opts.conflicts && opts.conflicts[0]) || {};
	const logPath = writeConflictLog(opts.environment, {
		command: opts.command,
		reason: opts.reason,
		status: opts.command === 'sync' ? 'awaiting_user_decision' : 'conflict',
		awaitingUserDecision: opts.command === 'sync',
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
			? 'No last-pull timestamp for this environment. Continue may overwrite remote work.'
			: 'Remote files are newer than the local pull baseline.',
		agentGuidance: opts.command === 'sync'
			? `Human must choose on the CLI sync prompt. Advise only; see also ${rel.syncCurrentConflict}.`
			: undefined
	}, cwd);

	logger.Debug(`Conflict details written for AI agents: ${logPath}`, { exit: false });

	if (opts.skipRemoteCheck) {
		clearConflictLog(opts.environment, cwd);
		return 'continue';
	}

	const interactive = process.stdin.isTTY && !process.env.CI;
	if (!interactive) {
		logger.Error(
			'Remote conflict detected and no TTY / CI mode — refusing. Use -s / --skip-remote-check only if intentional.'
		);
		return 'abort';
	}

	if (opts.command === 'sync') {
		const first = (opts.conflicts && opts.conflicts[0]) || {};
		const when = formatRemoteUpdatedAt(first.remoteUpdatedAt);
		const fileLabel = formatSyncConflictFileLabel(first);
		const choices = [];

		if (git.repoInitialized) {
			choices.push({
				name: 'Commit, pull, and merge',
				value: 'merge_first',
				description:
					'Commit your changes, pull remote site/modules/assets on a temporary branch, merge back into your branch, then save again to sync. Resolve merge conflicts manually or with AI if needed.'
			});
		} else {
			choices.push({
				name: 'Commit, pull, and merge (requires git)',
				value: 'merge_first',
				description:
					'Needs a git repository. Ask your AI / Siteglide MCP (git_status) to help set up git first.'
			});
		}

		if (git.repoInitialized && allowForceSync) {
			choices.push({
				name: 'Sync with force',
				value: 'continue',
				description: 'This will overwrite the remote file.'
			});
		}

		choices.push(
			{
				name: 'Skip file',
				value: 'skip',
				description: 'Skip syncing this file and continue watching for other changes.'
			},
			{
				name: 'Cancel sync',
				value: 'cancel',
				description:
					'After cancelling sync, you may wish to run a pull command instead to get up to date with all changes on the site.'
			}
		);

		const answer = await selectChoice(
			`${fileLabel}\n\nDetected a possible newer version on remote site, updated ${when}. How would you like to proceed?`,
			choices
		);
		if (!answer || answer === 'cancel') {
			return 'cancel';
		}
		if (answer === 'skip') {
			return 'skip';
		}
		if (answer === 'merge_first') {
			if (!git.repoInitialized) {
				logger.Warn(
					'[Sync] Merge needs a git repository. Ask your AI / Siteglide MCP to help set up git, or choose Skip / Cancel.',
					{ exit: false }
				);
				return 'cancel';
			}
			return 'merge_first';
		}
		clearConflictLog(opts.environment, cwd);
		return 'continue';
	}

	if (opts.reason === 'missing_baseline') {
		logger.Warn(
			'No last-pull record for this environment. Sync/deploy may overwrite remote CMS edits.',
			{ exit: false }
		);
	} else {
		logConflictSample(opts.conflicts);
	}

	const choices = [];
	if (git.repoInitialized && opts.command === 'deploy') {
		choices.push({
			name: 'Merge first (recommended with git)',
			value: 'merge_first'
		});
	}
	choices.push(
		{ name: 'Continue and overwrite remote', value: 'continue' },
		{ name: 'Pause', value: 'pause' }
	);

	const answer = await selectChoice(
		'Remote files may be newer than your local baseline. How would you like to proceed?',
		choices
	);
	if (!answer || answer === 'pause') {
		return 'pause';
	}
	if (answer === 'merge_first') {
		return 'merge_first';
	}
	clearConflictLog(opts.environment, cwd);
	return 'continue';
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
	const recommendMerge = hasRisk && git.repoInitialized;

	if (hasRisk) {
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
				? 'No last-pull timestamp for this environment. Continue may overwrite remote work.'
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
	}

	const interactive = process.stdin.isTTY && !process.env.CI;
	if (!interactive) {
		if (hasRisk) {
			logger.Error(
				'Remote conflict detected and no TTY / CI mode — refusing. Use -s / --skip-remote-check only if intentional.'
			);
			return 'abort';
		}
		// Safe (or check skipped): allow non-interactive deploy without a second prompt.
		return 'continue';
	}

	let statusClause;
	if (skipped) {
		statusClause = 'the remote last-updated check was skipped (-s / --skip-remote-check)';
	} else if (hasRisk && opts.preCheck && opts.preCheck.reason === 'missing_baseline') {
		statusClause = 'we could not verify remote freshness (no last-pull record for this environment)';
	} else if (hasRisk) {
		statusClause = 'some files on the site were updated more recently than your last pull';
	} else {
		statusClause = 'it is safe to deploy based on the last-updated dates on site files';
	}

	const urlLine = opts.url ? `\nTarget: ${opts.url}` : '';
	const message =
		`Partial deploy will copy all local files (in marketplace_builder and modules folders) to the site. ` +
		`We've identified that ${statusClause}. Are you sure you want to deploy?${urlLine}`;

	const { readProjectPreferences } = require('./projectPreferences');
	const prefs = readProjectPreferences(cwd);
	const audience = (prefs && prefs.target_audience) || {};
	const allowForceDeploy = audience.git === 'advanced' && audience.siteglideCli === 'advanced';

	const envLabel = opts.environment || 'this environment';
	const choices = [];
	if (git.repoInitialized) {
		choices.push({
			name: 'Commit, pull, merge, deploy',
			value: 'merge_first',
			description: recommendMerge
				? `We can help you to resolve conflicts between the site on ${envLabel} and your current local project before you deploy. This is recommended.`
				: `Pull remote changes into a merge with your local project before deploying to ${envLabel}.`
		});
	} else {
		choices.push({
			name: 'Commit, pull, merge, deploy (requires git)',
			value: 'merge_first',
			description:
				'Needs a git repository. Ask your AI / Siteglide MCP (git_status) to help set up git first.'
		});
	}
	// Hide overwrite/continue when a conflict was detected unless the user is
	// advanced with both git and Siteglide CLI.
	if (!hasRisk || allowForceDeploy) {
		choices.push({
			name: 'Deploy anyway',
			value: 'continue',
			description: hasRisk
				? 'Overwrite remote files without merging. Only for users who understand the risk.'
				: 'Continue with deploy.'
		});
	}
	choices.push({
		name: 'Cancel deploy',
		value: 'pause',
		description: 'After cancelling, we recommend using the pull command when you\'re ready.'
	});

	const answer = await selectChoice(message, choices);
	if (!answer || answer === 'pause') {
		return 'pause';
	}
	if (answer === 'merge_first') {
		if (!git.repoInitialized) {
			logger.Warn(
				'[deploy] Merge first needs a git repository. Ask your AI / Siteglide MCP to help set up git, or choose pause.',
				{ exit: false }
			);
			return 'pause';
		}
		return 'merge_first';
	}
	if (hasRisk) {
		clearConflictLog(opts.environment, cwd);
	}
	return 'continue';
}

module.exports = {
	promptRemoteConflict,
	promptDeployConfirm,
	formatRemoteUpdatedAt,
	formatSyncConflictFileLabel
};
