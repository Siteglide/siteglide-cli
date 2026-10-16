/**
 * Prompt for `../.siteglide/user/about-me.json` target_audience at pull start when unset.
 */

const logger = require('./logger');
const {
	ensureProjectPreferences,
	readProjectPreferences,
	writeProjectPreferences,
	needsAudiencePrompt
} = require('./projectPreferences');
const { normalizeExperienceLevel } = require('./experienceLevel');

const HELP_MODE_CHOICES = [
	{
		name: 'Yes — turn on additional help',
		value: 'extra help',
		description: 'CLI and AI use plainer language and optional clipboard prompts for git and Siteglide CLI.'
	},
	{
		name: 'No — I\'m familiar with Siteglide CLI and git',
		value: 'familiar',
		description: 'Use normal terminology unless you ask for more detail.'
	}
];

/**
 * When target_audience experience is incomplete, prompt once and persist git + siteglideCli together.
 * @param {string} [rootPath]
 * @returns {Promise<{
 *   cancelled: boolean,
 *   prompted: boolean,
 *   audience: { role: string|null, git: string|null, siteglideCli: string|null }
 * }>}
 */
async function promptTargetAudienceIfNeeded(rootPath = process.cwd()) {
	ensureProjectPreferences(rootPath);
	const prefs = readProjectPreferences(rootPath);
	const audience = prefs && prefs.target_audience
		? prefs.target_audience
		: { role: null, git: null, siteglideCli: null };

	if (!needsAudiencePrompt(audience)) {
		return { cancelled: false, prompted: false, audience };
	}

	if (!process.stdin.isTTY || process.env.CI) {
		return { cancelled: false, prompted: false, audience };
	}

	const { selectChoice } = require('./prompts');
	const answer = await selectChoice(
		'Would you like additional help mode turned on?',
		HELP_MODE_CHOICES
	);
	if (answer === null) {
		return { cancelled: true, prompted: false, audience };
	}
	const level = normalizeExperienceLevel(answer);
	if (!level) {
		return { cancelled: true, prompted: false, audience };
	}

	const written = writeProjectPreferences(rootPath, {
		git: level,
		siteglideCli: level
	});
	logger.Quiet('[pull] Saved your experience level to ../.siteglide/user/about-me.json for AI guidance.');
	return {
		cancelled: false,
		prompted: true,
		audience: written.target_audience
	};
}

module.exports = {
	promptTargetAudienceIfNeeded,
	HELP_MODE_CHOICES
};
