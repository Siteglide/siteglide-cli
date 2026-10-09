/**
 * `.siteglide/` layout:
 * - `project/` — team-shareable (e.g. modules.json); not gitignored by default
 * - `user/` — local runtime metadata (sync, locks, AI preferences); gitignore `.siteglide/user/`
 * - `about-me.json` — one directory above the project root (`../.siteglide/user/about-me.json`), shared across sibling projects
 */

const fs = require('fs');
const path = require('path');
const { canonicalizeTargetAudienceExperience } = require('./experienceLevel');

const SITEGLIDE_DIR = '.siteglide';
const USER_DIR = 'user';
const PROJECT_DIR = 'project';

const SITEGLIDE_USER_IGNORE_ENTRY = '.siteglide/user/';
const GITIGNORE_USER_LINE = '.siteglide/user/';
const GITIGNORE_SECRETS_LINE = '.siteglide-config';
const GITIGNORE_AGENTS_LINE = '.agents/';

/** @type {Set<string>} */
const migratedCwds = new Set();

/** @type {Set<string>} */
const migratedAboutMeCwds = new Set();

const LEGACY_USER_ENTRIES = [
	'sync',
	'pull',
	'merge',
	'command-locks',
	'remote-check',
	'git',
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

	// Experimental POC used `.siteglide/IDE/`. Move those files into `user/` once; never write there.
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

/**
 * Project-scoped path kept only for migrating legacy about-me.json.
 * @param {string} [cwd]
 * @returns {string}
 */
function legacyAboutMePath(cwd = process.cwd()) {
	migrateLegacySiteglideLayout(cwd);
	return path.join(path.resolve(cwd), SITEGLIDE_DIR, USER_DIR, 'about-me.json');
}

/**
 * Parent-of-project `.siteglide/user/about-me.json` (shared per developer machine folder).
 * @param {string} [cwd]
 * @returns {string}
 */
function joinAboutMe(cwd = process.cwd()) {
	migrateAboutMeToParent(cwd);
	return path.join(path.dirname(path.resolve(cwd)), SITEGLIDE_DIR, USER_DIR, 'about-me.json');
}

/**
 * @param {unknown} ta
 * @returns {{ role: string|null, git: string|null, siteglideCli: string|null }}
 */
function normalizeTargetAudience(ta) {
	return canonicalizeTargetAudienceExperience(ta);
}

/**
 * @param {string} filePath
 * @param {{ role: string|null, git: string|null, siteglideCli: string|null }} ta
 */
function writeAboutMeTargetAudience(filePath, ta) {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(
		filePath,
		`${JSON.stringify({ target_audience: canonicalizeTargetAudienceExperience(ta) }, null, 2)}\n`,
		'utf8'
	);
}

/**
 * @param {string} filePath
 * @returns {{ target_audience: { role: string|null, git: string|null, siteglideCli: string|null } } | null}
 */
function readAboutMeFile(filePath) {
	try {
		const raw = fs.readFileSync(filePath, 'utf8');
		const data = JSON.parse(raw);
		if (!data || typeof data !== 'object' || Array.isArray(data)) {
			return null;
		}
		return {
			target_audience: normalizeTargetAudience(data.target_audience)
		};
	} catch {
		return null;
	}
}

/**
 * Prefer primary values; fill nulls from secondary.
 * @param {{ role: string|null, git: string|null, siteglideCli: string|null }} primary
 * @param {{ role: string|null, git: string|null, siteglideCli: string|null }} secondary
 */
function mergeTargetAudience(primary, secondary) {
	return {
		role: primary.role != null ? primary.role : secondary.role,
		git: primary.git != null ? primary.git : secondary.git,
		siteglideCli: primary.siteglideCli != null ? primary.siteglideCli : secondary.siteglideCli
	};
}

/**
 * Move project-level about-me.json to the parent `.siteglide/user/` directory.
 * @param {string} [cwd]
 */
function migrateAboutMeToParent(cwd = process.cwd()) {
	const resolved = path.resolve(cwd);
	if (migratedAboutMeCwds.has(resolved)) {
		return;
	}
	migratedAboutMeCwds.add(resolved);

	const legacyPath = legacyAboutMePath(resolved);
	const parentPath = path.join(path.dirname(resolved), SITEGLIDE_DIR, USER_DIR, 'about-me.json');

	if (legacyPath === parentPath) {
		return;
	}

	const legacyExists = fs.existsSync(legacyPath);
	const parentExists = fs.existsSync(parentPath);

	if (!legacyExists) {
		return;
	}

	if (!parentExists) {
		fs.mkdirSync(path.dirname(parentPath), { recursive: true });
		try {
			fs.renameSync(legacyPath, parentPath);
		} catch {
			try {
				fs.copyFileSync(legacyPath, parentPath);
				fs.unlinkSync(legacyPath);
			} catch {
				// Best-effort; reads still fall back to the legacy path.
			}
		}
		if (fs.existsSync(parentPath)) {
			const doc = readAboutMeFile(parentPath);
			if (doc) {
				writeAboutMeTargetAudience(parentPath, doc.target_audience);
			}
		}
		return;
	}

	const merged = mergeTargetAudience(
		readAboutMeFile(parentPath)?.target_audience || normalizeTargetAudience(null),
		readAboutMeFile(legacyPath)?.target_audience || normalizeTargetAudience(null)
	);
	writeAboutMeTargetAudience(parentPath, merged);
	try {
		fs.unlinkSync(legacyPath);
	} catch {
		// Parent copy is authoritative.
	}
}

/** POSIX paths for agent prompts and docs. */
const rel = {
	syncStatusDir: '.siteglide/user/sync',
	syncCurrentConflict: '.siteglide/user/sync/current-conflict.json',
	commandLocksDir: '.siteglide/user/command-locks',
	remoteCheckDir: '.siteglide/user/remote-check',
	pullBaselineDir: '.siteglide/user/pull',
	mergeDir: '.siteglide/user/merge',
	stashConflictLog: '.siteglide/user/git/last-stash-conflict.json',
	pullModulesConfig: '.siteglide/project/modules.json',
	sourceOfTruthConfig: '.siteglide/project/sourceOfTruth.json',
	aboutMe: '../.siteglide/user/about-me.json',
	aiAgentPreferences: '.siteglide/user/ai-agent-preferences.json',
	gitignoreUser: GITIGNORE_USER_LINE,
	gitignoreSecrets: GITIGNORE_SECRETS_LINE,
	gitignoreAgents: GITIGNORE_AGENTS_LINE,
	/**
	 * Per-environment pull baseline JSON (POSIX path for prompts/docs).
	 * @param {string} environment
	 * @returns {string}
	 */
	pullBaseline(environment) {
		return `${this.pullBaselineDir}/${environment}.json`;
	},
	/**
	 * Per-environment merge-first manifest JSON (POSIX path for prompts/docs).
	 * @param {string} environment
	 * @returns {string}
	 */
	mergeManifest(environment) {
		return `${this.mergeDir}/${environment}.json`;
	}
};

module.exports = {
	SITEGLIDE_DIR,
	USER_DIR,
	PROJECT_DIR,
	SITEGLIDE_USER_IGNORE_ENTRY,
	GITIGNORE_USER_LINE,
	GITIGNORE_SECRETS_LINE,
	GITIGNORE_AGENTS_LINE,
	userSegments,
	projectSegments,
	migrateLegacySiteglideLayout,
	migrateAboutMeToParent,
	legacyAboutMePath,
	joinAboutMe,
	joinUser,
	joinProject,
	rel
};
