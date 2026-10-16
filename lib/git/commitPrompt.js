/**
 * One commit-message prompt for every place Merge first has to commit the user's
 * uncommitted work before pulling to a temp branch (pull, deploy, sync).
 *
 * The commit is required for correctness, not tidiness (see README "Developer notes"),
 * so the prompt explains why in help mode, offers a sensible default, and lets Ctrl+C
 * cancel so the user can commit on their own terms first.
 */

const logger = require('../logger');
const { applyCliColour } = require('../cliColour');
const { inputText } = require('../prompts');
const { audiencePromptText, wantsHelpMode } = require('../promptAudience');

const WHY_COMMIT_FIRST =
	'To merge the remote files safely, your uncommitted changes need to be committed first. '
	+ 'Press Ctrl+C to cancel and commit them yourself.';

/**
 * @param {string} environment
 * @param {string} action e.g. 'merging', 'pulling from', 'deploying to'
 * @param {{ scopePath?: string | null, now?: Date }} [opts] scopePath is only set by sync -fast mode
 * @returns {string}
 */
function defaultSnapshotMessage(environment, action, opts = {}) {
	const shortDate = (opts.now || new Date()).toISOString().slice(0, 10);
	const scope = opts.scopePath ? ` (${String(opts.scopePath).replace(/\\/g, '/')})` : '';
	return `Snapshot before ${action} ${environment}${scope} ${shortDate}`;
}

/**
 * Ask for the WIP commit message. Blank answer → default. Ctrl+C → null.
 *
 * @param {{ environment: string, action: string, cwd?: string, scopePath?: string | null }} opts
 * @returns {Promise<string | null>}
 */
async function promptCommitMessage(opts) {
	const cwd = opts.cwd || process.cwd();
	const fallback = defaultSnapshotMessage(opts.environment, opts.action, { scopePath: opts.scopePath });
	if (wantsHelpMode(cwd)) {
		logger.Info(applyCliColour('info', WHY_COMMIT_FIRST));
	}
	const message = audiencePromptText(
		'Commit message for your current work',
		'Press enter to continue',
		cwd
	);
	const answer = await inputText(message, { default: fallback });
	if (answer == null) {
		return null;
	}
	return answer.trim() || fallback;
}

module.exports = {
	WHY_COMMIT_FIRST,
	defaultSnapshotMessage,
	promptCommitMessage
};
