/**
 * Offer git setup guidance only when Siteglide MCP config exists in the project
 * (so the user can paste a prompt and the AI can call git_status).
 */

const { hasProjectMcpConfig } = require('../ai');
const { getGitReadiness, logGitSetupHint } = require('./readiness');

/**
 * @param {{ cwd?: string, git?: ReturnType<typeof getGitReadiness> }} [opts]
 * @returns {Promise<{ offered: boolean, reason: 'git_ready' | 'awaiting_mcp' | 'offered' }>}
 */
async function maybeOfferGitSetupHint(opts = {}) {
	const cwd = opts.cwd || process.cwd();
	const git = opts.git || getGitReadiness({ cwd });

	if (git.repoInitialized) {
		return { offered: false, reason: 'git_ready' };
	}

	if (!hasProjectMcpConfig(cwd)) {
		return { offered: false, reason: 'awaiting_mcp' };
	}

	await logGitSetupHint(git);
	return { offered: true, reason: 'offered' };
}

module.exports = {
	maybeOfferGitSetupHint
};
