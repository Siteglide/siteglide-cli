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

const CANCEL_SKIP_REMOTE_HINT =
	'Use siteglide-cli pull <env> -s (--skip-remote-check) or deploy/sync with --skip-remote-check only if you understand the risk.';

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
 * @returns {Promise<'continue'|'pause'|'merge_first'|'cancel'|'abort'>}
 */
async function promptRemoteConflict(opts) {
	const cwd = opts.cwd || process.cwd();
	const git = getGitReadiness({ cwd });
	const baseline = readPullBaseline(opts.environment, cwd);

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
			? 'No last-pull timestamp for this environment. Merge first or cancel.'
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
			'Remote conflict detected and no TTY / CI mode — refusing. Use --skip-remote-check only if intentional.'
		);
		return 'abort';
	}

	if (opts.reason === 'missing_baseline') {
		logger.Warn(
			'No last-pull record for this environment. Sync/deploy may overwrite remote CMS edits.',
			{ exit: false }
		);
	} else if (opts.command !== 'sync') {
		logConflictSample(opts.conflicts);
	}

	if (opts.command === 'sync') {
		const conflictMeta = (opts.conflicts && opts.conflicts[0]) || {};
		const when = formatRemoteUpdatedAt(conflictMeta.remoteUpdatedAt);
		const fileLabel = formatSyncConflictFileLabel(conflictMeta);
		const choices = [];

		if (git.repoInitialized) {
			choices.push({
				name: 'Merge and sync',
				value: 'merge_first',
				description:
					'Commit your changes, pull remote site/modules/assets on a temporary branch, merge back, then save again to sync. Resolve merge conflicts manually or with AI if needed.'
			});
		} else {
			choices.push({
				name: 'Merge and sync (requires git)',
				value: 'merge_first',
				description:
					'Needs a git repository. Ask your AI / Siteglide MCP (git_status) to help set up git first.'
			});
		}

		choices.push({
			name: 'Cancel sync',
			value: 'cancel',
			description: `Stop sync for now. Run pull when ready, or ${CANCEL_SKIP_REMOTE_HINT}`
		});

		const answer = await selectChoice(
			`${fileLabel}\n\nDetected a possible newer version on remote site, updated ${when}. How would you like to proceed?`,
			choices
		);
		if (!answer || answer === 'cancel') {
			return 'cancel';
		}
		if (answer === 'merge_first') {
			if (!git.repoInitialized) {
				logger.Warn(
					'[Sync] Merge needs a git repository. Ask your AI / Siteglide MCP to help set up git, or cancel sync.',
					{ exit: false }
				);
				return 'cancel';
			}
			return 'merge_first';
		}
		return 'cancel';
	}

	const choices = [];
	if (git.repoInitialized) {
		choices.push({
			name: 'Merge and deploy',
			value: 'merge_first',
			description:
				'Pull remote changes into a merge with your local project before deploying. Resolve merge conflicts manually or with AI if needed.'
		});
	} else {
		choices.push({
			name: 'Merge and deploy (requires git)',
			value: 'merge_first',
			description:
				'Needs a git repository. Ask your AI / Siteglide MCP (git_status) to help set up git first.'
		});
	}
	choices.push({
		name: 'Cancel',
		value: 'pause',
		description: `Stop for now. Run pull when ready, or ${CANCEL_SKIP_REMOTE_HINT}`
	});

	const answer = await selectChoice(
		'Remote files may be newer than your local baseline. How would you like to proceed?',
		choices
	);
	if (!answer || answer === 'pause') {
		return 'pause';
	}
	if (answer === 'merge_first') {
		if (!git.repoInitialized) {
			logger.Warn(
				'[deploy] Merge first needs a git repository. Ask your AI / Siteglide MCP to help set up git, or cancel.',
				{ exit: false }
			);
			return 'pause';
		}
		return 'merge_first';
	}
	return 'pause';
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
	const urlLine = opts.url ? `\nTarget: ${opts.url}` : '';
	const message =
		`Partial deploy will copy local files to the site. ` +
		`Some files on ${envLabel} may be newer than your last pull.${urlLine}\n\nHow would you like to proceed?`;

	const choices = [];
	if (git.repoInitialized) {
		choices.push({
			name: 'Merge and deploy',
			value: 'merge_first',
			description:
				`Pull remote changes into a merge with your local project before deploying to ${envLabel}. Resolve merge conflicts manually or with AI if needed.`
		});
	} else {
		choices.push({
			name: 'Merge and deploy (requires git)',
			value: 'merge_first',
			description:
				'Needs a git repository. Ask your AI / Siteglide MCP (git_status) to help set up git first.'
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
	if (answer === 'merge_first') {
		if (!git.repoInitialized) {
			logger.Warn(
				'[deploy] Merge first needs a git repository. Ask your AI / Siteglide MCP to help set up git, or cancel deploy.',
				{ exit: false }
			);
			return 'pause';
		}
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
