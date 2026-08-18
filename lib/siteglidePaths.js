/**
 * `.siteglide/` layout:
 * - `cli-settings/` — team-shareable (e.g. modules.json); not gitignored by default
 * - `IDE/` — local runtime metadata (sync, pull baselines, locks); gitignore `.siteglide/IDE/`
 */

const fs = require('fs');
const path = require('path');

const SITEGLIDE_DIR = '.siteglide';
const IDE_DIR = 'IDE';
const CLI_SETTINGS_DIR = 'cli-settings';

const SITEGLIDE_IDE_IGNORE_ENTRY = '.siteglide/IDE/';

/** @type {Set<string>} */
const migratedCwds = new Set();

const LEGACY_IDE_ENTRIES = [
	'sync',
	'pull',
	'merge',
	'command-locks',
	'remote-check',
	'git',
	'project-preferences.json'
];

/**
 * @param {...string} rest
 * @returns {string[]}
 */
function ideSegments(...rest) {
	return [SITEGLIDE_DIR, IDE_DIR, ...rest];
}

/**
 * @param {...string} rest
 * @returns {string[]}
 */
function cliSettingsSegments(...rest) {
	return [SITEGLIDE_DIR, CLI_SETTINGS_DIR, ...rest];
}

/**
 * Move pre-IDE layout (`.siteglide/<name>`) into `.siteglide/IDE/<name>` when safe.
 * @param {string} [cwd]
 */
function migrateLegacySiteglideLayout(cwd = process.cwd()) {
	const resolved = path.resolve(cwd);
	if (migratedCwds.has(resolved)) {
		return;
	}
	migratedCwds.add(resolved);

	const siteglideRoot = path.join(resolved, SITEGLIDE_DIR);
	const ideRoot = path.join(siteglideRoot, IDE_DIR);
	if (!fs.existsSync(siteglideRoot)) {
		return;
	}

	fs.mkdirSync(ideRoot, { recursive: true });

	for (const name of LEGACY_IDE_ENTRIES) {
		const legacyPath = path.join(siteglideRoot, name);
		const idePath = path.join(ideRoot, name);
		if (!fs.existsSync(legacyPath) || fs.existsSync(idePath)) {
			continue;
		}
		try {
			fs.renameSync(legacyPath, idePath);
		} catch {
			// Best-effort; new paths still work for fresh writes.
		}
	}
}

/**
 * @param {string} [cwd]
 * @param {...string} segments
 * @returns {string}
 */
function joinIde(cwd = process.cwd(), ...segments) {
	migrateLegacySiteglideLayout(cwd);
	return path.join(cwd, SITEGLIDE_DIR, IDE_DIR, ...segments);
}

/**
 * @param {string} [cwd]
 * @param {...string} segments
 * @returns {string}
 */
function joinCliSettings(cwd = process.cwd(), ...segments) {
	return path.join(cwd, SITEGLIDE_DIR, CLI_SETTINGS_DIR, ...segments);
}

/** POSIX paths for agent prompts and docs. */
const rel = {
	syncCurrentConflict: '.siteglide/IDE/sync/current-conflict.json',
	projectPreferences: '.siteglide/IDE/project-preferences.json',
	pullModulesConfig: '.siteglide/cli-settings/modules.json',
	pullBaseline: (environment) => `.siteglide/IDE/pull/${environment}.json`,
	mergeManifest: (environment) => `.siteglide/IDE/merge/${environment}.json`
};

module.exports = {
	SITEGLIDE_DIR,
	IDE_DIR,
	CLI_SETTINGS_DIR,
	SITEGLIDE_IDE_IGNORE_ENTRY,
	ideSegments,
	cliSettingsSegments,
	migrateLegacySiteglideLayout,
	joinIde,
	joinCliSettings,
	rel
};
