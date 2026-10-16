/**
 * No-git overwrite confirm — shown after MCP + git setup on pull (not before).
 */

const NO_GIT_OVERWRITE_CONFIRM_MESSAGE =
	'Are you sure you would like to pull? This will overwrite your local files immediately!';

const PULL_CANCELLED_UNTOUCHED = '[Cancelled] Pull command not executed, your files have been left untouched.';

/**
 * @param {{
 *   mergeFirstSync?: boolean,
 *   repoInitialized?: boolean,
 *   assumeYes?: boolean,
 *   isInteractive?: boolean
 * }} opts
 * @returns {boolean}
 */
function shouldPromptNoGitOverwriteConfirm(opts = {}) {
	if (opts.mergeFirstSync) {
		return false;
	}
	if (opts.assumeYes || process.env.SITEGLIDE_PULL_ASSUME_YES === '1') {
		return false;
	}
	if (opts.repoInitialized) {
		return false;
	}
	if (opts.isInteractive === false) {
		return false;
	}
	return true;
}

/**
 * Prompt when no git repo (after MCP/git setup).
 *
 * @param {{
 *   cwd?: string,
 *   mergeFirstSync?: boolean,
 *   repoInitialized?: boolean,
 *   assumeYes?: boolean,
 *   confirmYesNo?: (message: string) => Promise<boolean|null>,
 *   log?: (event: string, data: object) => void,
 *   onCancel?: () => void
 * }} opts
 * @returns {Promise<boolean>} false when user declined; true when skipped or confirmed
 */
async function promptNoGitOverwriteConfirmIfNeeded(opts = {}) {
	const isInteractive = !process.env.CI && process.stdin.isTTY;
	if (
		!shouldPromptNoGitOverwriteConfirm({
			mergeFirstSync: opts.mergeFirstSync,
			repoInitialized: opts.repoInitialized,
			assumeYes: opts.assumeYes,
			isInteractive
		})
	) {
		return true;
	}

	const confirmYesNo = opts.confirmYesNo || require('../prompts').confirmYesNo;
	const log = opts.log || (() => {});
	const onCancel = opts.onCancel || (() => {
		require('../logger').Error(PULL_CANCELLED_UNTOUCHED);
	});

	log('no_git_overwrite_confirm:prompt', { cwd: opts.cwd || process.cwd() });
	const response = await confirmYesNo(NO_GIT_OVERWRITE_CONFIRM_MESSAGE);
	log('no_git_overwrite_confirm:choice', { confirmed: Boolean(response) });
	if (!response) {
		onCancel();
		return false;
	}
	return true;
}

module.exports = {
	NO_GIT_OVERWRITE_CONFIRM_MESSAGE,
	PULL_CANCELLED_UNTOUCHED,
	shouldPromptNoGitOverwriteConfirm,
	promptNoGitOverwriteConfirmIfNeeded
};
