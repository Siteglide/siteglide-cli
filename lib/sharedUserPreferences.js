/**
 * Shared machine-local files under ../.siteglide/user/ (parent of the project root).
 */

const fs = require('fs');
const logger = require('./logger');
const { ensureProjectPreferences } = require('./projectPreferences');
const { ensureAiAgentPreferences } = require('./aiAgentPreferences');

/**
 * Migrate and ensure about-me + ai-agent-preferences under the parent .siteglide/user folder.
 * Safe on every pull (including merge-first nested pulls).
 * @param {string} [cwd]
 * @returns {Promise<{ aboutMePath: string, aiAgentPath: string, aiAgentCreated: boolean }>}
 */
async function ensureSharedUserPreferencesAfterPull(cwd = process.cwd()) {
	const aboutMePath = ensureProjectPreferences(cwd);
	const { configPath: aiAgentPath, created: aiAgentCreated } = await ensureAiAgentPreferences(cwd);

	const aboutMeOk = fs.existsSync(aboutMePath);
	const aiAgentOk = fs.existsSync(aiAgentPath);

	logger.Info(
		`[pull] Shared preferences: about-me ${aboutMeOk ? 'ok' : 'MISSING'} at ${aboutMePath.replace(/\\/g, '/')}`,
		{ exit: false }
	);
	logger.Info(
		`[pull] Shared preferences: ai-agent ${aiAgentOk ? 'ok' : 'MISSING'} at ${aiAgentPath.replace(/\\/g, '/')}` +
		(aiAgentCreated ? ' (created)' : ''),
		{ exit: false }
	);

	if (
		!aboutMeOk ||
		!aiAgentOk
	) {
		logger.Warn(
			'[pull] Shared .siteglide/user files could not be verified on disk. ' +
			'Check permissions on the parent of your project folder, or set DEBUG=1 and retry.',
			{ exit: false }
		);
	}

	return { aboutMePath, aiAgentPath, aiAgentCreated };
}

module.exports = {
	ensureSharedUserPreferencesAfterPull
};
