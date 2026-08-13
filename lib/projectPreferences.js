/**
 * Project-level preferences under `.siteglide/project-preferences.json`.
 *
 * Created on successful pull (defaults null). MCP `audience` fills
 * role / git / siteglideCli experience after prompting. Pull never overwrites
 * values the user (or MCP) already set.
 */

const fs = require('fs');
const path = require('path');

const PREFERENCES_SEGMENTS = ['.siteglide', 'project-preferences.json'];

const ROLE_OPTIONS = [
	'designer',
	'business leader',
	'developer',
	'tester',
	'marketing',
	'seo',
	'support',
	'other'
];

const EXPERIENCE_OPTIONS = ['beginner', 'advanced'];

const EMPTY_TARGET_AUDIENCE = {
	role: null,
	git: null,
	siteglideCli: null
};

/**
 * @param {string} [cwd]
 * @returns {string}
 */
function projectPreferencesPath(cwd = process.cwd()) {
	return path.join(cwd, ...PREFERENCES_SEGMENTS);
}

/**
 * @returns {{ target_audience: { role: null, git: null, siteglideCli: null } }}
 */
function emptyPreferences() {
	return {
		target_audience: Object.assign({}, EMPTY_TARGET_AUDIENCE)
	};
}

/**
 * Read preferences; null if missing or invalid.
 * @param {string} [cwd]
 * @returns {{ target_audience: { role: string|null, git: string|null, siteglideCli: string|null } } | null}
 */
function readProjectPreferences(cwd = process.cwd()) {
	try {
		const raw = fs.readFileSync(projectPreferencesPath(cwd), 'utf8');
		const data = JSON.parse(raw);
		if (!data || typeof data !== 'object' || Array.isArray(data)) {
			return null;
		}
		const ta = data.target_audience && typeof data.target_audience === 'object'
			? data.target_audience
			: {};
		return {
			target_audience: {
				role: ta.role == null ? null : ta.role,
				git: ta.git == null ? null : ta.git,
				siteglideCli: ta.siteglideCli == null ? null : ta.siteglideCli
			}
		};
	} catch {
		return null;
	}
}

/**
 * Create the preferences file if missing; add any new null keys without clobbering set values.
 * @param {string} [cwd]
 * @returns {string} path written or already present
 */
function ensureProjectPreferences(cwd = process.cwd()) {
	const filePath = projectPreferencesPath(cwd);
	const existing = readProjectPreferences(cwd);
	const merged = emptyPreferences();
	if (existing && existing.target_audience) {
		const ta = existing.target_audience;
		if (ta.role != null) {
			merged.target_audience.role = ta.role;
		}
		if (ta.git != null) {
			merged.target_audience.git = ta.git;
		}
		if (ta.siteglideCli != null) {
			merged.target_audience.siteglideCli = ta.siteglideCli;
		}
	}
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
	return filePath;
}

module.exports = {
	ROLE_OPTIONS,
	EXPERIENCE_OPTIONS,
	projectPreferencesPath,
	emptyPreferences,
	readProjectPreferences,
	ensureProjectPreferences
};
