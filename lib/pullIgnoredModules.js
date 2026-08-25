/**
 * Module machine names skipped by default on `siteglide-cli pull`.
 * Project `.siteglide/cli-settings/modules.json` — `pull_behaviour.include` / `exclude` adjust the skip list.
 *
 * Built-in Siteglide platform modules are slow to pull and rarely contain project-specific
 * public/ code; custom modules are usually what you want locally. Use include or -m when needed.
 */
const fs = require('fs-extra');
const path = require('path');
const logger = require('./logger');

const PULL_MODULES_CONFIG_DIR = path.join('.siteglide', 'cli-settings');
const PULL_MODULES_CONFIG_FILE = 'modules.json';
const PULL_MODULES_CONFIG_RELATIVE_PATH = path.join(PULL_MODULES_CONFIG_DIR, PULL_MODULES_CONFIG_FILE);

const DEFAULT_PULL_IGNORED_MODULES = [
	'module_86',
	'module_357',
	'siteglide_authors',
	'siteglide_blog',
	'siteglide_ecommerce',
	'siteglide_menu',
	'siteglide_secure_zones',
	'siteglide_system',
	'siteglide_events',
	'siteglide_media_downloads',
	'siteglide_design_system',
	'siteglide_email_marketing',
	'undefined',
	'captchas', //pOS captchas module
	'captchas_turnstile' //pOS captchas module
];

/**
 * @returns {{ usage: string, include: string[], exclude: string[] }}
 */
const defaultPullBehaviour = () => {
	return {
		usage: [
			'By default, pull skips Siteglide modules, but not marketplace or custom modules, whose public files will be downloaded (but may not necessarily be designed to be edited). Exclude will skip additional modules. include will pull additional modules which would otherwise be skipped. We recommend committing this file to git so the team pulls the same modules. module_984 distributes AI skills and is not skipped by default; when pulled, skill files from public/assets/agents/ merge into ./.agents unless you exclude it.',
			'',
			'Examples:',
			'  "include": ["module_357"],',
			'  "exclude": ["my_custom_module"]'
		].join('\n'),
		include: [],
		exclude: []
	};
};

/**
 * @returns {{ pull_behaviour: { usage: string, include: string[], exclude: string[] } }}
 */
const defaultPullModulesConfigDocument = () => {
	return {
		pull_behaviour: defaultPullBehaviour()
	};
};

/**
 * @param {unknown} parsed
 * @returns {{ include: string[], exclude: string[] }|null}
 */
const parsePullBehaviourFromDocument = (parsed) => {
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		return null;
	}
	const pullBehaviour = parsed.pull_behaviour;
	if (!pullBehaviour || typeof pullBehaviour !== 'object' || Array.isArray(pullBehaviour)) {
		return null;
	}
	return {
		include: normalizeModuleList(pullBehaviour.include),
		exclude: normalizeModuleList(pullBehaviour.exclude)
	};
};

/**
 * @param {string} [rootPath]
 * @returns {string}
 */
const resolvePullModulesConfigPath = (rootPath = process.cwd()) => {
	return path.join(rootPath, PULL_MODULES_CONFIG_RELATIVE_PATH);
};

/**
 * @param {unknown} value
 * @returns {string[]}
 */
const normalizeModuleList = (value) => {
	if (!Array.isArray(value)) {
		return [];
	}
	const seen = {};
	const normalized = [];
	for (let i = 0; i < value.length; i++) {
		const name = normalizeModuleName(value[i]);
		if (!name || seen[name]) {
			continue;
		}
		seen[name] = true;
		normalized.push(name);
	}
	return normalized;
};

/**
 * Apply include/exclude on top of the built-in ignore list.
 *
 * @param {{ include?: unknown, exclude?: unknown }} [config]
 * @returns {string[]}
 */
const mergePullIgnoredModules = (config = {}) => {
	const include = normalizeModuleList(config.include);
	const exclude = normalizeModuleList(config.exclude);
	const merged = DEFAULT_PULL_IGNORED_MODULES.slice();

	for (let i = 0; i < exclude.length; i++) {
		const name = exclude[i];
		if (merged.indexOf(name) === -1) {
			merged.push(name);
		}
	}

	for (let i = 0; i < include.length; i++) {
		const name = include[i];
		const index = merged.indexOf(name);
		if (index !== -1) {
			merged.splice(index, 1);
		}
	}

	return merged;
};

/**
 * Create `.siteglide/cli-settings/modules.json` when missing. Never overwrites an existing file.
 *
 * @param {string} [rootPath]
 * @returns {Promise<{ configPath: string, created: boolean }>}
 */
const ensurePullModulesConfig = async (rootPath = process.cwd()) => {
	const configPath = resolvePullModulesConfigPath(rootPath);
	if (await fs.pathExists(configPath)) {
		return { configPath, created: false };
	}
	await fs.ensureDir(path.dirname(configPath));
	await fs.writeFile(
		configPath,
		`${JSON.stringify(defaultPullModulesConfigDocument(), null, '\t')}\n`,
		'utf8'
	);
	return { configPath, created: true };
};

/**
 * @param {string} [rootPath]
 * @returns {Promise<{ include: string[], exclude: string[] }>}
 */
const readPullModulesConfig = async (rootPath = process.cwd()) => {
	const configPath = resolvePullModulesConfigPath(rootPath);
	if (!(await fs.pathExists(configPath))) {
		return { include: [], exclude: [] };
	}
	try {
		const parsed = JSON.parse(await fs.readFile(configPath, 'utf8'));
		const pullBehaviour = parsePullBehaviourFromDocument(parsed);
		if (!pullBehaviour) {
			logger.Warn(`[pull] ${PULL_MODULES_CONFIG_RELATIVE_PATH} must contain a pull_behaviour object; using built-in ignore list only`, { exit: false });
			return { include: [], exclude: [] };
		}
		return pullBehaviour;
	} catch (error) {
		logger.Warn(`[pull] ${PULL_MODULES_CONFIG_RELATIVE_PATH} is invalid JSON (${error.message}); using built-in ignore list only`, { exit: false });
		return { include: [], exclude: [] };
	}
};

/**
 * Ensure config file exists, read include/exclude, return the effective ignore list.
 *
 * @param {string} [rootPath]
 * @returns {Promise<{ created: boolean, effectiveIgnoredModules: string[] }>}
 */
const preparePullModulesConfig = async (rootPath = process.cwd()) => {
	const { created } = await ensurePullModulesConfig(rootPath);
	const config = await readPullModulesConfig(rootPath);
	return {
		created,
		effectiveIgnoredModules: mergePullIgnoredModules(config)
	};
};

/**
 * @param {string} [rootPath]
 * @returns {Promise<string[]>}
 */
const loadEffectivePullIgnoredModules = async (rootPath = process.cwd()) => {
	const prepared = await preparePullModulesConfig(rootPath);
	return prepared.effectiveIgnoredModules;
};

/**
 * @param {string} moduleName
 * @returns {string}
 */
const normalizeModuleName = (moduleName) => {
	if (typeof moduleName !== 'string') {
		return '';
	}
	return moduleName.trim();
};

/** Display names for module machine names in log output only (API paths stay unchanged). */
const MODULE_LOG_ALIASES = {
	module_984: 'Siteglide AI skills'
};

/**
 * @param {string} moduleName
 * @returns {string}
 */
const formatModuleNameForLog = (moduleName) => {
	const normalized = normalizeModuleName(moduleName);
	if (!normalized) {
		return moduleName;
	}
	if (MODULE_LOG_ALIASES[normalized]) {
		return MODULE_LOG_ALIASES[normalized];
	}
	return normalized;
};

/**
 * @param {string[]} moduleNames
 * @returns {string[]}
 */
const formatModuleListForLog = (moduleNames) => {
	if (!Array.isArray(moduleNames)) {
		return [];
	}
	return moduleNames.map(formatModuleNameForLog);
};

/**
 * @param {string} moduleName
 * @param {string[]} [ignoredModules]
 * @returns {boolean}
 */
const isPullIgnoredModule = (moduleName, ignoredModules = DEFAULT_PULL_IGNORED_MODULES) => {
	const normalized = normalizeModuleName(moduleName);
	if (!normalized) {
		return false;
	}
	return ignoredModules.indexOf(normalized) !== -1;
};

/**
 * @param {string[]} installedModules
 * @param {string[]} [ignoredModules]
 * @returns {string[]}
 */
const filterPullIgnoredModules = (installedModules, ignoredModules = DEFAULT_PULL_IGNORED_MODULES) => {
	if (!Array.isArray(installedModules)) {
		return [];
	}
	return installedModules.filter((name) => {
		return !isPullIgnoredModule(name, ignoredModules);
	});
};

/**
 * @param {string[]} installedModules
 * @param {string[]} [ignoredModules]
 * @returns {{ selected: string[], ignored: string[] }}
 */
const partitionPullIgnoredModules = (installedModules, ignoredModules = DEFAULT_PULL_IGNORED_MODULES) => {
	const selected = [];
	const ignored = [];
	if (!Array.isArray(installedModules)) {
		return { selected, ignored };
	}
	for (let i = 0; i < installedModules.length; i++) {
		const name = installedModules[i];
		if (isPullIgnoredModule(name, ignoredModules)) {
			ignored.push(name);
		} else {
			selected.push(name);
		}
	}
	return { selected, ignored };
};

/**
 * When `-m` targets a default-ignored module, allow that module through for this run.
 *
 * @param {string|undefined} moduleFilter
 * @param {string[]} [ignoredModules]
 * @returns {string[]}
 */
const resolvePullIgnoredModules = (moduleFilter, ignoredModules = DEFAULT_PULL_IGNORED_MODULES) => {
	if (!moduleFilter) {
		return ignoredModules;
	}
	return ignoredModules.filter((name) => {
		return name !== moduleFilter;
	});
};

/**
 * Decide which installed modules to pull for this run.
 *
 * @param {string[]} installedModules - Module names returned by `/cli/list_modules`.
 * @param {string|undefined} moduleFilter - Optional `-m` value; when set, only that module is selected.
 * @param {string[]} [ignoredModules] - Default-ignored module names (without `-m` override applied).
 * @returns {string[]|null} Modules to pull, or `null` if `moduleFilter` is set but not installed.
 */
const selectModulesToPull = (installedModules, moduleFilter, ignoredModules = DEFAULT_PULL_IGNORED_MODULES) => {
	if (moduleFilter) {
		if (installedModules.indexOf(moduleFilter) === -1) {
			return null;
		}
		return [moduleFilter];
	}
	return filterPullIgnoredModules(installedModules, ignoredModules);
};

module.exports = {
	DEFAULT_PULL_IGNORED_MODULES,
	MODULE_LOG_ALIASES,
	PULL_MODULES_CONFIG_RELATIVE_PATH,
	defaultPullBehaviour,
	defaultPullModulesConfigDocument,
	parsePullBehaviourFromDocument,
	resolvePullModulesConfigPath,
	normalizeModuleList,
	mergePullIgnoredModules,
	ensurePullModulesConfig,
	readPullModulesConfig,
	preparePullModulesConfig,
	loadEffectivePullIgnoredModules,
	normalizeModuleName,
	formatModuleNameForLog,
	formatModuleListForLog,
	isPullIgnoredModule,
	filterPullIgnoredModules,
	partitionPullIgnoredModules,
	resolvePullIgnoredModules,
	selectModulesToPull
};
