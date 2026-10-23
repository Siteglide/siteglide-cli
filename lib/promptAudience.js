/**
 * Resolve prompt copy from about-me help mode (git + siteglideCli kept in sync).
 */

const { readProjectPreferences } = require('./projectPreferences');
const { wantsExtraHelp } = require('./experienceLevel');

/**
 * True when either experience field is extra help (fields should match after CLI prompt).
 * @param {string} [cwd]
 * @returns {boolean}
 */
function wantsHelpMode(cwd = process.cwd()) {
	const prefs = readProjectPreferences(cwd);
	const ta = prefs && prefs.target_audience ? prefs.target_audience : {};
	return wantsExtraHelp(ta.git) || wantsExtraHelp(ta.siteglideCli);
}

/**
 * @param {string} standard
 * @param {string | undefined | null} extraHelp
 * @param {string} [cwd]
 * @returns {string}
 */
function audiencePromptText(standard, extraHelp, cwd = process.cwd()) {
	if (extraHelp && wantsHelpMode(cwd)) {
		return extraHelp;
	}
	return standard;
}

module.exports = {
	wantsHelpMode,
	audiencePromptText
};
