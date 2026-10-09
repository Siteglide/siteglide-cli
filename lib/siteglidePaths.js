/**
 * `.siteglide/` layout:
 * - `project/` — team-shareable (e.g. modules.json); not gitignored by default
 * - `user/` — local runtime metadata (sync, locks, AI preferences); gitignore `.siteglide/user/`
 * - `about-me.json` and `ai-agent-preferences.json` — one directory above the project root (`../.siteglide/user/`), shared across sibling projects
 */

const fs = require('fs');
const path = require('path');
const { canonicalizeTargetAudienceExperience } = require('./experienceLevel');
const {
	formatFsError,
	ensureDirWithLog,
	logParentUserMigrationFailure,
	logParentUserMigrationPlan,
	logParentUserMigrationSuccess,
	logSharedUserPathResolutionOnce,
	warnInconsistentParentUserState
} = require('./parentUserFsLog');

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

/** @type {Set<string>} */
const migratedAiAgentPrefsCwds = new Set();

const AI_AGENT_PREFERENCES_FILE = 'ai-agent-preferences.json';

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
 * `.siteglide/user/` one directory above the resolved project root.
 * @param {string} [cwd]
 * @returns {string}
 */
function parentSiteglideUserDir(cwd = process.cwd()) {
	return path.join(path.dirname(path.resolve(cwd)), SITEGLIDE_DIR, USER_DIR);
}

/**
 * @param {string} [cwd]
 * @param {string} fileName
 * @returns {string}
 */
function parentUserJsonPath(cwd, fileName) {
	return path.join(parentSiteglideUserDir(cwd), fileName);
}

/**
 * @param {string} [cwd]
 */
function ensureParentSiteglideUserDir(cwd = process.cwd()) {
	const resolved = path.resolve(cwd);
	logSharedUserPathResolutionOnce(resolved, cwd);
	const dir = parentSiteglideUserDir(resolved);
	const result = ensureDirWithLog(dir, 'Shared .siteglide/user', { cwd });
	if (!result.ok) {
		throw new Error(`Could not create shared folder ${dir} (cwd=${path.resolve(cwd)})`);
	}
}

/**
 * Move a file into place; creates parent dirs. Does not overwrite an existing destination.
 * @param {string} from
 * @param {string} to
 * @param {string} contextLabel
 */
function moveFileSyncRobust(from, to, contextLabel) {
	if (!fs.existsSync(from)) {
		require('./logger').Debug(`[siteglide] ${contextLabel}: skip move — source missing (${from})`);
		return;
	}

	const dirResult = ensureDirWithLog(
		path.dirname(to),
		`${contextLabel} parent .siteglide/user`,
		{ cwd: process.cwd() }
	);
	if (!dirResult.ok) {
		throw new Error(`Could not create parent directory ${path.dirname(to)}`);
	}

	if (fs.existsSync(to)) {
		require('./logger').Debug(`[siteglide] ${contextLabel}: parent file already exists (${to})`);
		return;
	}

	let renameError = null;
	try {
		fs.renameSync(from, to);
		if (fs.existsSync(to)) {
			logParentUserMigrationSuccess(contextLabel, to, 'moved (rename)');
			return;
		}
	} catch (error) {
		renameError = error;
		require('./logger').Debug(
			`[siteglide] ${contextLabel}: rename failed (${formatFsError(error)}), trying copy`
		);
	}

	try {
		fs.copyFileSync(from, to);
	} catch (error) {
		const renameDetail = renameError ? formatFsError(renameError) : 'not attempted';
		throw new Error(`rename (${renameDetail}) and copy (${formatFsError(error)}) failed`);
	}

	if (!fs.existsSync(to)) {
		throw new Error(`Could not move ${from} to ${to}`);
	}
	fs.unlinkSync(from);
	logParentUserMigrationSuccess(contextLabel, to, 'moved (copy)');
}

/**
 * @param {string} resolved
 * @param {Set<string>} migratedSet
 * @param {string} legacyPath
 * @returns {boolean}
 */
function parentUserMigrationSettled(resolved, migratedSet, legacyPath) {
	if (!migratedSet.has(resolved)) {
		return false;
	}
	return !fs.existsSync(legacyPath);
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
	ensureParentSiteglideUserDir(cwd);
	return parentUserJsonPath(cwd, 'about-me.json');
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
	const dirResult = ensureDirWithLog(
		path.dirname(filePath),
		'about-me.json parent .siteglide/user',
		{ cwd: process.cwd() }
	);
	if (!dirResult.ok) {
		throw new Error(`Could not create directory for ${filePath}`);
	}
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
	const legacyPath = legacyAboutMePath(resolved);
	const parentPath = parentUserJsonPath(resolved, 'about-me.json');

	if (legacyPath === parentPath) {
		migratedAboutMeCwds.add(resolved);
		return;
	}

	if (parentUserMigrationSettled(resolved, migratedAboutMeCwds, legacyPath)) {
		if (!fs.existsSync(parentPath)) {
			warnInconsistentParentUserState('about-me.json', resolved, legacyPath, parentPath);
		}
		return;
	}

	if (!fs.existsSync(legacyPath)) {
		migratedAboutMeCwds.add(resolved);
		return;
	}

	logParentUserMigrationPlan('about-me.json', resolved, legacyPath, parentPath);

	try {
		if (!fs.existsSync(parentPath)) {
			moveFileSyncRobust(legacyPath, parentPath, 'about-me.json');
		} else {
			const merged = mergeTargetAudience(
				readAboutMeFile(parentPath)?.target_audience || normalizeTargetAudience(null),
				readAboutMeFile(legacyPath)?.target_audience || normalizeTargetAudience(null)
			);
			writeAboutMeTargetAudience(parentPath, merged);
			if (fs.existsSync(parentPath)) {
				fs.unlinkSync(legacyPath);
				logParentUserMigrationSuccess(
					'about-me.json',
					parentPath,
					'merged project copy into existing parent file'
				);
			}
		}

		if (fs.existsSync(parentPath)) {
			const doc = readAboutMeFile(parentPath);
			if (doc) {
				writeAboutMeTargetAudience(parentPath, doc.target_audience);
			}
		}

		if (!fs.existsSync(legacyPath)) {
			migratedAboutMeCwds.add(resolved);
		} else {
			warnInconsistentParentUserState('about-me.json', resolved, legacyPath, parentPath);
		}
	} catch (error) {
		logParentUserMigrationFailure('about-me.json', resolved, legacyPath, parentPath, error);
		warnInconsistentParentUserState('about-me.json', resolved, legacyPath, parentPath);
	}
}

/**
 * @param {string} filePath
 * @returns {Record<string, unknown> | null}
 */
function readAiAgentPreferencesDocument(filePath) {
	try {
		const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
		if (!data || typeof data !== 'object' || Array.isArray(data)) {
			return null;
		}
		return data;
	} catch {
		return null;
	}
}

/**
 * @param {Record<string, unknown> | null} primary
 * @param {Record<string, unknown> | null} secondary
 * @returns {Record<string, unknown>}
 */
function mergeAiAgentPreferencesDocuments(primary, secondary) {
	const pBehaviour = primary && primary.pull_behaviour && typeof primary.pull_behaviour === 'object'
		? primary.pull_behaviour
		: {};
	const sBehaviour = secondary && secondary.pull_behaviour && typeof secondary.pull_behaviour === 'object'
		? secondary.pull_behaviour
		: {};
	const pInclude = Array.isArray(pBehaviour.include) ? pBehaviour.include : [];
	const sInclude = Array.isArray(sBehaviour.include) ? sBehaviour.include : [];
	const pExclude = Array.isArray(pBehaviour.exclude) ? pBehaviour.exclude : [];
	const sExclude = Array.isArray(sBehaviour.exclude) ? sBehaviour.exclude : [];
	return {
		pull_behaviour: {
			usage: pBehaviour.usage || sBehaviour.usage,
			include: pInclude.length ? pInclude : sInclude,
			exclude: pExclude.length ? pExclude : sExclude
		}
	};
}

/**
 * @param {string} filePath
 * @param {Record<string, unknown>} document
 */
function writeAiAgentPreferencesDocument(filePath, document) {
	const dirResult = ensureDirWithLog(
		path.dirname(filePath),
		'ai-agent-preferences.json parent .siteglide/user'
	);
	if (!dirResult.ok) {
		throw new Error(`Could not create directory for ${filePath}`);
	}
	fs.writeFileSync(filePath, `${JSON.stringify(document, null, '\t')}\n`, 'utf8');
}

/**
 * @param {string} [cwd]
 * @returns {string}
 */
function legacyAiAgentPreferencesPath(cwd = process.cwd()) {
	migrateLegacySiteglideLayout(cwd);
	return path.join(path.resolve(cwd), SITEGLIDE_DIR, USER_DIR, AI_AGENT_PREFERENCES_FILE);
}

/**
 * @param {string} [cwd]
 * @returns {string}
 */
function joinAiAgentPreferences(cwd = process.cwd()) {
	migrateAiAgentPreferencesToParent(cwd);
	ensureParentSiteglideUserDir(cwd);
	return parentUserJsonPath(cwd, AI_AGENT_PREFERENCES_FILE);
}

/**
 * Move project-level ai-agent-preferences.json to the parent `.siteglide/user/` directory.
 * @param {string} [cwd]
 */
function migrateAiAgentPreferencesToParent(cwd = process.cwd()) {
	const resolved = path.resolve(cwd);
	const legacyPath = legacyAiAgentPreferencesPath(resolved);
	const parentPath = parentUserJsonPath(resolved, AI_AGENT_PREFERENCES_FILE);

	if (legacyPath === parentPath) {
		migratedAiAgentPrefsCwds.add(resolved);
		return;
	}

	if (parentUserMigrationSettled(resolved, migratedAiAgentPrefsCwds, legacyPath)) {
		if (!fs.existsSync(parentPath)) {
			warnInconsistentParentUserState('ai-agent-preferences.json', resolved, legacyPath, parentPath);
		}
		return;
	}

	if (!fs.existsSync(legacyPath)) {
		migratedAiAgentPrefsCwds.add(resolved);
		return;
	}

	logParentUserMigrationPlan('ai-agent-preferences.json', resolved, legacyPath, parentPath);

	try {
		if (!fs.existsSync(parentPath)) {
			moveFileSyncRobust(legacyPath, parentPath, 'ai-agent-preferences.json');
		} else {
			const merged = mergeAiAgentPreferencesDocuments(
				readAiAgentPreferencesDocument(parentPath),
				readAiAgentPreferencesDocument(legacyPath)
			);
			writeAiAgentPreferencesDocument(parentPath, merged);
			if (fs.existsSync(parentPath)) {
				fs.unlinkSync(legacyPath);
				logParentUserMigrationSuccess(
					'ai-agent-preferences.json',
					parentPath,
					'merged project copy into existing parent file'
				);
			}
		}

		if (!fs.existsSync(legacyPath)) {
			migratedAiAgentPrefsCwds.add(resolved);
		} else {
			warnInconsistentParentUserState('ai-agent-preferences.json', resolved, legacyPath, parentPath);
		}
	} catch (error) {
		logParentUserMigrationFailure('ai-agent-preferences.json', resolved, legacyPath, parentPath, error);
		warnInconsistentParentUserState('ai-agent-preferences.json', resolved, legacyPath, parentPath);
	}
}

/**
 * @param {string} [cwd]
 * @returns {string}
 */
function resolveReadableAiAgentPreferencesPath(cwd = process.cwd()) {
	migrateAiAgentPreferencesToParent(cwd);
	const parentPath = joinAiAgentPreferences(cwd);
	if (fs.existsSync(parentPath)) {
		return parentPath;
	}
	const legacyPath = legacyAiAgentPreferencesPath(cwd);
	if (fs.existsSync(legacyPath)) {
		return legacyPath;
	}
	return parentPath;
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
	aiAgentPreferences: '../.siteglide/user/ai-agent-preferences.json',
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
	parentSiteglideUserDir,
	ensureParentSiteglideUserDir,
	migrateAboutMeToParent,
	legacyAboutMePath,
	joinAboutMe,
	migrateAiAgentPreferencesToParent,
	legacyAiAgentPreferencesPath,
	joinAiAgentPreferences,
	resolveReadableAiAgentPreferencesPath,
	joinUser,
	joinProject,
	rel
};
