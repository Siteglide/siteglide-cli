/**
 * Prompt for `.siteglide/user/about-me.json` target_audience at pull start when unset.
 * Mirrors Siteglide MCP `audience` questions so CLI and AI guidance stay aligned.
 */

const logger = require('./logger');
const {
	ROLE_OPTIONS,
	EXPERIENCE_OPTIONS,
	ensureProjectPreferences,
	readProjectPreferences,
	writeProjectPreferences,
	needsAudiencePrompt
} = require('./projectPreferences');

/**
 * @param {string[]} options
 * @returns {{ name: string, value: string }[]}
 */
function choiceList(options) {
	return options.map((value) => {
		return { name: value, value };
	});
}

/**
 * When target_audience is incomplete, prompt in the terminal and persist answers.
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
	let role = audience.role;
	let git = audience.git;
	let siteglideCli = audience.siteglideCli;
	let prompted = false;

	if (role == null) {
		const answer = await selectChoice(
			'Which best describes you?',
			choiceList(ROLE_OPTIONS)
		);
		if (answer === null) {
			return { cancelled: true, prompted: false, audience };
		}
		role = answer;
		prompted = true;
	}

	if (git == null) {
		const answer = await selectChoice(
			'How familiar are you with git (the local version-control tool, not GitHub)?',
			choiceList(EXPERIENCE_OPTIONS)
		);
		if (answer === null) {
			return { cancelled: true, prompted: false, audience };
		}
		git = answer;
		prompted = true;
	}

	if (siteglideCli == null) {
		const answer = await selectChoice(
			'How familiar are you with Siteglide CLI (pull, sync, deploy)?',
			choiceList(EXPERIENCE_OPTIONS)
		);
		if (answer === null) {
			return { cancelled: true, prompted: false, audience };
		}
		siteglideCli = answer;
		prompted = true;
	}

	const written = writeProjectPreferences(rootPath, { role, git, siteglideCli });
	if (prompted) {
		logger.Info('[pull] Saved your experience level to .siteglide/user/about-me.json for AI guidance.');
	}
	return {
		cancelled: false,
		prompted,
		audience: written.target_audience
	};
}

module.exports = {
	promptTargetAudienceIfNeeded
};
