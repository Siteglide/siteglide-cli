/**
 * `.siteglide/` layout:
 * - `project/` — team-shareable (e.g. modules.json); not gitignored by default
 * - `user/` — local runtime metadata (sync, locks, AI preferences); gitignore `.siteglide/user/`
 */

const fs = require('fs');
const path = require('path');

const SITEGLIDE_DIR = '.siteglide';
const USER_DIR = 'user';
const PROJECT_DIR = 'project';

const SITEGLIDE_USER_IGNORE_ENTRY = '.siteglide/user/';
const GITIGNORE_USER_LINE = '.siteglide/user/';
const GITIGNORE_SECRETS_LINE = '.siteglide-config';

/** @type {Set<string>} */
const migratedCwds = new Set();

const LEGACY_USER_ENTRIES = [
	'sync',
	'pull',
	'merge',
	'command-locks',
	'remote-check',
	'git',
	'project-preferences.json',
	'ai-agent-preferences.json'
];

const LEGACY_IDE_DIR = 'IDE';
const LEGACY_CLI_SETTINGS_DIR = 'cli-settings';

/**
 * @param {...string} rest
 * @returns {string[]}
 */
function userSegments(...rest) {
	return [SITEGLIDE_DIR, USER_DIR, ...rest];
}

/**
 * @param {...string} rest
 * @returns {string[]}
 */
function projectSegments(...rest) {
	return [SITEGLIDE_DIR, PROJECT_DIR, ...rest];
}

/**
 * Move legacy `.siteglide/` layout into `user/` and `project/` when safe.
 * @param {string} [cwd]
 */
function migrateLegacySiteglideLayout(cwd = process.cwd()) {
	const resolved = path.resolve(cwd);
	if (migratedCwds.has(resolved)) {
		return;
	}
	migratedCwds.add(resolved);

	const siteglideRoot = path.join(resolved, SITEGLIDE_DIR);
	if (!fs.existsSync(siteglideRoot)) {
		return;
	}

	const userRoot = path.join(siteglideRoot, USER_DIR);
	const projectRoot = path.join(siteglideRoot, PROJECT_DIR);
	fs.mkdirSync(userRoot, { recursive: true });
	fs.mkdirSync(projectRoot, { recursive: true });

	for (const name of LEGACY_USER_ENTRIES) {
		moveIfAbsent(path.join(siteglideRoot, name), path.join(userRoot, name));
	}

	const legacyIdeRoot = path.join(siteglideRoot, LEGACY_IDE_DIR);
	if (fs.existsSync(legacyIdeRoot)) {
		for (const name of LEGACY_USER_ENTRIES) {
			moveIfAbsent(path.join(legacyIdeRoot, name), path.join(userRoot, name));
		}
	}

	const legacyCliSettingsRoot = path.join(siteglideRoot, LEGACY_CLI_SETTINGS_DIR);
	if (fs.existsSync(legacyCliSettingsRoot)) {
		let entries;
		try {
			entries = fs.readdirSync(legacyCliSettingsRoot);
		} catch {
			entries = [];
		}
		for (const name of entries) {
			moveIfAbsent(path.join(legacyCliSettingsRoot, name), path.join(projectRoot, name));
		}
	}
}

/**
 * @param {string} from
 * @param {string} to
 */
function moveIfAbsent(from, to) {
	if (!fs.existsSync(from) || fs.existsSync(to)) {
		return;
	}
	try {
		fs.renameSync(from, to);
	} catch {
		// Best-effort; new paths still work for fresh writes.
	}
}

/**
 * @param {string} [cwd]
 * @param {...string} segments
 * @returns {string}
 */
function joinUser(cwd = process.cwd(), ...segments) {
	migrateLegacySiteglideLayout(cwd);
	return path.join(cwd, SITEGLIDE_DIR, USER_DIR, ...segments);
}

/**
 * @param {string} [cwd]
 * @param {...string} segments
 * @returns {string}
 */
function joinProject(cwd = process.cwd(), ...segments) {
	migrateLegacySiteglideLayout(cwd);
	return path.join(cwd, SITEGLIDE_DIR, PROJECT_DIR, ...segments);
}

/** POSIX paths for agent prompts and docs. */
const rel = {
	syncStatusDir: '.siteglide/user/sync',
	commandLocksDir: '.siteglide/user/command-locks',
	pullModulesConfig: '.siteglide/project/modules.json',
	aiAgentPreferences: '.siteglide/user/ai-agent-preferences.json',
	gitignoreUser: GITIGNORE_USER_LINE,
	gitignoreSecrets: GITIGNORE_SECRETS_LINE
};

module.exports = {
	SITEGLIDE_DIR,
	USER_DIR,
	PROJECT_DIR,
	SITEGLIDE_USER_IGNORE_ENTRY,
	GITIGNORE_USER_LINE,
	GITIGNORE_SECRETS_LINE,
	userSegments,
	projectSegments,
	migrateLegacySiteglideLayout,
	joinUser,
	joinProject,
	rel
};
