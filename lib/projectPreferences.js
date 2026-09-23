/**
 * User preferences under `.siteglide/user/about-me.json`.
 *
 * Created on successful pull (defaults null). MCP `audience` fills
 * role / git / siteglideCli experience after prompting. Pull never overwrites
 * values the user (or MCP) already set.
 */

const fs = require('fs');
const path = require('path');
const { joinUser } = require('./siteglidePaths');

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
	return joinUser(cwd, 'about-me.json');
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

/**
 * @param {{ role?: string|null, git?: string|null, siteglideCli?: string|null }} audience
 * @returns {('role' | 'git' | 'siteglideCli')[]}
 */
function missingAudienceFields(audience = {}) {
	const missing = [];
	if (audience.role == null) {
		missing.push('role');
	}
	if (audience.git == null) {
		missing.push('git');
	}
	if (audience.siteglideCli == null) {
		missing.push('siteglideCli');
	}
	return missing;
}

/**
 * @param {{ role?: string|null, git?: string|null, siteglideCli?: string|null }} audience
 * @returns {boolean}
 */
function needsAudiencePrompt(audience = {}) {
	return missingAudienceFields(audience).length > 0;
}

/**
 * Merge partial audience updates into about-me.json without clobbering unset fields.
 * @param {string} [cwd]
 * @param {{ role?: string|null, git?: string|null, siteglideCli?: string|null }} audience
 * @returns {{ target_audience: { role: string|null, git: string|null, siteglideCli: string|null } }}
 */
function writeProjectPreferences(cwd = process.cwd(), audience = {}) {
	ensureProjectPreferences(cwd);
	const existing = readProjectPreferences(cwd) || emptyPreferences();
	const ta = existing.target_audience;
	const next = {
		target_audience: {
			role: audience.role !== undefined ? audience.role : ta.role,
			git: audience.git !== undefined ? audience.git : ta.git,
			siteglideCli: audience.siteglideCli !== undefined ? audience.siteglideCli : ta.siteglideCli
		}
	};
	fs.writeFileSync(projectPreferencesPath(cwd), `${JSON.stringify(next, null, 2)}\n`, 'utf8');
	return next;
}

module.exports = {
	ROLE_OPTIONS,
	EXPERIENCE_OPTIONS,
	projectPreferencesPath,
	emptyPreferences,
	readProjectPreferences,
	ensureProjectPreferences,
	missingAudienceFields,
	needsAudiencePrompt,
	writeProjectPreferences
};
