/**
 * Project `.siteglide/project/sourceOfTruth.json` — team workflow mode (site vs version control).
 * Team-shareable: commit `.siteglide/project/` to git; only `.siteglide/user/` should be gitignored.
 */
const fs = require('fs-extra');
const path = require('path');
const logger = require('./logger');
const { projectSegments } = require('./siteglidePaths');

const SOURCE_OF_TRUTH_CONFIG_RELATIVE_PATH = path.join(...projectSegments('sourceOfTruth.json'));

const MODE_SITE = 'site';
const MODE_VERSION_CONTROL = 'versionControl';

const VALID_MODES = [MODE_SITE, MODE_VERSION_CONTROL];

const VERSION_CONTROL_PULL_MESSAGE = [
	'You selected source of truth as version control for this project, are you sure you want to pull from the site?',
	'Version control source of truth projects would generally deploy to a site but not pull.',
	'If you know what you\'re doing, please select "Y", if you\'re not sure, cancel with "n".'
].join(' ');

/**
 * @returns {{ sourceOfTruth: string, usage: string }}
 */
const defaultSourceOfTruthDocument = () => {
	return {
		sourceOfTruth: MODE_SITE,
		usage: [
			'Select site for normal Siteglide CLI behaviour, where other colleagues, clients or yourself may make other changes on other machines, or on the web, push those to the site and you need your work here to stay in sync with them.',
			'Or select versionControl for a different kind of project where the source of truth is always version control like GitHub, nobody will make changes directly in the Siteglide Admin, and you will always sync or deploy from a git branch to the site.',
			'You might select versionControl if you are building a module, or building a platformOS site and hosting on Siteglide.',
			'Run siteglide-cli ai (no environment) to choose this setting and set up Siteglide MCP without pulling from a site.'
		].join(' ')
	};
};

/**
 * @param {string} [rootPath]
 * @returns {string}
 */
const resolveSourceOfTruthConfigPath = (rootPath = process.cwd()) => {
	return path.join(rootPath, SOURCE_OF_TRUTH_CONFIG_RELATIVE_PATH);
};

/**
 * Create `.siteglide/project/sourceOfTruth.json` when missing. Never overwrites an existing file.
 *
 * @param {string} [rootPath]
 * @returns {Promise<{ configPath: string, created: boolean }>}
 */
const ensureSourceOfTruthConfig = async (rootPath = process.cwd()) => {
	const configPath = resolveSourceOfTruthConfigPath(rootPath);
	if (await fs.pathExists(configPath)) {
		return { configPath, created: false };
	}
	await fs.ensureDir(path.dirname(configPath));
	await fs.writeFile(
		configPath,
		`${JSON.stringify(defaultSourceOfTruthDocument(), null, '\t')}\n`,
		'utf8'
	);
	return { configPath, created: true };
};

/**
 * @param {unknown} value
 * @returns {value is 'site' | 'versionControl'}
 */
const isValidSourceOfTruthMode = (value) => {
	return typeof value === 'string' && VALID_MODES.indexOf(value) !== -1;
};

/**
 * @param {string} [rootPath]
 * @returns {Promise<'site' | 'versionControl'>}
 */
const readSourceOfTruthMode = async (rootPath = process.cwd()) => {
	const configPath = resolveSourceOfTruthConfigPath(rootPath);
	if (!(await fs.pathExists(configPath))) {
		return MODE_SITE;
	}
	try {
		const parsed = JSON.parse(await fs.readFile(configPath, 'utf8'));
		const mode = parsed && parsed.sourceOfTruth;
		if (isValidSourceOfTruthMode(mode)) {
			return mode;
		}
		logger.Warn(
			`[sourceOfTruth] ${SOURCE_OF_TRUTH_CONFIG_RELATIVE_PATH} must set sourceOfTruth to "site" or "versionControl"; using site`,
			{ exit: false }
		);
		return MODE_SITE;
	} catch (error) {
		logger.Warn(
			`[sourceOfTruth] ${SOURCE_OF_TRUTH_CONFIG_RELATIVE_PATH} is invalid JSON (${error.message}); using site`,
			{ exit: false }
		);
		return MODE_SITE;
	}
};

/**
 * @param {{ cliFlag?: boolean, mode: 'site' | 'versionControl' }} opts
 * @returns {boolean}
 */
const resolveSkipRemoteCheck = (opts) => {
	if (opts.cliFlag) {
		return true;
	}
	if (opts.mode === MODE_VERSION_CONTROL) {
		return true;
	}
	return false;
};

/**
 * @returns {Promise<boolean>}
 */
const isVersionControlPullAllowedWithoutAssumeYes = () => {
	if (process.env.SITEGLIDE_PULL_ASSUME_YES === '1') {
		return true;
	}
	if (process.stdin.isTTY && !process.env.CI) {
		return true;
	}
	return false;
};

/**
 * @returns {Promise<boolean | null>}
 */
const promptVersionControlPullConfirm = async () => {
	const { confirmYesNo } = require('./prompts');
	return confirmYesNo(VERSION_CONTROL_PULL_MESSAGE);
};

/**
 * Refuse non-interactive pull when mode is versionControl (unless SITEGLIDE_PULL_ASSUME_YES).
 *
 * @param {'site' | 'versionControl'} mode
 * @returns {{ allowed: boolean, message?: string }}
 */
/**
 * Write sourceOfTruth.json with the given mode (creates parent dirs).
 *
 * @param {string} rootPath
 * @param {'site' | 'versionControl'} mode
 * @returns {Promise<string>} config path
 */
const writeSourceOfTruthDocument = async (rootPath, mode) => {
	const configPath = resolveSourceOfTruthConfigPath(rootPath);
	const document = defaultSourceOfTruthDocument();
	document.sourceOfTruth = mode;
	await fs.ensureDir(path.dirname(configPath));
	await fs.writeFile(configPath, `${JSON.stringify(document, null, '\t')}\n`, 'utf8');
	return configPath;
};

/**
 * Create sourceOfTruth.json when missing — interactive choice on TTY, else default site.
 *
 * @param {string} [rootPath]
 * @returns {Promise<{ mode: 'site' | 'versionControl', created: boolean }>}
 */
const promptAndEnsureSourceOfTruthConfig = async (rootPath = process.cwd()) => {
	const configPath = resolveSourceOfTruthConfigPath(rootPath);
	if (await fs.pathExists(configPath)) {
		return {
			mode: await readSourceOfTruthMode(rootPath),
			created: false
		};
	}

	if (process.stdin.isTTY && !process.env.CI) {
		const { selectChoice } = require('./prompts');
		const choice = await selectChoice(
			'Is this a standard Siteglide website, or a GitHub / module-style project where version control is the source of truth?',
			[
				{
					name: 'Standard Siteglide website',
					value: MODE_SITE,
					description: 'Site is source of truth — pull, sync, and deploy with remote conflict checks (normal CLI behaviour).'
				},
				{
					name: 'GitHub / module / platformOS on Siteglide',
					value: MODE_VERSION_CONTROL,
					description: 'Version control is source of truth — deploy/sync to the site; pull is unusual.'
				}
			]
		);
		if (!choice) {
			return { mode: MODE_SITE, created: false, cancelled: true };
		}
		await writeSourceOfTruthDocument(rootPath, choice);
		logger.Info(`[ai] Created ./${SOURCE_OF_TRUTH_CONFIG_RELATIVE_PATH.replace(/\\/g, '/')} (sourceOfTruth: ${choice})`);
		return { mode: choice, created: true };
	}

	const { created } = await ensureSourceOfTruthConfig(rootPath);
	if (created) {
		logger.Info(
			`[ai] Created ./${SOURCE_OF_TRUTH_CONFIG_RELATIVE_PATH.replace(/\\/g, '/')} with sourceOfTruth "site" (non-interactive). Edit the file to use versionControl.`
		);
	}
	return { mode: MODE_SITE, created };
};

const assertVersionControlPullEnvironment = (mode) => {
	if (mode !== MODE_VERSION_CONTROL) {
		return { allowed: true };
	}
	if (isVersionControlPullAllowedWithoutAssumeYes()) {
		return { allowed: true };
	}
	return {
		allowed: false,
		message: [
			'[pull] Refusing pull: this project uses version control as source of truth (.siteglide/project/sourceOfTruth.json).',
			'Pull from the site interactively, set sourceOfTruth to "site", or set SITEGLIDE_PULL_ASSUME_YES=1 if you intend to pull in automation.'
		].join(' ')
	};
};

module.exports = {
	MODE_SITE,
	MODE_VERSION_CONTROL,
	SOURCE_OF_TRUTH_CONFIG_RELATIVE_PATH,
	VERSION_CONTROL_PULL_MESSAGE,
	defaultSourceOfTruthDocument,
	resolveSourceOfTruthConfigPath,
	ensureSourceOfTruthConfig,
	writeSourceOfTruthDocument,
	promptAndEnsureSourceOfTruthConfig,
	readSourceOfTruthMode,
	resolveSkipRemoteCheck,
	isVersionControlPullAllowedWithoutAssumeYes,
	promptVersionControlPullConfirm,
	assertVersionControlPullEnvironment
};
