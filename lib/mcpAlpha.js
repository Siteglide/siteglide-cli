const fs = require('fs'),
	os = require('os'),
	path = require('path'),
	{ execFileSync } = require('child_process'),
	fetch = require('node-fetch'),
	semver = require('semver'),
	logger = require('./logger'),
	Confirm = require('./confirm'),
	{
		SERVER_NAME,
		ensureMcpRegistered,
		ensureMcpIdeRules,
		getRegistryTargets
	} = require('./ai');

const DEFAULT_PACKAGE = '@siteglide/siteglide-mcp';
const DEFAULT_REGISTRY = 'https://registry.npmjs.org/';
const DEFAULT_TAG = 'alpha';
const ALPHA_RELATIVE_PATH = path.join('.siteglide', 'alpha.json');

const resolveCliRoot = () => path.resolve(__dirname, '..');

const resolveAlphaPath = (rootPath = process.cwd()) => path.join(rootPath, ALPHA_RELATIVE_PATH);

const readJsonObject = (filePath) => {
	if (!fs.existsSync(filePath)) {
		return null;
	}
	try {
		const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
		if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
			return parsed;
		}
	} catch (error) {
		logger.Warn(`[pull] ${ALPHA_RELATIVE_PATH} is invalid JSON (${error.message})`, { exit: false });
	}
	return null;
};

/**
 * Read npm credentials for restricted MCP installs from ./.siteglide/alpha.json.
 * Expected shape: { token, registry?, tag?, package? }
 *
 * @param {string} [rootPath]
 * @returns {null | { token: string, registry: string, tag: string, package: string }}
 */
const readAlphaCredentials = (rootPath = process.cwd()) => {
	const parsed = readJsonObject(resolveAlphaPath(rootPath));
	if (!parsed) {
		return null;
	}

	const token = typeof parsed.token === 'string'
		? parsed.token.trim()
		: typeof parsed._authToken === 'string'
			? parsed._authToken.trim()
			: '';

	if (!token) {
		return null;
	}

	return {
		token,
		registry: typeof parsed.registry === 'string' && parsed.registry.trim()
			? parsed.registry.trim()
			: DEFAULT_REGISTRY,
		tag: typeof parsed.tag === 'string' && parsed.tag.trim()
			? parsed.tag.trim()
			: DEFAULT_TAG,
		package: typeof parsed.package === 'string' && parsed.package.trim()
			? parsed.package.trim()
			: DEFAULT_PACKAGE
	};
};

const hasAlphaCredentials = (rootPath = process.cwd()) => readAlphaCredentials(rootPath) !== null;

const registryPackageUrl = (registry, packageName) => {
	const base = registry.endsWith('/') ? registry.slice(0, -1) : registry;
	return `${base}/${packageName.replace('/', '%2F')}`;
};

const resolveInstalledMcpVersion = (cliRoot = resolveCliRoot()) => {
	try {
		const pkgPath = require.resolve(`${DEFAULT_PACKAGE}/package.json`, { paths: [cliRoot] });
		return JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version;
	} catch (error) {
		return null;
	}
};

/**
 * @returns {Promise<{ tagVersion: string | null, versions: string[], distTags: Record<string, string> } | null>}
 */
const fetchPublishedMcpVersions = async (credentials) => {
	const url = registryPackageUrl(credentials.registry, credentials.package);
	try {
		const response = await fetch(url, {
			headers: {
				Authorization: `Bearer ${credentials.token}`,
				Accept: 'application/json'
			}
		});

		if (!response.ok) {
			logger.Debug(`[pull] MCP registry lookup failed (${response.status}) for ${credentials.package}`);
			return null;
		}

		const data = await response.json();
		const versions = data.versions && typeof data.versions === 'object'
			? Object.keys(data.versions)
			: [];
		const distTags = data['dist-tags'] && typeof data['dist-tags'] === 'object'
			? data['dist-tags']
			: {};

		return {
			tagVersion: typeof distTags[credentials.tag] === 'string' ? distTags[credentials.tag] : null,
			versions,
			distTags
		};
	} catch (error) {
		logger.Debug(`[pull] MCP registry lookup error: ${error.message}`);
		return null;
	}
};

const pickLatestPublishedVersion = (published, tag) => {
	if (published.tagVersion && semver.valid(published.tagVersion)) {
		return published.tagVersion;
	}

	const stable = published.versions
		.filter((version) => semver.valid(version))
		.sort(semver.rcompare);

	return stable[0] || null;
};

const writeTempNpmrc = (credentials) => {
	const registryHost = credentials.registry.replace(/^https?:\/\//, '').replace(/\/$/, '');
	const npmrcPath = path.join(os.tmpdir(), `siteglide-mcp-alpha-${process.pid}.npmrc`);
	const scope = credentials.package.startsWith('@') ? credentials.package.split('/')[0] : null;
	const lines = [
		`//${registryHost}/:_authToken=${credentials.token}`
	];

	if (scope) {
		lines.unshift(`${scope}:registry=${credentials.registry}`);
	}

	fs.writeFileSync(npmrcPath, lines.join('\n') + '\n', 'utf8');
	return npmrcPath;
};

const removeTempFile = (filePath) => {
	try {
		if (filePath && fs.existsSync(filePath)) {
			fs.unlinkSync(filePath);
		}
	} catch (error) {
		logger.Debug(`[pull] Could not remove temp npmrc: ${error.message}`);
	}
};

const installMcpPackage = (credentials, version, cliRoot = resolveCliRoot()) => {
	const spec = version ? `${credentials.package}@${version}` : `${credentials.package}@${credentials.tag}`;
	const npmrcPath = writeTempNpmrc(credentials);

	try {
		execFileSync(
			process.platform === 'win32' ? 'npm.cmd' : 'npm',
			['install', spec, '--no-save', '--userconfig', npmrcPath],
			{
				cwd: cliRoot,
				stdio: 'inherit',
				env: process.env
			}
		);
		return true;
	} catch (error) {
		logger.Warn(`[pull] MCP install failed: ${error.message}`, { exit: false });
		return false;
	} finally {
		removeTempFile(npmrcPath);
	}
};

const isAffirmative = (answer) => /^y(es)?$/i.test(String(answer || '').trim());

/**
 * Project-local IDE configs that should contain the Siteglide MCP server entry.
 * @param {string} rootPath
 */
const getProjectMcpTargets = (rootPath) => getRegistryTargets(rootPath).filter((target) => {
	return target.configPath.startsWith(rootPath);
});

const readMcpConfigObject = (filePath) => {
	if (!fs.existsSync(filePath)) {
		return null;
	}
	try {
		const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
		if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
			return parsed;
		}
	} catch (error) {
		return null;
	}
	return null;
};

/**
 * @returns {{ configured: boolean, paths: string[], missing: string[] }}
 */
const getMcpConfigStatus = (rootPath = process.cwd()) => {
	const targets = getProjectMcpTargets(rootPath);
	const paths = [];
	const missing = [];

	for (let i = 0; i < targets.length; i++) {
		const target = targets[i];
		const config = readMcpConfigObject(target.configPath);
		if (!config) {
			missing.push(target.configPath);
			continue;
		}

		const servers = config[target.serversKey];
		if (servers && typeof servers === 'object' && !Array.isArray(servers) && servers[SERVER_NAME]) {
			paths.push(target.configPath);
		} else {
			missing.push(target.configPath);
		}
	}

	return {
		configured: paths.length > 0,
		paths,
		missing
	};
};

/**
 * Alpha-gated MCP setup on pull:
 * - Requires ./.siteglide/alpha.json with npm token
 * - Ensures MCP package is installed and IDE configs exist
 * - Offers upgrade when MCP is already configured and a newer version exists
 *
 * @param {{ rootPath?: string, homedir?: string, interactive?: boolean }} [opts]
 */
const ensureMcpOnPull = async (opts = {}) => {
	const rootPath = opts.rootPath || process.cwd();
	const homedir = opts.homedir || os.homedir();
	const interactive = opts.interactive !== false;
	const credentials = readAlphaCredentials(rootPath);

	if (!credentials) {
		logger.Debug(`[pull] Skipping MCP setup — create ${ALPHA_RELATIVE_PATH} with npm credentials for alpha access`);
		return {
			skipped: true,
			reason: 'missing-alpha-credentials'
		};
	}

	const cliRoot = resolveCliRoot();
	let installedVersion = resolveInstalledMcpVersion(cliRoot);
	const configStatus = getMcpConfigStatus(rootPath);
	const published = await fetchPublishedMcpVersions(credentials);
	const latestVersion = published ? pickLatestPublishedVersion(published, credentials.tag) : null;

	if (!installedVersion) {
		if (latestVersion) {
			logger.Info(`[pull] Siteglide MCP is not installed (latest ${credentials.tag}: ${latestVersion})`);
			if (interactive) {
				const answer = await Confirm(`Install ${credentials.package}@${latestVersion}? (y/N) `);
				if (isAffirmative(answer)) {
					if (installMcpPackage(credentials, latestVersion, cliRoot)) {
						installedVersion = resolveInstalledMcpVersion(cliRoot);
					}
				}
			}
		} else {
			logger.Warn('[pull] Siteglide MCP is not installed and registry versions could not be read', { exit: false });
		}
	} else if (
		configStatus.configured &&
		latestVersion &&
		semver.valid(installedVersion) &&
		semver.valid(latestVersion) &&
		semver.gt(latestVersion, installedVersion)
	) {
		logger.Info(`[pull] Siteglide MCP ${installedVersion} installed; ${credentials.tag} latest is ${latestVersion}`);
		if (interactive) {
			const answer = await Confirm(`Upgrade Siteglide MCP to ${latestVersion}? (y/N) `);
			if (isAffirmative(answer)) {
				if (installMcpPackage(credentials, latestVersion, cliRoot)) {
					installedVersion = resolveInstalledMcpVersion(cliRoot);
					logger.Info(`[pull] Siteglide MCP upgraded to ${installedVersion}`);
				}
			}
		}
	} else if (installedVersion) {
		logger.Debug(`[pull] Siteglide MCP ${installedVersion} installed`);
	}

	if (!resolveInstalledMcpVersion(cliRoot)) {
		logger.Warn('[pull] Siteglide MCP is unavailable — IDE registration skipped', { exit: false });
		return {
			skipped: true,
			reason: 'mcp-not-installed',
			installedVersion,
			latestVersion
		};
	}

	const registration = ensureMcpRegistered({ rootPath, homedir });
	ensureMcpIdeRules({ rootPath });
	const afterConfig = getMcpConfigStatus(rootPath);

	if (afterConfig.configured) {
		logger.Info(`[pull] Siteglide MCP configured (${installedVersion || 'unknown'})`);
	} else if (afterConfig.missing.length > 0) {
		logger.Warn(`[pull] Siteglide MCP registration incomplete for: ${afterConfig.missing.join(', ')}`, { exit: false });
	}

	return {
		skipped: false,
		installedVersion: installedVersion || resolveInstalledMcpVersion(cliRoot),
		latestVersion,
		configStatus: afterConfig,
		registration
	};
};

module.exports = {
	ALPHA_RELATIVE_PATH,
	DEFAULT_PACKAGE,
	DEFAULT_REGISTRY,
	DEFAULT_TAG,
	readAlphaCredentials,
	hasAlphaCredentials,
	resolveInstalledMcpVersion,
	fetchPublishedMcpVersions,
	getMcpConfigStatus,
	installMcpPackage,
	ensureMcpOnPull
};
