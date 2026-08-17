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

/** npm org scope for Siteglide packages (not the package name). */
const NPM_ORG_SCOPE = '@siteglide';
/** MCP package name within the @siteglide org. */
const MCP_PACKAGE_NAME = 'siteglide-mcp';
/** Full scoped npm package: org/package-name */
const DEFAULT_PACKAGE = `${NPM_ORG_SCOPE}/${MCP_PACKAGE_NAME}`;
const DEFAULT_REGISTRY = 'https://registry.npmjs.org/';
const DEFAULT_TAG = 'alpha';

const resolveCliRoot = () => path.resolve(__dirname, '..');

const isCliLocalMcpDependency = (cliRoot = resolveCliRoot()) => {
	try {
		const cliPkg = JSON.parse(fs.readFileSync(path.join(cliRoot, 'package.json'), 'utf8'));
		const dep = cliPkg.dependencies && cliPkg.dependencies[DEFAULT_PACKAGE];
		if (typeof dep !== 'string') {
			return false;
		}
		return dep.indexOf('file:') === 0 || dep.indexOf('link:') === 0;
	} catch (error) {
		return false;
	}
};

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
 * @param {string} [cliRoot]
 * @returns {{ version: string, resolved: string | null, linked: boolean } | null}
 */
const resolveLocalMcpFromNpmList = (cliRoot = resolveCliRoot()) => {
	try {
		const output = execFileSync(
			process.platform === 'win32' ? 'npm.cmd' : 'npm',
			['list', DEFAULT_PACKAGE, '--json', '--depth=0'],
			{
				cwd: cliRoot,
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'ignore']
			}
		);
		const data = JSON.parse(output);
		const dep = data.dependencies && data.dependencies[DEFAULT_PACKAGE];
		if (!dep || typeof dep.version !== 'string') {
			return null;
		}
		const resolved = typeof dep.resolved === 'string' ? dep.resolved : null;
		return {
			version: dep.version,
			resolved,
			linked: Boolean(resolved && (resolved.indexOf('file:') === 0 || resolved.indexOf('link:') === 0))
		};
	} catch (error) {
		logger.Debug(`[pull] npm list ${DEFAULT_PACKAGE} failed: ${error.message}`);
		return null;
	}
};

/**
 * @returns {Promise<{ tagVersion: string | null, versions: string[], distTags: Record<string, string> } | null>}
 */
const fetchPublishedMcpVersions = async (
	packageName = DEFAULT_PACKAGE,
	registry = DEFAULT_REGISTRY,
	tag = DEFAULT_TAG
) => {
	const url = registryPackageUrl(registry, packageName);
	try {
		const response = await fetch(url, {
			headers: {
				Accept: 'application/json'
			}
		});

		if (response.status === 404) {
			logger.Debug(`[pull] ${packageName} is not published on ${registry}`);
			return null;
		}

		if (!response.ok) {
			logger.Debug(`[pull] MCP registry lookup failed (${response.status}) for ${packageName}`);
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
			tagVersion: typeof distTags[tag] === 'string' ? distTags[tag] : null,
			versions,
			distTags
		};
	} catch (error) {
		logger.Debug(`[pull] MCP registry lookup error: ${error.message}`);
		return null;
	}
};

const pickLatestPublishedVersion = (published, tag = DEFAULT_TAG) => {
	if (!published) {
		return null;
	}
	if (published.tagVersion && semver.valid(published.tagVersion)) {
		return published.tagVersion;
	}

	const stable = published.versions
		.filter((version) => semver.valid(version))
		.sort(semver.rcompare);

	return stable[0] || null;
};

const installMcpPackage = (version, cliRoot = resolveCliRoot()) => {
	const spec = `${DEFAULT_PACKAGE}@${version}`;
	try {
		execFileSync(
			process.platform === 'win32' ? 'npm.cmd' : 'npm',
			['install', spec, '--no-save'],
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

const formatLocalMcpLabel = (localInstall) => {
	if (!localInstall) {
		return DEFAULT_PACKAGE;
	}
	if (localInstall.linked && localInstall.resolved) {
		return `${DEFAULT_PACKAGE}@${localInstall.version} (${localInstall.resolved})`;
	}
	return `${DEFAULT_PACKAGE}@${localInstall.version}`;
};

/**
 * MCP setup on pull:
 * - Checks the public npm registry for siteglide-mcp under the @siteglide org (alpha tag)
 * - Offers install/upgrade when a published version exists
 * - When IDE mcp.json lacks siteglide, warns if npm is empty and offers local test registration
 *
 * @param {{ rootPath?: string, homedir?: string, interactive?: boolean }} [opts]
 */
const ensureMcpOnPull = async (opts = {}) => {
	const rootPath = opts.rootPath || process.cwd();
	const homedir = opts.homedir || os.homedir();
	const interactive = opts.interactive !== false;
	const cliRoot = resolveCliRoot();

	let installedVersion = resolveInstalledMcpVersion(cliRoot);
	const localInstall = resolveLocalMcpFromNpmList(cliRoot);
	const configStatus = getMcpConfigStatus(rootPath);
	const published = await fetchPublishedMcpVersions();
	const latestVersion = pickLatestPublishedVersion(published, DEFAULT_TAG);

	if (!installedVersion && latestVersion) {
		logger.Info(`[pull] Siteglide MCP is not installed (${DEFAULT_TAG} on npm: ${latestVersion})`);
		if (interactive) {
			const answer = await Confirm(`Install ${DEFAULT_PACKAGE}@${latestVersion} from npm? (y/N) `);
			if (isAffirmative(answer)) {
				if (installMcpPackage(latestVersion, cliRoot)) {
					installedVersion = resolveInstalledMcpVersion(cliRoot);
				}
			}
		}
	} else if (
		installedVersion &&
		latestVersion &&
		semver.valid(installedVersion) &&
		semver.valid(latestVersion) &&
		semver.gt(latestVersion, installedVersion)
	) {
		logger.Info(`[pull] Siteglide MCP ${installedVersion} installed; ${DEFAULT_TAG} latest on npm is ${latestVersion}`);
		if (interactive) {
			const answer = await Confirm(`Upgrade Siteglide MCP to ${latestVersion}? (y/N) `);
			if (isAffirmative(answer)) {
				if (installMcpPackage(latestVersion, cliRoot)) {
					installedVersion = resolveInstalledMcpVersion(cliRoot);
					logger.Info(`[pull] Siteglide MCP upgraded to ${installedVersion}`);
				}
			}
		}
	} else if (installedVersion) {
		logger.Debug(`[pull] Siteglide MCP ${installedVersion} installed`);
	}

	installedVersion = resolveInstalledMcpVersion(cliRoot);
	const hasInstalledMcp = Boolean(installedVersion);

	if (!configStatus.configured) {
		if (!latestVersion && !hasInstalledMcp) {
			logger.Warn(
				`[pull] ${MCP_PACKAGE_NAME} is not published on npm under ${NPM_ORG_SCOPE} yet — Siteglide MCP for IDE agents is coming soon.`,
				{ exit: false }
			);
			return {
				skipped: true,
				reason: 'not-published',
				installedVersion,
				latestVersion
			};
		}

		const localTestInstall = Boolean(
			hasInstalledMcp && (
				!latestVersion ||
				(localInstall && localInstall.linked) ||
				isCliLocalMcpDependency(cliRoot)
			)
		);

		if (hasInstalledMcp && localTestInstall) {
			const label = formatLocalMcpLabel(
				localInstall || { version: installedVersion, resolved: null, linked: isCliLocalMcpDependency(cliRoot) }
			);
			if (interactive) {
				const answer = await Confirm(
					`Add local test version ${label} to your IDE MCP config (mcp.json)? (y/N) `
				);
				if (!isAffirmative(answer)) {
					logger.Info('[pull] Skipping Siteglide MCP IDE registration');
					return {
						skipped: true,
						reason: 'user-declined-registration',
						installedVersion,
						latestVersion,
						configStatus
					};
				}
			} else {
				logger.Debug('[pull] Local Siteglide MCP install present; IDE registration skipped (non-interactive)');
				return {
					skipped: true,
					reason: 'non-interactive-registration',
					installedVersion,
					latestVersion,
					configStatus
				};
			}
		}
	}

	if (!hasInstalledMcp) {
		if (!latestVersion) {
			return {
				skipped: true,
				reason: 'not-published',
				installedVersion,
				latestVersion
			};
		}
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
	NPM_ORG_SCOPE,
	MCP_PACKAGE_NAME,
	DEFAULT_PACKAGE,
	DEFAULT_REGISTRY,
	DEFAULT_TAG,
	resolveInstalledMcpVersion,
	resolveLocalMcpFromNpmList,
	fetchPublishedMcpVersions,
	pickLatestPublishedVersion,
	getMcpConfigStatus,
	installMcpPackage,
	isCliLocalMcpDependency,
	ensureMcpOnPull
};
