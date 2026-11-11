/**
 * Read-only hints after pull come from the siteglide_system module only:
 * `modules/siteglide_system/public/lib/reserved_files.liquid` (gitignore-style globs, plaintext).
 *
 * Before the main site zip, rules are loaded from the live site via admin GraphQL
 * (`physical_file_path` exact match). After pull, local disk is preferred, then the
 * pre-zip remote snapshot for this run.
 */

const fs = require('fs-extra');
const path = require('path');
const ignore = require('ignore');
const logger = require('../logger');
const dir = require('../directories');
const { fetchRemoteFileContent } = require('./fetchRemoteFileContent');

/** @type {{ remoteRules: string[], remoteFound: boolean }} */
let pullReadOnlySession = {
	remoteRules: [],
	remoteFound: false
};

const SITEGLIDE_SYSTEM_MODULE = 'siteglide_system';
const RESERVED_FILES_BASENAME = 'reserved_files.liquid';

/**
 * POSIX path from project root (e.g. modules/siteglide_system/public/lib/reserved_files.liquid).
 */
const RESERVED_FILES_RELATIVE_PATH = path
	.join(dir.MODULES, SITEGLIDE_SYSTEM_MODULE, 'public', 'lib', RESERVED_FILES_BASENAME)
	.split(path.sep)
	.join('/');

/**
 * @param {string} content
 * @returns {string[]}
 */
const parsePullReadOnlyRuleLines = (content) => {
	const lines = String(content).split(/\r?\n/);
	const rules = [];
	for (let i = 0; i < lines.length; i++) {
		const trimmed = lines[i].trim();
		if (!trimmed || trimmed.indexOf('#') === 0) {
			continue;
		}
		rules.push(trimmed);
	}
	return rules;
};

/**
 * @param {string} [rootPath]
 * @returns {string}
 */
const resolveReservedFilesPath = (rootPath = process.cwd()) => {
	return path.join(rootPath, dir.MODULES, SITEGLIDE_SYSTEM_MODULE, 'public', 'lib', RESERVED_FILES_BASENAME);
};

/**
 * @param {string} [rootPath]
 * @returns {Promise<string[]>}
 */
const readReservedFilesRules = async (rootPath = process.cwd()) => {
	const rulesPath = resolveReservedFilesPath(rootPath);
	if (!(await fs.pathExists(rulesPath))) {
		return [];
	}
	try {
		const content = await fs.readFile(rulesPath, 'utf8');
		return parsePullReadOnlyRuleLines(content);
	} catch (error) {
		logger.Warn(
			`[pull] ${RESERVED_FILES_RELATIVE_PATH} could not be read (${error.message}); no read-only hints this run`,
			{ exit: false }
		);
		return [];
	}
};

const resetPullReadOnlySession = () => {
	pullReadOnlySession = {
		remoteRules: [],
		remoteFound: false
	};
};

/**
 * @param {import('../proxy')} gateway
 * @returns {Promise<{ found: boolean, rules: string[], reason?: string }>}
 */
const fetchReservedFilesRulesRemote = async (gateway) => {
	const result = await fetchRemoteFileContent(gateway, RESERVED_FILES_RELATIVE_PATH);
	if (!result.ok) {
		return { found: false, rules: [], reason: result.reason };
	}
	const body = result.record && typeof result.record.body === 'string' ? result.record.body : '';
	if (!body.trim()) {
		return { found: true, rules: [] };
	}
	return {
		found: true,
		rules: parsePullReadOnlyRuleLines(body)
	};
};

/**
 * Local file after pull, else remote snapshot from the start of this pull.
 *
 * @param {string} [rootPath]
 * @returns {Promise<string[]>}
 */
const resolveEffectivePullReadOnlyRules = async (rootPath = process.cwd()) => {
	const local = await readReservedFilesRules(rootPath);
	if (local.length > 0) {
		return local;
	}
	if (pullReadOnlySession.remoteRules.length > 0) {
		return pullReadOnlySession.remoteRules;
	}
	return [];
};

/**
 * @param {string} [rootPath]
 * @returns {Promise<import('ignore').Ignore>}
 */
const loadPullReadOnlyMatcher = async (rootPath = process.cwd()) => {
	const ig = ignore();
	const rules = await resolveEffectivePullReadOnlyRules(rootPath);
	if (rules.length > 0) {
		ig.add(rules);
	}
	return ig;
};

/**
 * Pre-pull: fetch rules from remote (needs gateway). Post-pull: resolve effective rules for logging.
 *
 * @param {string} [rootPath]
 * @param {{ gateway?: import('../proxy'), phase?: 'pre_pull' | 'post_pull' }} [opts]
 * @returns {Promise<{ rulesPath: string, ruleCount: number, found: boolean, source?: string }>}
 */
const loadReservedFilesRulesForPull = async (rootPath = process.cwd(), opts = {}) => {
	const rulesPath = resolveReservedFilesPath(rootPath);
	const phase = opts.phase || 'pre_pull';

	if (
		phase === 'pre_pull'
		&& opts.gateway
	) {
		const remote = await fetchReservedFilesRulesRemote(opts.gateway);
		pullReadOnlySession.remoteFound = remote.found;
		pullReadOnlySession.remoteRules = remote.rules;
		if (!remote.found) {
			logger.Debug(
				`[pull] Read-only list: not on remote at ./${RESERVED_FILES_RELATIVE_PATH}` +
				(remote.reason ? ` (${remote.reason})` : '') +
				'; continuing pull (no hints unless the file arrives locally in this run)'
			);
			return { rulesPath, ruleCount: 0, found: false, source: 'remote' };
		}
		if (remote.rules.length === 0) {
			logger.Debug(
				`[pull] Read-only list: on remote at ./${RESERVED_FILES_RELATIVE_PATH} but contains no patterns`
			);
		} else {
			logger.Debug(
				`[pull] Read-only list: ${remote.rules.length} pattern(s) from remote ./${RESERVED_FILES_RELATIVE_PATH} (before site zip)`
			);
		}
		return { rulesPath, ruleCount: remote.rules.length, found: true, source: 'remote' };
	}

	const localRules = await readReservedFilesRules(rootPath);
	const rules = localRules.length > 0 ? localRules : pullReadOnlySession.remoteRules;
	const localExists = await fs.pathExists(rulesPath);

	if (rules.length === 0) {
		if (localExists) {
			logger.Debug(
				`[pull] Read-only list: local file at ./${RESERVED_FILES_RELATIVE_PATH} has no patterns; read-only pass skipped`
			);
		} else if (pullReadOnlySession.remoteFound) {
			logger.Debug('[pull] Read-only list: using empty remote snapshot from before pull');
		} else {
			logger.Debug(
				'[pull] Read-only list: not available locally or from remote; read-only pass skipped'
			);
		}
		return { rulesPath, ruleCount: 0, found: false, source: localRules.length > 0 ? 'local' : 'remote' };
	}

	const source = localRules.length > 0 ? 'local' : 'remote';
	logger.Debug(
		`[pull] Read-only list: ${rules.length} pattern(s) from ${source} ./${RESERVED_FILES_RELATIVE_PATH}`
	);
	return { rulesPath, ruleCount: rules.length, found: true, source };
};

/**
 * @param {string} absolutePath
 * @param {string} [rootPath]
 * @returns {string}
 */
const toPosixProjectRelative = (absolutePath, rootPath = process.cwd()) => {
	const rel = path.relative(rootPath, absolutePath);
	if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
		return '';
	}
	return rel.split(path.sep).join('/');
};

/**
 * @param {import('ignore').Ignore} ig
 * @param {string} projectRelativePosix
 * @returns {boolean}
 */
const pathMatchesPullReadOnlyRules = (ig, projectRelativePosix) => {
	if (!projectRelativePosix) {
		return false;
	}
	return ig.ignores(projectRelativePosix);
};

/**
 * Debug-only snapshot of the pre-zip remote rules cache for this pull run.
 *
 * @returns {{ remoteFound: boolean, remoteRuleCount: number }}
 */
const getPullReadOnlySessionSnapshot = () => {
	return {
		remoteFound: pullReadOnlySession.remoteFound,
		remoteRuleCount: pullReadOnlySession.remoteRules.length
	};
};

module.exports = {
	SITEGLIDE_SYSTEM_MODULE,
	RESERVED_FILES_RELATIVE_PATH,
	RESERVED_FILES_BASENAME,
	parsePullReadOnlyRuleLines,
	resolveReservedFilesPath,
	readReservedFilesRules,
	resetPullReadOnlySession,
	fetchReservedFilesRulesRemote,
	resolveEffectivePullReadOnlyRules,
	loadPullReadOnlyMatcher,
	loadReservedFilesRulesForPull,
	toPosixProjectRelative,
	pathMatchesPullReadOnlyRules,
	getPullReadOnlySessionSnapshot
};
