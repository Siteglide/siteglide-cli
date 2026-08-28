const fs = require('fs'),
	os = require('os'),
	path = require('path'),
	{ execFileSync, execFile } = require('child_process'),
	{ promisify } = require('util'),
	fetch = require('node-fetch'),
	semver = require('semver'),
	logger = require('./logger'),
	Confirm = require('./confirm'),
	// {
	// 	probeGithubMcpRepo,
	// 	attemptGithubMcpInstall
	// } = require('./mcpGithub'),
	{
		SERVER_NAME,
		ensureMcpRegistered,
		ensureMcpIdeRules,
		getRegistryTargets
	} = require('./ai');

const execFileAsync = promisify(execFile);

/** Max time to wait for require.resolve of @siteglide/siteglide-mcp after install. */
const RESOLVE_MCP_VERSION_TIMEOUT_MS = 5000;

/** npm org scope for Siteglide packages (not the package name). */
const NPM_ORG_SCOPE = '@siteglide';
/** MCP package name within the @siteglide org. */
const MCP_PACKAGE_NAME = 'siteglide-mcp';
/** Full scoped npm package: org/package-name */
const DEFAULT_PACKAGE = `${NPM_ORG_SCOPE}/${MCP_PACKAGE_NAME}`;
const DEFAULT_REGISTRY = 'https://registry.npmjs.org/';
const DEFAULT_TAG = 'alpha';

const resolveCliRoot = () => path.resolve(__dirname, '..');

/** @param {string} step @param {number} startedAt @param {string} [detail] */
const logMcpStep = (step, startedAt, detail) => {
	const ms = Date.now() - startedAt;
	const suffix = detail ? ` — ${detail}` : '';
	const message = `[pull][mcp] ${step} (${ms}ms)${suffix}`;
	if (ms >= 30000) {
		logger.Warn(`${message} — step exceeded 30s`, { exit: false });
	} else {
		logger.Info(message);
	}
};

const logMcpStepStart = (step) => {
	logger.Info(`[pull][mcp] ${step}…`);
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
 * Same as resolveInstalledMcpVersion but in a child process so a hung
 * require.resolve cannot block pull indefinitely.
 *
 * @param {string} [cliRoot]
 * @param {number} [timeoutMs]
 * @returns {Promise<{ version: string | null, timedOut: boolean }>}
 */
const resolveInstalledMcpVersionWithTimeout = async (
	cliRoot = resolveCliRoot(),
	timeoutMs = RESOLVE_MCP_VERSION_TIMEOUT_MS
) => {
	const payload = JSON.stringify({ packageName: DEFAULT_PACKAGE, cliRoot });
	const script = [
		'const fs = require("fs");',
		'const data = JSON.parse(process.argv[1]);',
		'try {',
		'  const pkgPath = require.resolve(data.packageName + "/package.json", { paths: [data.cliRoot] });',
		'  process.stdout.write(JSON.parse(fs.readFileSync(pkgPath, "utf8")).version || "");',
		'} catch (e) {',
		'  process.stdout.write("");',
		'}'
	].join('');

	try {
		const { stdout } = await execFileAsync(
			process.execPath,
			['-e', script, payload],
			{
				timeout: timeoutMs,
				encoding: 'utf8',
				windowsHide: true
			}
		);
		const version = String(stdout || '').trim();
		return {
			version: version || null,
			timedOut: false
		};
	} catch (error) {
		if (error.killed || error.code === 'ETIMEDOUT') {
			return {
				version: null,
				timedOut: true
			};
		}
		logger.Debug(`[pull] resolve installed MCP version failed: ${error.message}`);
		return {
			version: null,
			timedOut: false
		};
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

/**
 * True when a published npm version exists and installed copy is missing or older.
 *
 * @param {string | null} installedVersion
 * @param {string | null} latestVersion
 * @returns {boolean}
 */
const needsMcpInstall = (installedVersion, latestVersion) => {
	if (!latestVersion || !semver.valid(latestVersion)) {
		return false;
	}
	if (!installedVersion) {
		return true;
	}
	if (semver.valid(installedVersion) && semver.gt(latestVersion, installedVersion)) {
		return true;
	}
	return false;
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
				shell: true,
				env: process.env
			}
		);
		return true;
	} catch (error) {
		logger.Warn(`[pull] MCP install failed: ${error.message}`, { exit: false });
		return false;
	}
};

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
 * MCP setup on pull:
 * - Checks npm for the published @alpha version
 * - Probes GitHub access to Siteglide/Siteglide-MCP as install fallback
 * - Asks before install only when that version is not already installed
 * - Registers Siteglide MCP in IDE configs when the package is present
 *
 * @param {{ rootPath?: string, homedir?: string, interactive?: boolean, cliRoot?: string }} [opts]
 */
const ensureMcpOnPull = async (opts = {}) => {
	// const overallStart = Date.now();
	const rootPath = opts.rootPath || process.cwd();
	const homedir = opts.homedir || os.homedir();
	const interactive = opts.interactive !== false;
	const cliRoot = opts.cliRoot || resolveCliRoot();

	logger.Info('[pull] AI: Starting MCP check');

	// let stepStart = Date.now();
	// logMcpStepStart('resolve installed version');
	let installedVersion = resolveInstalledMcpVersion(cliRoot);
	// logMcpStep('resolve installed version', stepStart, installedVersion || 'not found');

	// stepStart = Date.now();
	// logMcpStepStart('read IDE MCP config status');
	// const configStatus = getMcpConfigStatus(rootPath);
	// logMcpStep(
	// 	'read IDE MCP config status',
	// 	stepStart,
	// 	configStatus.configured ? `configured (${configStatus.paths.length} file(s))` : 'not configured'
	// );

	// stepStart = Date.now();
	// logMcpStepStart('fetch published npm versions');
	const published = await fetchPublishedMcpVersions();
	const latestVersion = pickLatestPublishedVersion(published, DEFAULT_TAG);
	// logMcpStep(
	// 	'fetch published npm versions',
	// 	stepStart,
	// 	latestVersion ? `${DEFAULT_TAG} latest: ${latestVersion}` : 'none on npm'
	// );

	// stepStart = Date.now();
	// logMcpStepStart('probe GitHub MCP repo access');
	// const githubProbe = await probeGithubMcpRepo();
	// logMcpStep(
	// 	'probe GitHub MCP repo access',
	// 	stepStart,
	// 	githubProbe.accessible ? `accessible (${githubProbe.branches.length} branch(es))` : 'not accessible'
	// );

	if (latestVersion && needsMcpInstall(installedVersion, latestVersion)) {
		if (interactive) {
			// logMcpStepStart('waiting for MCP install confirmation');
			// stepStart = Date.now();
			const answer = await Confirm(`Attempt Siteglide MCP install from ${DEFAULT_PACKAGE}@${latestVersion} on npm? (Y/n) `);
			// logMcpStep('MCP install confirmation', stepStart, answer === 'Y' ? 'yes' : 'no');
			if (answer === 'Y') {
				// stepStart = Date.now();
				// logMcpStepStart(`npm install ${DEFAULT_PACKAGE}@${latestVersion}`);
				if (installMcpPackage(latestVersion, cliRoot)) {
					installedVersion = resolveInstalledMcpVersion(cliRoot);
					// logMcpStep('npm install', stepStart, installedVersion || 'installed');
					logger.Info(`[pull] AI: siteglide-mcp ${installedVersion} installed`);
				} else {
					// logMcpStep('npm install', stepStart, 'failed');
					logger.Info('[pull] AI: siteglide-mcp install failed');
				}
			} else {
				logger.Info('[pull] AI: Skipping siteglide-mcp install');
			}
		} else {
			logger.Debug('[pull] AI: Skipping siteglide-mcp install (non-interactive)');
		}
	} else if (latestVersion && installedVersion) {
		logger.Debug(`[pull] Siteglide MCP ${installedVersion} is up to date (${DEFAULT_TAG} latest: ${latestVersion})`);
	}

	if (!installedVersion) {
		installedVersion = resolveInstalledMcpVersion(cliRoot);
	}

	let silentSkipNoSource = false;

	// if (!installedVersion) {
	// 	if (githubProbe.accessible) {
	// 		const githubInstall = await attemptGithubMcpInstall({
	// 			interactive,
	// 			cliRoot,
	// 			githubProbe,
	// 			logStepStart: logMcpStepStart,
	// 			logStep: logMcpStep
	// 		});
	// 		if (githubInstall.installed) {
	// 			installedVersion = resolveInstalledMcpVersion(cliRoot);
	// 		}
	// 	} else {
	// 		logger.Debug('[pull] Siteglide MCP GitHub repo not accessible — skipping GitHub install');
	// 		silentSkipNoSource = !latestVersion;
	// 	}
	// }

	// stepStart = Date.now();
	// logMcpStepStart('re-resolve installed version');
	const reResolved = await resolveInstalledMcpVersionWithTimeout(cliRoot);
	if (reResolved.timedOut) {
		// logMcpStep(
		// 	're-resolve installed version',
		// 	stepStart,
		// 	`timed out after ${RESOLVE_MCP_VERSION_TIMEOUT_MS}ms`
		// );
		logger.Warn(
			`[pull] Siteglide MCP version check timed out after ${RESOLVE_MCP_VERSION_TIMEOUT_MS / 1000}s — skipping MCP setup`,
			{ exit: false }
		);
		// logMcpStep('MCP check complete (skipped)', overallStart, 're-resolve timed out');
		return {
			skipped: true,
			reason: 're-resolve-timeout',
			installedVersion: null,
			latestVersion
		};
	}
	installedVersion = reResolved.version;
	// logMcpStep('re-resolve installed version', stepStart, installedVersion || 'not found');

	if (!installedVersion) {
		if (silentSkipNoSource) {
			logger.Debug('[pull] AI: siteglide-mcp install skipped — no npm or GitHub source available');
			// logMcpStep('MCP check complete (skipped)', overallStart, 'no install source');
			return {
				skipped: true,
				reason: 'no-install-source',
				installedVersion,
				latestVersion
			};
		}
		logger.Warn('[pull] AI: siteglide-mcp is unavailable — IDE registration skipped', { exit: false });
		// logMcpStep('MCP check complete (skipped)', overallStart, 'mcp not installed');
		return {
			skipped: true,
			reason: 'mcp-not-installed',
			installedVersion,
			latestVersion
		};
	}

	// stepStart = Date.now();
	// logMcpStepStart('register MCP in IDE configs');
	const registration = ensureMcpRegistered({ rootPath, homedir });
	// logMcpStep(
	// 	'register MCP in IDE configs',
	// 	stepStart,
	// 	`added: ${registration.added.length}, updated: ${registration.updated.length}, unchanged: ${registration.unchanged.length}`
	// );

	// stepStart = Date.now();
	// logMcpStepStart('write MCP IDE agent rules');
	ensureMcpIdeRules({ rootPath });
	// logMcpStep('write MCP IDE agent rules', stepStart, 'done');

	// stepStart = Date.now();
	// logMcpStepStart('verify IDE MCP config status');
	const afterConfig = getMcpConfigStatus(rootPath);
	// logMcpStep(
	// 	'verify IDE MCP config status',
	// 	stepStart,
	// 	afterConfig.configured ? `configured (${afterConfig.paths.length} file(s))` : 'incomplete'
	// );

	if (afterConfig.configured) {
		logger.Info(`[pull] AI: siteglide-mcp configured (${installedVersion})`);
	} else if (afterConfig.missing.length > 0) {
		logger.Warn(`[pull] AI: siteglide-mcp registration incomplete for: ${afterConfig.missing.join(', ')}`, { exit: false });
	}

	// logMcpStep('MCP check complete', overallStart, installedVersion);

	return {
		skipped: false,
		installedVersion,
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
	RESOLVE_MCP_VERSION_TIMEOUT_MS,
	resolveInstalledMcpVersion,
	resolveInstalledMcpVersionWithTimeout,
	fetchPublishedMcpVersions,
	pickLatestPublishedVersion,
	getMcpConfigStatus,
	installMcpPackage,
	needsMcpInstall,
	ensureMcpOnPull
};
