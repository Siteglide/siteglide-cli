const fs = require('fs');
const path = require('path');

const LOCAL_JSON_PATH = path.join(__dirname, '../integration/local.json');
const DEFAULT_ENV_NAME = 'staging';
const DEFAULT_CONFIG_FILE = '.siteglide-config';

const readLocalJson = () => {
	if (!fs.existsSync(LOCAL_JSON_PATH)) {
		return null;
	}

	try {
		return JSON.parse(fs.readFileSync(LOCAL_JSON_PATH, 'utf8'));
	} catch (error) {
		return {
			_parseError: error.message
		};
	}
};

const isSiteglideProjectRoot = (projectPath) => {
	const markers = ['marketplace_builder', 'app', 'modules'];
	return markers.some((name) => fs.existsSync(path.join(projectPath, name)));
};

/**
 * Resolve integration test project + staging env from env vars or test/integration/local.json.
 * Env vars win over local.json. Never logs tokens.
 *
 * @returns {{
 *   ok: true,
 *   projectPath: string,
 *   configPath: string,
 *   configRelative: string,
 *   envName: string,
 *   auth: { url: string, email: string, token: string },
 *   pullModule?: string
 * } | {
 *   ok: false,
 *   skipReason: string
 * }}
 */
const resolveIntegrationContext = () => {
	const local = readLocalJson();

	if (local && local._parseError) {
		return {
			ok: false,
			skipReason: `Could not parse ${LOCAL_JSON_PATH}: ${local._parseError}`
		};
	}

	const projectRaw = process.env.SITEGLIDE_TEST_PROJECT || (local && local.project);
	if (!projectRaw) {
		return {
			ok: false,
			skipReason: 'Set SITEGLIDE_TEST_PROJECT or copy test/integration/local.json.example to test/integration/local.json'
		};
	}

	const projectPath = path.resolve(String(projectRaw));
	if (!fs.existsSync(projectPath)) {
		return {
			ok: false,
			skipReason: `Project path does not exist: ${projectPath}`
		};
	}

	if (!fs.statSync(projectPath).isDirectory()) {
		return {
			ok: false,
			skipReason: `Project path is not a directory: ${projectPath}`
		};
	}

	if (!isSiteglideProjectRoot(projectPath)) {
		return {
			ok: false,
			skipReason: `Project path has no marketplace_builder/, app/, or modules/: ${projectPath}`
		};
	}

	const configRelative = process.env.SITEGLIDE_TEST_CONFIG ||
		(local && local.configFile) ||
		DEFAULT_CONFIG_FILE;
	const configPath = path.isAbsolute(configRelative)
		? configRelative
		: path.join(projectPath, configRelative);

	if (!fs.existsSync(configPath)) {
		return {
			ok: false,
			skipReason: `Config file not found: ${configPath}`
		};
	}

	let settings;
	try {
		settings = JSON.parse(fs.readFileSync(configPath, 'utf8'));
	} catch (error) {
		return {
			ok: false,
			skipReason: `Config file is not valid JSON: ${configPath}`
		};
	}

	const envName = process.env.SITEGLIDE_TEST_ENV ||
		(local && local.env) ||
		DEFAULT_ENV_NAME;

	const auth = settings[envName];
	if (!auth) {
		const available = Object.keys(settings).filter((key) => {
			return typeof settings[key] === 'object' && settings[key] !== null;
		});
		return {
			ok: false,
			skipReason: `Environment "${envName}" not found in ${configPath}. Available: ${available.join(', ') || '(none)'}`
		};
	}

	if (!auth.url || !auth.email || !auth.token) {
		return {
			ok: false,
			skipReason: `Environment "${envName}" in ${configPath} is missing url, email, or token`
		};
	}

	const pullModule = process.env.SITEGLIDE_TEST_PULL_MODULE ||
		(local && local.pullModule) ||
		undefined;

	return {
		ok: true,
		projectPath,
		configPath,
		configRelative: path.isAbsolute(configRelative) ? configRelative : configRelative,
		envName,
		auth: {
			url: auth.url,
			email: auth.email,
			token: auth.token
		},
		pullModule: pullModule ? String(pullModule) : undefined
	};
};

/**
 * Env for runCli when executing against an integration project.
 * @param {{ configRelative: string }} ctx
 * @param {Record<string, string>} [extra]
 */
const cliEnvForContext = (ctx, extra = {}) => {
	return {
		CONFIG_FILE_PATH: ctx.configRelative,
		CI: 'true',
		...extra
	};
};

module.exports = {
	LOCAL_JSON_PATH,
	DEFAULT_ENV_NAME,
	DEFAULT_CONFIG_FILE,
	resolveIntegrationContext,
	cliEnvForContext,
	isSiteglideProjectRoot
};
